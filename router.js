
// BASE SETUP
// ==============================================

var args            = require('minimist')(process.argv.slice(2));
var express         = require('express');
var cookieParser    = require('cookie-parser');
var bodyParser      = require('body-parser');
var session         = require('express-session');
var passport        = require('passport');
var SteamStrategy   = require('passport-steam').Strategy;
var MongoClient     = require('mongodb').MongoClient;
var baseUri         = args.d ? 'http://www.steamoverload.com' : 'http://localhost:3000';
var key             = args.k;
var sessionSecret   = args.s;
var cookieSecret    = args.c;
var app             = express();
var router          = express.Router();
var debugging       = args.d;

app.use(bodyParser.urlencoded({ "extended": false }));
app.use(bodyParser.json());
app.use(cookieParser(cookieSecret));
app.use(session({ "secret": sessionSecret, "saveUninitialized": true, "resave": true }));


// AUTHENTICATION MIDDLEWARE
// ==============================================

app.use(passport.initialize());
app.use(passport.session());

var isAuthenticated = function (req, res, next) {
    if (req.isAuthenticated()) {
        return next(); 
    }
    else {
        res.status(401).send({ "error": true, "message": 'Authentication required' });
    }
};

passport.serializeUser(function (user, done) {
    done(null, user);
});

passport.deserializeUser(function (obj, done) {
    done(null, obj);
});

passport.use(new SteamStrategy({
        "returnURL": baseUri + '/auth/steam/return',
        "realm": baseUri,
        "apiKey": key
    },
    function (identifier, profile, done) {
        profile.identifier = identifier;
        return done(null, profile);
    }
));

app.get("/auth/steam", passport.authenticate("steam", { failureRedirect: "/login" }), function (req, res) {
    res.redirect("/");
});

app.get("/auth/steam/return", passport.authenticate("steam", { failureRedirect: "/login" }), function (req, res) {
    res.redirect("/");
});


// STATIC FILE SERVER
// ==============================================

app.use('/static', express.static('public'));


// ROUTES
// ==============================================

router.use(function (req, res, next) {
    console.log(req.method, req.url);
    next();
});


router.get('/*', function (req, res, next) {
    if (req.headers.host.match(/^www/) === null ) {
        if (!debugging) {
            res.redirect(301, 'http://www.' + req.headers.host + req.url);
        }
        else {
            return next();
        }
    }
    else {
        return next();
    }
});

router.get('/api/summary/:category', function (req, res) {
    var callback = function (error, games) {
        if (error) {
            res.status(403).send({ "error": true, "message": error });
        }
        else {
            res.send(games);
        }
    };

    if (req.params.category === 'latest') {
        module.exports.library.loadLatestCompletions(callback);
    }
    else if (req.params.category === 'top') {
        module.exports.library.loadMostCompletedGames(callback);
    }
});

router.get('/*', function (req, res) {
    res.sendfile('index.html', { "root": "./views" });
});

app.use('/', router);


/*

        app.get("/user/*", function (req, res) {
            var steam_id = req.url.replace("/user/", "");
            var read_only = true;
            var active_user_id = null;

            module.exports.library.load(db, steam_id, function (error, library) {
                if (req.isAuthenticated()) {
                    active_user_id = req.user.identifier.replace("http://steamcommunity.com/openid/id/", "");
                    if (steam_id === active_user_id) {
                        read_only = false;
                    }
                }

                module.exports.user.load(db, steam_id, function (error, user) {
                    if (!error) {
                        res.render("account", { 
                            steam_id: active_user_id, 
                            user: req.user, 
                            player: user,
                            library: library, 
                            slim_header: true, 
                            read_only: read_only,
                            list_view: req.cookies.view === "list" || !req.cookies.view,
                            big_list_view: req.cookies.view === "big-list",
                            tile_view: req.cookies.view === "tile"
                        });
                    }
                });
            });
        });

        app.post("/api/complete", ensure_authenticated, function (req, res) {
            var app_id = parseInt(req.body.app_id);
            var steam_id = req.user.identifier.replace("http://steamcommunity.com/openid/id/", "");
            module.exports.library.complete_game(db, steam_id, app_id);
            res.send("ok");
        });

        app.post("/api/uncomplete", ensure_authenticated, function (req, res) {
            var app_id = parseInt(req.body.app_id);
            var steam_id = req.user.identifier.replace("http://steamcommunity.com/openid/id/", "");
            module.exports.library.uncomplete_game(db, steam_id, app_id);
            res.send("ok");
        });

        app.get("/login", function(req, res){
            res.render("login", { user: req.user });
        });

        // Use passport.authenticate() as route middleware to authenticate the request.
        app.get("/auth/steam", passport.authenticate("steam", { failureRedirect: "/login" }), function (req, res) {
            res.redirect("/");
        });

        // Use passport.authenticate() as route middleware to authenticate the request.
        // If authentication fails, the user will be redirected back to the login page.
        // Otherwise, the primary route function function will be called.
        app.get("/auth/steam/return", passport.authenticate("steam", { failureRedirect: "/login" }), function (req, res) {
            res.redirect("/");
        });

        app.get("/logout", function (req, res) {
            req.logout();
            res.redirect("/");
        });

        app.get("/set/view/*", function (req, res) {
            res.cookie("view", req.url.replace("/set/view/", ""));
            res.redirect("back");
        });
    });

    // Begin listening on port 3000 for incoming HTTP reuqests.
    app.listen(3000);
};

*/

// MODULE FUNCTIONS
// ==============================================

var listen = function () {
    MongoClient.connect("mongodb://127.0.0.1:27017/steamoverload", function(error, db) {
        if (error) {
            console.log('ERROR: Could not establish a connection to mongodb.');
        }
        else {
            console.log('INFO:  Established connection to mongodb.');
            module.exports.library.db = db;
            module.exports.user.db = db;
            app.listen(3000);
        }
    });
};

module.exports.library = null;
module.exports.listen = listen;
module.exports.user = null;