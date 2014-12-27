
// BASE SETUP
// ==============================================
var user = require('./user');


// MODULE FUNCTIONS
// ==============================================

var createAppDocument = function (doc) {
    var db = module.exports.db;
    var game = {
        "appid": doc.appid,
        "name": doc.name,
        "img_icon_url": doc.img_icon_url,
        "img_logo_url": doc.img_logo_url,
        "has_community_visible_stats": doc.has_community_visible_stats
    };

    db.collection("games").update({ "appid": game.appid }, { $set: game }, { upsert: true }, function (error) {
        if (error) {
            console.log("[e] Failed to cache app " + game.appid);
        }
    });
};

var cacheLibrary = function (steamID, callback) {
    var api = module.exports.api;
    var db = module.exports.db;

    api.getOwnedGames(steamID, function (error, result) {
        if (!error) {
            var library = null;

            // If result or the games property is undefined, then the user's profile is private.
            // in this case, create the holding document for their steam ID but don't attempt to
            // process any games.
            if (!result || !result.games) {
                library = { "steam_id": steamID, "games": [], "game_count": 0, "cached_at": Date.now() };
            }
            else {
                library = { "steam_id": steamID, "games": result.games, "game_count": result.game_count, "cached_at": Date.now() };
            }

            var criteria = { "steam_id": steamID };
            var collection = db.collection("libraries");
            
            // Some non-public games, early releases and betas will come through in the games array.
            // If we are missing a banner, then we should ommit these games, otherwise we'll update
            // our local cache of that game's meta data for quick access to it in other modules.
            for (var i = library.games.length - 1; i >= 0; i--) {
                if (!library.games[i].img_logo_url || !library.games[i].img_icon_url) {
                    library.games.removeAt(i);
                    library.game_count -= 1;
                }
                else {
                    createAppDocument(library.games[i]);
                }
            }

            // Sort the owned games by name.
            library.games = library.games.sortBy(function (game) {
                return game.name;
            });

            // Update the library and call back into the loadLibrary function if successful.
            collection.update(criteria, { $set: library }, { upsert: true }, function (error) {
                if (!error) {
                    if (callback) {
                        loadLibrary(steamID, callback);
                    }
                    else {
                        console.log('INFO   Finished caching library for ' + steamID);
                    }
                }
                else {
                    if (callback) {
                        callback('Failed to update cache for id ' + steamID + ': ' + error, null);
                    }
                    else {
                        console.log('Failed to update cache for id ' + steamID + ': ' + error);
                    }
                }
            });
        }
        else {
            if (callback) {
                callback('Failed to fetch library for id ' + steamID + ': ' + error, null);
            }
            else {
                console.log('Failed to fetch library for id ' + steamID + ': ' + error);
            }
        }
    });
};

var loadCompletedGames = function (steamID, callback) {
    var db = module.exports.db;
    var collection = db.collection("completed_games");
    var criteria = { "steam_id": steamID };

    collection.find(criteria).toArray(function (error, results) {
        if (!error) {
            callback(null, results);
        }
        else {
            callback("Failed to fetch the list of completed games for " + steamID, null);
        }
    });
};

var loadLibrary = function (steamID, callback) {
    var db = module.exports.db;
    var collection = db.collection('libraries');
    var criteria = { "steam_id": steamID };

    collection.findOne(criteria, function (error, doc) {
        if (!doc) {
            cacheLibrary(steamID, callback);
        }
        else {
            if (doc.cached_at < Date.now() - module.exports.cacheTimeout) {
                console.log('INFO   Starting async library update for ' + steamID);
                setTimeout(function () { cacheLibrary(steamID); }, 1000);
            }

            loadCompletedGames(steamID, function (error, completed) {
                if (!error && completed && completed.length > 0) {
                    var games = doc.games;

                    // Set the completed flag on games that appear in both arrays.
                    for (var gameIndex = 0; gameIndex < games.length; gameIndex++) {
                        for (var completedIndex = 0; completedIndex < completed.length; completedIndex++) {
                            if (games[gameIndex].appid == completed[completedIndex].appid) {
                                games[gameIndex].completed = true;
                                break;
                            }
                        }
                    }
                }
                else {
                    callback(error, null);
                }

                // Calculate and assign completion figures.
                doc.completed_count = completed.length;
                doc.completion_percent = 0;
                if (doc.completed_count > 0 && doc.game_count > 0) {
                    doc.completion_percent = Math.floor((doc.completed_count / doc.game_count) * 100);
                }

                callback(null, doc);
            });
        }
    });
};

var loadGame = function (id, callback) {
    var db = module.exports.db;
    var criteria = { "appid": id };
    db.collection("games").findOne(criteria, function (error, result) {
        callback(error, result);
    });
};

var loadGames = function (ids, callback) {
    var db = module.exports.db;
    var criteria = { "appid": { $in: ids } };
    db.collection("games").find(criteria).toArray(function (error, results) {
        callback(error, results);
    });
};

var loadLatestCompletions = function (callback) {
    var db = module.exports.db;
    db.collection("completed_games").find({}).limit(4).sort({ completed_at: -1 }).toArray(function (error, completedGames) {
        if (error) {
            callback(error, null);
        }
        else {
            var ids = [];
            for (var i = 0; i < completedGames.length; i++) {
                ids.push(completedGames[i].appid);
            }

            // Map the game info to the completed game document and the user
            // that completed it.
            loadGames(ids, function (error, games) {
                var loaded = 0;
                completedGames.forEach(function (completedGame) {
                    games.some(function (game) {
                        if (completedGame.appid === game.appid) {
                            completedGame.game_info = game;
                            return true;
                        }
                        else {
                            return false;
                        }
                    });

                    user.load(completedGame.steam_id, function (error, completer) {
                        completedGame.user = completer;
                        loaded += 1;

                        if (loaded === completedGames.length) {
                            callback(false, completedGames);
                        }
                    });
                });
            });
        }
    });
};

var getLibraryCount = function (callback) {
    var db = module.exports.db;
    db.collection("libraries").count(function (error, count) {
        callback(count);
    });
};

var loadMostCompletedGames = function (callback) {
    var db = module.exports.db;
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
        getLibraryCount(function (libraryCount) {
            var loaded = 0;
            results.forEach(function (result) {
                loadGame(result._id, function (error, game) {
                    result.game_info = game;
                    result.percentage = Math.floor((result.count / libraryCount) * 100);
                    loaded += 1;

                    if (loaded === 4) {
                        callback(false, results);
                    }
                });
            });
        });
    });
};

var completeGame = function (steamID, gameID) {
    var db = module.exports.db;
    var collection = db.collection('completed_games');
    var object = { "steam_id": steamID, "appid": gameID, "completed_at": Date.now() };
    collection.update(object, { $set: object }, { upsert: true }, function (error) {
        if (error) {
            console.log(error);
        }
    });
};

var uncompleteGame = function (steamID, gameID) {
    var db = module.exports.db;
    var collection = db.collection("completed_games");
    var object = { "steam_id": steamID, "appid": gameID };
    collection.remove(object, {}, function () {
    });
};


// MODULE EXPORTS
// ==============================================

module.exports.api = null;
module.exports.cacheTimeout = 600000;
module.exports.completeGame = completeGame;
module.exports.db = null;
module.exports.load = loadLibrary;
module.exports.loadLatestCompletions = loadLatestCompletions;
module.exports.loadMostCompletedGames = loadMostCompletedGames;
module.exports.uncompleteGame = uncompleteGame;