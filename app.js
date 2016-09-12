// requires
var config = require('config');
var express = require('express');
var moment = require('moment');
var util = require('util');
var underscore = require('underscore');
var pkg = require('./package.json');

// modules
var routes = require('./routes/index');
var appConstants = require('./modules/app-constants');
var viewHelpers = require('./modules/view-helpers');
var appInitService = require('./modules/app-init-service');
var routerHelpers = require('./modules/router-helpers');
var loggerWrapper = require('log4js-function-designation-wrapper');

// vars
var applicationConfig = config.get('applicationConfig');
var app = express();
var datastore = null;
var tailLogBuffer = [];
var expressContext = {};
var currencyExchangeJsonService = null;
var logger = null;

// functions
/********************************************************
 * Initializes the local context for the express app.
 ********************************************************/
var initExpressContext = function initExpressContext(){
    // build all the locals for use in routes
    // and views as a context bundle
    expressContext.version = applicationConfig.version;
    expressContext.paginationPageSize = applicationConfig.paginationPageSize;
    expressContext.moment = moment;
    expressContext.underscore = underscore;
    expressContext.datastore = datastore;
    expressContext.viewHelpers = viewHelpers;
    expressContext.currencyExchangeJsonService = currencyExchangeJsonService;
    expressContext.appConstants = appConstants;
    expressContext.tailLogBuffer = tail();
    expressContext.util = util;
    expressContext.routerHelpers = routerHelpers;
};

/********************************************************
 * Creates a tail object that can tail the log.
 ********************************************************/
var tail = function tail(){
  return(
      {
        getBuffer : function getBuffer() {
            return(tailLogBuffer.slice());
        }
      }
    );
};

/********************************************************
 * Initializes the application.
 ********************************************************/
var initApp = function initApp()
{
    // add the version from package.json to the config
    applicationConfig.version = pkg.version;
    // console config and env -> this does not go into the log4js
    // log as it contains secrets and we don't want it appearing
    // diagnostics page
    appInitService.outputConfigToConsole(applicationConfig);
    appInitService.outputEnvToConsole(process);
    // init log4js
    appInitService.initLog4js(applicationConfig, tailLogBuffer);
    // init local logger
    logger = loggerWrapper(global.logger, 'app');
    // process any command line arguments
    appInitService.processArguments(applicationConfig);
    // init the datastore
    datastore = appInitService.initDatastore(applicationConfig);
    // init the currency exchange json service
    currencyExchangeJsonService = appInitService.initCurrenctExchangeJsonService(applicationConfig, datastore);
    // init the express app
    appInitService.initExpress(app, routes, __dirname, applicationConfig);
    // add locals for routes and views
    initExpressContext();
    // get the init service to push this context onto the locals object
    appInitService.initExpressLocals(app, expressContext);
};

// initialise the application
initApp();
logger.info(util.format("%s initialised.", appConstants.APP_NAME));

// start listening on specified port
app.listen(applicationConfig.bindPort, applicationConfig.bindIPAddress, function (err) {
    if (err) {
        logger.error(err);
    } else {
        logger.info(util.format("%s [%s] listening on bound port '%s' for bound IP address '%s'.", appConstants.APP_NAME, applicationConfig.version, applicationConfig.bindPort, applicationConfig.bindIPAddress));
    }
});

module.exports = app;
