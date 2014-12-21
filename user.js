
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

            collection.update({ "steam_id": steamID }, { $set: user }, { "upsert": true }, function (error) {
                if (!error) {
                    loadUserData(steamID, callback);
                }
                else {
                    callback("Failed to update cache for user " + steamID, null);
                }
            });
        }
        else {
            callback("Failed to fetch user information for user " + steamID, null);
        }
    });
};

var loadUserData = function (steamID, callback) {
    var db = module.exports.db;
    var collection = db.collection("users");
    var criteria = { "steam_id": steamID };

    collection.findOne(criteria, function (error, doc) {
        if (!doc || doc.cached_at < Date.now() - 300000) {
            cacheData(steamID, callback);
        }
        else {
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