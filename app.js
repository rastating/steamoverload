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

    // Cache the app document for quick access to thumbnails.
    var create_app_document = function (document) {
        db.collection("games").update({ appid: document.appid }, { $set: document }, { upsert: true }, function (error) {
            if (error) {
                console.log("[e] Failed to cache app " + document.appid);
            }
        });
    };

    // Fetch and cache the user's library from Steam.
    var cache_library = function (steam_id, callback) {
        var method = api.functions.GetOwnedGames;
        var args = [{ key: "steamid", value: steam_id }, { key: "include_appinfo", value: 1 }];

        api.call(method, args, function (error, result) {
            if (!error) {

                var library = null;

                // If result or the games property is undefined, then the user's profile is private.
                // in this case, create the holding document for their steam id but don't attempt to
                // process any games.
                if (!result || !result.games) {
                    library = {
                        steam_id: steam_id,
                        games: [],
                        game_count: 0,
                        cached_at: Date.now()
                    };
                }
                else {
                    library = {
                        steam_id: steam_id,
                        games: result.games,
                        game_count: result.game_count,
                        cached_at: Date.now()
                    };
                }

                var criteria = { steam_id: steam_id };
                var collection = db.collection("libraries");
                
                for (var i = 0; i < library.games.length; i++) {
                    if (!library.games[i].img_logo_url) {
                        library.games.removeAt(i);
                        library.game_count -= 1;
                    }
                    else {
                        create_app_document(library.games[i]);
                    }
                }

                collection.update(criteria, { $set: library }, { upsert: true }, function (error) {
                    if (!error) {
                        load_library(steam_id, callback);
                    }
                    else {
                        callback("Failed to update cache for id " + steam_id, null);
                    }
                });
            }
            else {
                callback("Failed to fetch library for id " + steam_id, null);
            }
        });
    };

    var load_completed_games = function (steam_id, callback) {
        var collection = db.collection("completed_games");
        var criteria = { steam_id: steam_id };

        collection.find(criteria).toArray(function (error, results) {
            if (!error) {
                callback(null, results);
            }
            else {
                callback("Failed to fetch the list of completed games for " + steam_id, null);
            }
        });
    };
    
    // Loads the user's library from the cache in the database.
    var load_library = function (steam_id, callback) {
        var collection = db.collection("libraries");
        var criteria = { steam_id: steam_id };

        collection.findOne(criteria, function (error, document) {
            if (!document || document.cached_at < Date.now() - 300000) {
                cache_library(steam_id, callback);
            }
            else {
                load_completed_games(steam_id, function (error, completed_games) {
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

                    document.completed_count = completed_games.length;
                    document.completion_percent = 0;
                    if (document.completed_count > 0 && document.game_count > 0) {
                        document.completion_percent = Math.floor((document.completed_count / document.game_count) * 100);
                    }

                    callback(null, document);
                });
            }
        });
    };

    var cache_user_data = function (steam_id, callback) {
        var args = [ { key: "steamids", value: steam_id }];
        api.call(api.functions.GetPlayerSummaries, args, function (error, result) {
            if (!error) {
                var collection = db.collection("users");
                var user = {};

                if (result.players && result.players.length > 0) {
                    user = result.players[0];
                }

                user.steam_id = steam_id;
                user.cached_at = Date.now();

                collection.update({ steam_id: steam_id }, { $set: user }, { upsert: true }, function (error) {
                    if (!error) {
                        load_user_data(steam_id, callback);
                    }
                    else {
                        callback("Failed to update cache for user " + steam_id, null);
                    }
                });
            }
            else {
                callback("Failed to fetch user information for user " + steam_id, null);
            }
        });
    };

    // Load the user's profile data e.g. avatar, username etc.
    var load_user_data = function (steam_id, callback) {
        var collection = db.collection("users");
        var criteria = { steam_id: steam_id };

        collection.findOne(criteria, function (error, document) {
            if (!document || document.cached_at < Date.now() - 300000) {
                cache_user_data(steam_id, callback);
            }
            else {
                var user = {
                    id: steam_id,
                    username: document.personaname,
                    avatar_small: document.avatar,
                    avatar_medium: document.avatarmedium,
                    avatar_large: document.avatarfull
                };

                callback(false, user);
            }
        });
    };

    var load_multiple_game_info = function (app_ids, callback) {
        var criteria = { appid: { $in: app_ids } };
        db.collection("games").find(criteria).toArray(function (error, results) {
            callback(error, results);
        });
    };

    var load_game_info = function (app_id, callback) {
        var criteria = { appid: app_id };
        db.collection("games").findOne(criteria, function (error, result) {
            callback(error, result);
        });
    };

    var load_latest_completions = function (callback) {
        db.collection("completed_games").find({}).limit(4).sort({ completed_at: -1 }).toArray(function (error, documents) {
            if (error) {
                callback(error, null);
            }
            else {
                var app_ids = [];
                for (var i = 0; i < documents.length; i++) {
                    app_ids.push(parseInt(documents[i].appid));
                }

                load_multiple_game_info(app_ids, function (error, results) {
                    for (var complete_index = 0; complete_index < documents.length; complete_index++) {
                        for (var game_index = 0; game_index < results.length; game_index++) {
                            if (parseInt(documents[complete_index].appid) === parseInt(results[game_index].appid)) {
                                documents[complete_index].game_info = results[game_index];
                                break;
                            }
                        }
                    }

                    callback(false, documents);
                });
            }
        });
    };

    var load_most_completed_games = function (callback) {
        db.collection("completed_games").aggregate([
            {
                $group: {
                    _id: "$appid",
                    count: { $sum: 1 }
                }
            },
            {
                $sort: {
                    count: -1
                }
            },
            {
                $limit: 4
            }
        ],
        function (error, results) {
            var processed = 0;
            get_library_count(function (library_count) {
                results.forEach(function (result) {
                    load_game_info(parseInt(result._id), function (error, game) {
                        result.game_info = game;
                        result.percentage = Math.floor((result.count / library_count) * 100);
                        processed += 1;

                        if (processed === results.length) {
                            callback(false, results);
                        }
                    });
                });
            });
        });
    };

    var get_library_count = function (callback) {
        db.collection("libraries").count(function (error, count) {
            callback(count);
        });
    };

    var complete_game = function (steam_id, app_id) {
        var collection = db.collection("completed_games");
        var object = { steam_id: steam_id, appid: app_id, completed_at: Date.now() };
        collection.update(object, { $set: object }, { upsert: true }, function (error) {
            if (error) {
                console.log(error);
            }
        });
    };

    var uncomplete_game = function (steam_id, app_id) {
        var collection = db.collection("completed_games");
        var object = { steam_id: steam_id, appid: app_id };
        collection.remove(object, {}, function () {
        });
    };

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

        load_latest_completions(function (error, latest_completions) {
            var users_loaded = 0;
            load_most_completed_games(function (error, most_completed) {

                latest_completions.forEach(function (game) {
                    load_user_data(game.steam_id, function (error, user) {
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

        load_library(steam_id, function (error, library) {
            if (req.isAuthenticated()) {
                active_user_id = req.user.identifier.replace("http://steamcommunity.com/openid/id/", "");
                if (steam_id === active_user_id) {
                    read_only = false;
                }
            }

            load_user_data(steam_id, function (error, user) {
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
        var app_id = req.body.app_id;
        var steam_id = req.user.identifier.replace("http://steamcommunity.com/openid/id/", "");
        complete_game(steam_id, app_id);
        res.send("ok");
    });

    app.post("/api/uncomplete", ensure_authenticated, function (req, res) {
        var app_id = req.body.app_id;
        var steam_id = req.user.identifier.replace("http://steamcommunity.com/openid/id/", "");
        uncomplete_game(steam_id, app_id);
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

// Begin listening on port 3000 for incoming HTTP reuqests.
app.listen(3000);
console.log("[i] Listening on port 3000");