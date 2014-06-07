"use strict";

var express = require("express");
var passport = require("passport");
var SteamStrategy = require("passport-steam").Strategy;
var cookieParser = require("cookie-parser");
var bodyParser = require("body-parser");
var session = require("express-session");
var api = require("./api");
var MongoClient = require("mongodb").MongoClient;
var base_uri = process.argv.indexOf("debug") === -1 ? "http://www.steamoverload.com" : "http://localhost:3000";
var library = require("./library");
var user = require("./user");

// Setup Sugar.js extension functions.
require("sugar");

// Setup PassportJS strategy.
passport.serializeUser(function (user, done) {
    done(null, user);
});

passport.deserializeUser(function (obj, done) {
    done(null, obj);
});

passport.use(new SteamStrategy({
        returnURL: base_uri + "/auth/steam/return",
        realm: base_uri,
        apiKey: process.argv[2]
    },
    function (identifier, profile, done) {
        profile.identifier = identifier;
        return done(null, profile);
    }
));

// Initialise Express and its middleware.
var app = express();
app.set("view engine", "html");
app.engine("html", require("hbs").__express);
app.use("/static", express.static("static"));
app.use(cookieParser());
app.use(bodyParser());
app.use(session({ secret: "keyboard cat" }));
app.use(passport.initialize());
app.use(passport.session());

// Initialise Handlebars
var hbs = require("hbs");
hbs.registerPartials("views/partials");

// Route middleware to ensure the user has authenticated via Steam.
var ensure_authenticated = function (req, res, next) {
    if (req.isAuthenticated()) {
        return next(); 
    }
  
    res.redirect("/");
};

// Open the connection to the database and setup the Express routes.
MongoClient.connect("mongodb://127.0.0.1:27017/steamoverload", function(err, db) {

    // Force the user on to the www subdomain.
    app.get("/*", function (req, res, next) {
        if (req.headers.host.match(/^www/) === null ) {
            if (process.argv.indexOf("debug") === -1) {
                res.redirect(301, "http://www." + req.headers.host + req.url);
            }
            else {
                return next();
            }
        }
        else {
            return next();
        }
    });

    app.get("/", function (req, res) {
        var active_user_id = null;
        if (req.isAuthenticated()) {
            active_user_id = req.user.identifier.replace("http://steamcommunity.com/openid/id/", "");
        }

        library.load_latest_completions(db, function (error, latest_completions) {
            var users_loaded = 0;
            library.load_most_completed_games(db, function (error, most_completed) {

                latest_completions.forEach(function (game) {
                    user.load(db, game.steam_id, function (error, user) {
                        game.user = user;
                        users_loaded += 1;

                        if (users_loaded === latest_completions.length) {
                            res.render("index", { steam_id: active_user_id, latest_completions: latest_completions, most_completed: most_completed, user: req.user });
                        }
                    });
                });
            });
        });
    });

    app.get("/user/*", function (req, res) {
        var steam_id = req.url.replace("/user/", "");
        var read_only = true;
        var active_user_id = null;

        library.load(db, steam_id, function (error, library) {
            if (req.isAuthenticated()) {
                active_user_id = req.user.identifier.replace("http://steamcommunity.com/openid/id/", "");
                if (steam_id === active_user_id) {
                    read_only = false;
                }
            }

            user.load(db, steam_id, function (error, user) {
                if (!error) {
                    res.render("account", { 
                        steam_id: active_user_id, 
                        user: req.user, 
                        player: user,
                        library: library, 
                        slim_header: true, 
                        read_only: read_only 
                    });
                }
            });
        });
    });

    app.post("/api/complete", ensure_authenticated, function (req, res) {
        var app_id = parseInt(req.body.app_id);
        var steam_id = req.user.identifier.replace("http://steamcommunity.com/openid/id/", "");
        library.complete_game(db, steam_id, app_id);
        res.send("ok");
    });

    app.post("/api/uncomplete", ensure_authenticated, function (req, res) {
        var app_id = parseInt(req.body.app_id);
        var steam_id = req.user.identifier.replace("http://steamcommunity.com/openid/id/", "");
        library.uncomplete_game(db, steam_id, app_id);
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

    app.get("/logout", function (req, res){
        req.logout();
        res.redirect("/");
    });
});

// Initialise the Steam API module.
api.initialise(process.argv[2]);
console.log("[i] Initialised API");

library.api = api;
console.log("[i] Initialised Library module");

user.api = api;
console.log("[i] Initialised User module");

// Begin listening on port 3000 for incoming HTTP reuqests.
app.listen(3000);
console.log("[i] Listening on port 3000");