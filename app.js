var express = require('express');
var passport = require('passport');
var util = require('util');
var SteamStrategy = require('passport-steam').Strategy;
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var session = require('express-session');
var api = require('./api');
var MongoClient = require('mongodb').MongoClient;
var sugar = require('sugar');

// Setup PassportJS strategy.
passport.serializeUser(function (user, done) {
    done(null, user);
});

passport.deserializeUser(function (obj, done) {
    done(null, obj);
});

passport.use(new SteamStrategy({
        returnURL: 'http://localhost:3000/auth/steam/return',
        realm: 'http://localhost:3000',
        apiKey: process.argv[2]
    },
    function (identifier, profile, done) {
        profile.identifier = identifier;
        return done(null, profile);
    }
));

// Initialise Express and its middleware.
var app = express();
app.set('view engine', 'html');
app.engine('html', require('hbs').__express);
app.use('/static', express.static('static'));
app.use(cookieParser());
app.use(bodyParser());
app.use(session({ secret: 'keyboard cat' }));
app.use(passport.initialize());
app.use(passport.session());

// Initialise Handlebars
var hbs = require('hbs');
hbs.registerPartials('views/partials');

// Route middleware to ensure the user has authenticated via Steam.
var ensureAuthenticated = function (req, res, next) {
    if (req.isAuthenticated()) { 
        return next(); 
    }
  
    res.redirect('/');
}

// Open the connection to the database and setup the Express routes.
MongoClient.connect('mongodb://127.0.0.1:27017/steamoverload', function(err, db) {

    // Fetch and cache the user's library from Steam.
    var cacheLibrary = function (steam_id, callback) {
        var method = api.functions.GetOwnedGames
        var args = [{ key: "steamid", value: steam_id }, { key: "include_appinfo", value: 1 }];

        api.call(method, args, function (error, result) {
            if (!error) {
                var criteria = { steam_id: steam_id };
                var collection = db.collection('libraries');
                var library = {
                    steam_id: steam_id,
                    games: result.games,
                    game_count: result.game_count,
                    cached_at: Date.now()
                };

                for (var i = 0; i < library.games.length; i++) {
                    if (!library.games[i].img_logo_url) {
                        library.games.removeAt(i);
                        library.game_count -= 1;
                    }
                }

                collection.update(criteria, { $set: library }, { upsert: true }, function (error) {
                    if (!error) {
                        loadLibrary(steam_id, callback);
                    }
                    else {
                        callback('Failed to update cache for id ' + steam_id, null);
                    }
                });
            }
            else {
                callback('Failed to fetch library for id ' + steam_id, null);
            }
        });
    };

    var loadCompletedGames = function (steam_id, callback) {
        var collection = db.collection('completed_games');
        var criteria = { steam_id: steam_id };

        collection.find(criteria).toArray(function (error, results) {
            if (!error) {
                callback(null, results);
            }
            else {
                callback('Failed to fetch the list of completed games for ' + steam_id, null);
            }
        });
    };
    
    // Loads the user's library from the cache in the database.
    var loadLibrary = function (steam_id, callback) {
        var collection = db.collection('libraries');
        var criteria = { steam_id: steam_id };

        collection.findOne(criteria, function (error, document) {
            if (!document || document.cached_at < Date.now() - 300000) {
                cacheLibrary(steam_id, callback);
            }
            else {
                loadCompletedGames(steam_id, function (error, completed_games) {
                    if (!error && completed_games && completed_games.length > 0) {
                        for (var game_index = 0; game_index < document.games.length; game_index++) {
                            for (var completed_game_index = 0; completed_game_index < completed_games.length; completed_game_index++) {
                                if (document.games[game_index].appid == completed_games[completed_game_index].appid) {
                                    document.games[game_index].completed = true;
                                    break;
                                }
                            }
                        }
                    }

                    callback(null, document);
                });
            }
        });
    };

    var completeGame = function (steam_id, app_id) {
        var collection = db.collection('completed_games');
        var object = { steam_id: steam_id, appid: app_id };
        collection.update(object, { $set: object }, { upsert: true }, function (error) {
            console.log(error);
        });
    };

    var uncompleteGame = function (steam_id, app_id) {
        var collection = db.collection('completed_games');
        var object = { steam_id: steam_id, appid: app_id };
        collection.remove(object, {}, function () {
        });
    };

    app.get('/', function (req, res) {
        res.render('index', { user: req.user });
    });

    app.get('/library', ensureAuthenticated, function (req, res) {
        var steam_id = req.user.identifier.replace('http://steamcommunity.com/openid/id/', '');
        loadLibrary(steam_id, function (error, library) {
            res.render('account', { user: req.user, library: library, slim_header: true });
        });
    });

    app.post('/api/complete', ensureAuthenticated, function (req, res) {
        var app_id = req.body.app_id;
        var steam_id = req.user.identifier.replace('http://steamcommunity.com/openid/id/', '');
        completeGame(steam_id, app_id);
        res.send('ok');
    });

    app.post('/api/uncomplete', ensureAuthenticated, function (req, res) {
        var app_id = req.body.app_id;
        var steam_id = req.user.identifier.replace('http://steamcommunity.com/openid/id/', '');
        uncompleteGame(steam_id, app_id);
        res.send('ok');
    });

    app.get('/login', function(req, res){
        res.render('login', { user: req.user });
    });

    // Use passport.authenticate() as route middleware to authenticate the request.
    app.get('/auth/steam', passport.authenticate('steam', { failureRedirect: '/login' }), function (req, res) {
        res.redirect('/');
    });

    // Use passport.authenticate() as route middleware to authenticate the request.
    // If authentication fails, the user will be redirected back to the login page.
    // Otherwise, the primary route function function will be called.
    app.get('/auth/steam/return', passport.authenticate('steam', { failureRedirect: '/login' }), function (req, res) {
        res.redirect('/');
    });

    app.get('/logout', function (req, res){
        req.logout();
        res.redirect('/');
    });
});

// Initialise the Steam API module.
api.initialise(process.argv[2]);
console.log('[i] Initialised API');

// Begin listening on port 3000 for incoming HTTP reuqests.
app.listen(3000);
console.log('[i] Listening on port 3000');