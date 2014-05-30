"use strict";

var request = require("request");
var key = "";
var urls = [];
var functions = { 
    GetOwnedGames: 1
};

var initialise = function (apiKey) {
    key = apiKey;
    urls[functions.GetOwnedGames] = "http://api.steampowered.com/IPlayerService/GetOwnedGames/v1?key=" + apiKey;
};

var call = function (func, args, callback) {
    // Setup the base URL.
    var url = urls[func];

    // Append any arguments to the request.
    if (args !== null) {
        for (var i = 0; i < args.length; i++) {
            url += "&" + args[i].key + "=" + args[i].value;
        }
    }

    console.log("[i] Requesting " + url);

    // Initiate the API call.
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

module.exports.call = call;
module.exports.initialise = initialise;
module.exports.functions = functions;