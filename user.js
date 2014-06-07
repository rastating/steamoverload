"use strict";

var cache_user_data = function (db, steam_id, callback) {
    var args = [ { key: "steamids", value: steam_id }];
    var api = module.exports.api;
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
                    load_user_data(db, steam_id, callback);
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

var load_user_data = function (db, steam_id, callback) {
    var collection = db.collection("users");
    var criteria = { steam_id: steam_id };

    collection.findOne(criteria, function (error, document) {
        if (!document || document.cached_at < Date.now() - 300000) {
            cache_user_data(db, steam_id, callback);
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

module.exports.api = null;
module.exports.cache_timeout = 600000;
module.exports.load = load_user_data;