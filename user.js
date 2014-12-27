
// BASE SETUP
// ==============================================

var args            = require('minimist')(process.argv.slice(2));
var debugging       = args.d;

// MODULE FUNCTIONS
// ==============================================

var cacheData = function (steamID, callback) {
    var db = module.exports.db;
    var api = module.exports.api;
    api.getPlayerSummaries(steamID, function (error, result) {
        if (!error) {
            var collection = db.collection('users');
            var user = {};

            if (result.players && result.players.length > 0) {
                user = result.players[0];
            }

            user.steam_id = steamID;
            user.cached_at = Date.now();

            collection.update({ "steamid": steamID }, { $set: user }, { "upsert": true }, function (error) {
                if (!error) {
                    if (callback) {
                        loadUserData(steamID, callback);
                    }
                    else {
                        console.log('INFO   Finished caching user data for ' + steamID);
                    }
                }
                else {
                    if (callback) {
                        callback('Failed to update cache for user ' + steamID, null);
                    }
                    else {
                        console.log('Failed to update cache for user ' + steamID);
                    }
                }
            });
        }
        else {
            if (callback) {
                callback('Failed to fetch user information for user ' + steamID + ': ' + error, null);
            }
            else {
                console.log('Failed to fetch user information for user ' + steamID + ': ' + error);
            }
        }
    });
};

var loadUserData = function (steamID, callback) {
    var db = module.exports.db;
    var collection = db.collection("users");
    var criteria = { "steamid": steamID };

    collection.findOne(criteria, function (error, doc) {
        if (!doc) {
            cacheData(steamID, callback);
        }
        else {
            if (doc.cached_at < Date.now() - 300000) {
                console.log('INFO   Starting async user update for ' + steamID);
                setTimeout(function () { cacheData(steamID); }, 1000);
            }

            var user = {
                "id": steamID,
                "username": doc.personaname,
                "avatar_small": doc.avatar,
                "avatar_medium": doc.avatarmedium,
                "avatar_large": doc.avatarfull
            };

            callback(false, user);
        }
    });
};

module.exports.api = null;
module.exports.db = null;
module.exports.cache_timeout = 600000;
module.exports.load = loadUserData;