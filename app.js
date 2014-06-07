"use strict";

var api = require("./api");
var library = require("./library");
var user = require("./user");
var router = require("./router");

// Setup Sugar.js extension functions.
require("sugar");

// Initialise the Steam API module.
api.initialise(process.argv[2]);
console.log("[i] Initialised API");

library.api = api;
console.log("[i] Initialised Library module");

user.api = api;
console.log("[i] Initialised User module");

router.library = library;
router.user = user;
console.log("[i] Initialised Router module");

router.start();
console.log("[i] Started router on port 3000");