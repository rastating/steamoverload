
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
var baseUri         = args.d ? 'http://localhost:3000' : 'http://www.steamoverload.com';
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

router.get('/api/profile/:steamid', function (req, res) {
    module.exports.library.load(req.params.steamid, function (error, library) {
        if (error) {
            console.log('INFO   Failed to load library for ' + req.params.steamid + ': ' + error);
        }
        
        module.exports.user.load(req.params.steamid, function (error, user) {
            if (!error) {
                res.send({
                    "user": req.user, 
                    "player": user,
                    "library": library
                });
            }
            else {
                console.log('INFO   Failed to load user ' + req.params.steamid + ': ' + error);
            }
        });
    });
});

router.get('/api/permissions/edit/:steamid', function (req, res) {
    var canEdit = false;
    if (req.isAuthenticated()) {
        canEdit = req.params.steamid == req.user.identifier.replace("http://steamcommunity.com/openid/id/", "");
    }

    res.send({ "hasPermission": canEdit });
});

router.put('/api/session/view/:viewid', function (req, res) {
    res.cookie('view', req.params.viewid);
    req.session.view = req.params.viewid;
    res.send({ "result": 'ok' });
});

router.get('/api/session', function (req, res) {
    var authenticated = req.user !== undefined;
    var id = 0;

    if (authenticated) {
        var id = req.user.identifier.replace('http://steamcommunity.com/openid/id/', '');
    }

    res.send({ 
        "authenticated": authenticated, 
        "view": req.cookies.view || req.session.view,
        "user": {
            "id": id
        }
    });
});

router.delete('/api/session', function (req, res) {
    req.logout();
    res.send({ "result": 'ok' });
});

router.get('/*', function (req, res) {
    res.sendfile('index.html', { "root": "./views" });
});

app.use('/', router);


/*

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