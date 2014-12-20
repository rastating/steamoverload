
// BASE SETUP
// ==============================================

var args    = require('minimist')(process.argv.slice(2));
var api     = require("./api");
var library = require("./library");
var user    = require("./user");
var router  = require("./router");
var sugar   = require("sugar");
var key     = args.k;


// LOAD APPLICAITON MODULES
// ==============================================

api.initialise(key);
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