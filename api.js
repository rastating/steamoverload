
// BASE SETUP
// ==============================================

var request = require("request");
var key     = "";


// MODULE FUNCTIONS
// ==============================================

var initialise = function (apiKey) {
    key = apiKey;
};

var call = function (url, args, callback) {
    if (args !== null) {
        for (var i = 0; i < args.length; i++) {
            url += "&" + args[i].key + "=" + args[i].value;
        }
    }

    console.log("[i] Requesting " + url);
    request({ url: url, json: true }, function (error, response, body) {
        if (!error && response.statusCode === 200) {
            if (body.result !== undefined) {
                callback(error, body.result);
            }
            else if (body.response !== undefined) {
                callback(error, body.response);
            }
            else {
                callback(error, body);
            }
        }
        else {
            callback(true, null);
        }
    });
};

var getOwnedGames = function (id, callback) {
    var url = "http://api.steampowered.com/IPlayerService/GetOwnedGames/v1?key=" + apiKey;
    var args = [
        { 
            "key": "steamid", 
            "value": id 
        },
        {
            "key": "include_appinfo",
            "value": 1
        }
    ];

    call(url, args, callback);
};

var getPlayerSummaries = function (id, callback) {
    var url = "http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=" + apiKey;
    var args = [{ "key": "steamids", "value": id }];
    call(url, args, callback);
};


// MODULE EXPORTS
// ==============================================

module.exports.initialise = initialise;
module.exports.getOwnedGames = getOwnedGames;
module.exports.getPlayerSummaries = getPlayerSummaries;