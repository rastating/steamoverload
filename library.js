"use strict";

var create_app_document = function (db, document) {
    db.collection("games").update({ appid: document.appid }, { $set: document }, { upsert: true }, function (error) {
        if (error) {
            console.log("[e] Failed to cache app " + document.appid);
        }
    });
};

var cache_library = function (db, steam_id, callback) {
    var api = module.exports.api;
    var method = api.functions.GetOwnedGames;
    var args = [{ key: "steamid", value: steam_id }, { key: "include_appinfo", value: 1 }];

    api.call(method, args, function (error, result) {
        if (!error) {
            var library = null;

            // If result or the games property is undefined, then the user's profile is private.
            // in this case, create the holding document for their steam ID but don't attempt to
            // process any games.
            if (!result || !result.games) {
                library = { steam_id: steam_id, games: [], game_count: 0, cached_at: Date.now() };
            }
            else {
                library = { steam_id: steam_id, games: result.games, game_count: result.game_count, cached_at: Date.now() };
            }

            var criteria = { steam_id: steam_id };
            var collection = db.collection("libraries");
            
            // Some non-public games, early releases and betas will come through in the games array.
            // If we are missing a banner, then we should ommit these games, otherwise we'll update
            // our local cache of that game's meta data for quick access to it in other modules.
            for (var i = library.games.length - 1; i >= 0; i--) {
                if (!library.games[i].img_logo_url || !library.games[i].img_icon_url) {
                    console.log("Remove " + library.games[i].name);
                    library.games.removeAt(i);
                    library.game_count -= 1;
                }
                else {
                    create_app_document(db, library.games[i]);
                }
            }

            // Sort the owned games by name.
            library.games = library.games.sortBy(function (game) {
                return game.name;
            });

            // Update the library and call back into the load_library function if successful.
            collection.update(criteria, { $set: library }, { upsert: true }, function (error) {
                if (!error) {
                    load_library(db, steam_id, callback);
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

var load_completed_games = function (db, steam_id, callback) {
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

var load_library = function (db, steam_id, callback) {
    var collection = db.collection("libraries");
    var criteria = { steam_id: steam_id };

    collection.findOne(criteria, function (error, document) {
        if (!document || document.cached_at < Date.now() - module.exports.cache_timeout) {
            cache_library(db, steam_id, callback);
        }
        else {
            load_completed_games(db, steam_id, function (error, completed) {
                if (!error && completed && completed.length > 0) {
                    var games = document.games;

                    // Set the completed flag on games that appear in both arrays.
                    for (var game_index = 0; game_index < games.length; game_index++) {
                        for (var completed_index = 0; completed_index < completed.length; completed_index++) {
                            if (games[game_index].appid == completed[completed_index].appid) {
                                games[game_index].completed = true;
                                break;
                            }
                        }
                    }
                }

                // Calculate and assign completion figures.
                document.completed_count = completed.length;
                document.completion_percent = 0;
                if (document.completed_count > 0 && document.game_count > 0) {
                    document.completion_percent = Math.floor((document.completed_count / document.game_count) * 100);
                }

                callback(null, document);
            });
        }
    });
};

var load_game = function (db, app_id, callback) {
    var criteria = { appid: app_id };
    db.collection("games").findOne(criteria, function (error, result) {
        callback(error, result);
    });
};

var load_games = function (db, app_ids, callback) {
    var criteria = { appid: { $in: app_ids } };
    db.collection("games").find(criteria).toArray(function (error, results) {
        callback(error, results);
    });
};

var load_latest_completions = function (db, callback) {
    db.collection("completed_games").find({}).limit(4).sort({ completed_at: -1 }).toArray(function (error, completed_games) {
        if (error) {
            callback(error, null);
        }
        else {
            var app_ids = [];
            for (var i = 0; i < completed_games.length; i++) {
                app_ids.push(completed_games[i].appid);
            }

            // Map the game info to the completed game document.
            load_games(db, app_ids, function (error, games) {
                completed_games.forEach(function (completed_game) {
                    games.some(function (game) {
                        if (completed_game.appid === game.appid) {
                            completed_game.game_info = game;
                            return true;
                        }
                        else {
                            return false;
                        }
                    });
                });

                callback(false, completed_games);
            });
        }
    });
};

var get_library_count = function (db, callback) {
    db.collection("libraries").count(function (error, count) {
        callback(count);
    });
};

var load_most_completed_games = function (db, callback) {
    var criteria = [
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
    ];

    db.collection("completed_games").aggregate(criteria, function (error, results) {
        get_library_count(db, function (library_count) {
            results.forEach(function (result) {
                load_game(db, result._id, function (error, game) {
                    result.game_info = game;
                    result.percentage = Math.floor((result.count / library_count) * 100);
                });
            });

            callback(false, results);
        });
    });
};

var complete_game = function (db, steam_id, app_id) {
    var collection = db.collection("completed_games");
    var object = { steam_id: steam_id, appid: app_id, completed_at: Date.now() };
    collection.update(object, { $set: object }, { upsert: true }, function (error) {
        if (error) {
            console.log(error);
        }
    });
};

var uncomplete_game = function (db, steam_id, app_id) {
    var collection = db.collection("completed_games");
    var object = { steam_id: steam_id, appid: app_id };
    collection.remove(object, {}, function () {
    });
};

module.exports.api = null;
module.exports.cache_timeout = 600000;
module.exports.complete_game = complete_game;
module.exports.load = load_library;
module.exports.load_latest_completions = load_latest_completions;
module.exports.load_most_completed_games = load_most_completed_games;
module.exports.uncomplete_game = uncomplete_game;