// requires
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var favicon = require('serve-favicon');
var morgan = require('morgan');
var mongodb = require('mongodb');
var monk = require('monk');
var log4js = require('log4js');
var memAppender = require('log4js-memory-appender');
var yargs = require('yargs');
var util = require('util');
var str = require('string');
var loggerWrapper = require('log4js-function-designation-wrapper');

// modules
var appConstants = require('./app-constants');
var currencyExchangeJsonService = require('./currency-exchange-json-service');

// variables
var logger = null;

// functions
/********************************************************
 * Builds the datastore connection string based on
 * configuration values.
 ********************************************************/
var buildConnectionString = function buildConnectionString(applicationConfig){
    var connectionString = applicationConfig.mongodbURL;
    if(applicationConfig.mongodbName){
        if(!str(connectionString).endsWith('/')) { connectionString += '/'; }
        connectionString += applicationConfig.mongodbName;
    }
    return(connectionString);
};

/********************************************************
 * Initializes the MongoDB datastore.
 ********************************************************/
var initDatastore = function initDatastore(applicationConfig)
{
    var datastore = null;
    // build the connection string
    var connectionString = buildConnectionString(applicationConfig);
    // console this out - as sensitive info present
    console.log(util.format("Using connection string '%s' for mongodb.", connectionString));
    datastore = monk(connectionString);
    // add functions to help manage collections
    datastore.getPullsCollection = function(){ return(this.get(applicationConfig.mongodbPullsCollectionName)); };
    datastore.getEventsCollection = function(){ return(this.get(applicationConfig.mongodbEventsCollectionName)); };
    logger.info("Datastore initialised.");
    return(datastore);
};

/********************************************************
 * Initializes logging.
 ********************************************************/
var initLog4js = function initLog4js(applicationConfig, buffer)
{
    var log4jsLogger = null;
    // add the current working directory for support in openshift env
    log4js.configure(applicationConfig.log4js, { cwd : applicationConfig.logsDir });
    log4js.loadAppender('memory', memAppender({ buffer : buffer, maxBufferSize : applicationConfig.log4js.memoryAppender.bufferSize }));
    log4js.addAppender(log4js.appenders.memory(null, applicationConfig.log4js.memoryAppender.timezoneOffset));
    log4jsLogger = log4js.getLogger(appConstants.APP_NAME);
    // assign as global logger
    global.logger = log4jsLogger;
    // init local logger
    logger = loggerWrapper(global.logger, 'app-init-service');
    // create local logger wrapper
    logger.info("Log4js initialised.");
};

/********************************************************
 * Initializes Yargs for command line argument processing.
 ********************************************************/
var initYargs = function initYargs(){
    var argv = yargs
        .usage('Usage: $0 --smtpHost [string] --smtpUser [string] --smtpPassword [string] --notifyAddresses [array]')
        .example('$0 -smtpHost smtp.host.com --smptpUser username --smtpPassword password --notifyAddresses person@host.com anotherperson@host.net')
        .describe({
            'smtpHost' : 'SMTP host for sending notification emails',
            'smtpUser' : 'username for SMTP access',
            'smtpPassword' : 'password for SMTP access',
            'notifyAddresses' : 'array of receipient addressess for notification emails'
            })
        .array('notifyAddresses')
        .string(['smtpHost', 'smtpUser', 'smtpPassword'])
        .demand(['smtpHost', 'smtpUser', 'smtpPassword', 'notifyAddresses'])
        .argv;
    return(argv);
};

/********************************************************
 * Processes command line arguments.
 ********************************************************/
var processArguments = function processArguments(applicationConfig){
    logger.info(util.format("Using '%s' configuration.", applicationConfig.environment));
    // check if deployed locally or not
    if(applicationConfig.environment === appConstants.ENVIRONMENT_LOCAL_NAME)
    {
        // proces the arguments using yargs
        var argv = initYargs();
        // add the information from arguments in to the config
        logger.info("Overriding smtp configuration with command line arguments.");
        applicationConfig.argumentSmtpHost = argv.smtpHost;
        applicationConfig.argumentSmtpUser = argv.smtpUser;
        applicationConfig.argumentSmtpPassword = argv.smtpPassword;
        applicationConfig.argumentNotifyAddresses = argv.notifyAddresses;
    }
};

/********************************************************
 * Outputs configuration information to the console. It
 * is not output to the logs as this is sensitive information
 * that should not appear on the diagnostics page.
 ********************************************************/
var outputConfigToConsole = function outputConfigToConsole(applicationConfig){
    console.log("Configuration ->");
    console.log(applicationConfig);
};

/********************************************************
 * Outputs environment information to the console. It
 * is not output to the logs as this is sensitive information
 * that should not appear on the diagnostics page.
 ********************************************************/
var outputEnvToConsole = function outputEnvToConsole(process){
    console.log("Environment ->");
    console.log(process.env);
};

/********************************************************
 * Initializes the express application.
 ********************************************************/
var initExpress = function initExpress(app, routes, __dirname, applicationConfig){
    // view engine setup
    app.set('views', path.join(__dirname, 'views'));
    app.set('view engine', 'jade');
    app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
    app.use(morgan('combined'));
    app.use(bodyParser.json());
    app.use(bodyParser.urlencoded({ extended: false }));
    app.use(cookieParser());
    app.use(express.static(path.join(__dirname, 'public')));
    app.use('/bootstrap', express.static(path.join(__dirname, 'node_modules/bootstrap/dist')));
    app.use('/jquery', express.static(path.join(__dirname, 'node_modules/jquery/dist')));
    
    app.use('/', routes);
    
    // catch 404 and forward to error handler
    app.use(function(req, res, next) {
        var err = new Error('Not Found');
        err.status = 404;
        next(err);
    });
    
    // error handlers
    
    // error handlers
    // development and test error handler
    // will print stacktrace
    if (app.get('env') === appConstants.NODE_ENVIRONMENT_DEVELOPMENT_NAME || app.get('env') === appConstants.NODE_ENVIRONMENT_TEST_NAME) {
        app.use(function(err, req, res, next) {
            if(logger.valid()) {
                logger.error({ designation: "express", functionDesignation: "middleware-error-handler", arguments: ["Express middleware error handler caught an error.", err, util.format("Original URL: '%s'.", req.originalUrl)] });
            }
            if(req.xhr){
                res.status(err.status || 500).send({ message : err.message, error : err });
            } else {
                res.status(err.status || 500);
                res.render('error', {
                    title: 'Error',
                    message: err.message,
                    error: err
                });
            }
        });
    }
    
    // production error handler
    // no stacktraces leaked to user
    app.use(function(err, req, res, next) {
        if(logger.valid()) {
            logger.error({ designation: "express", functionDesignation: "middleware-error-handler", arguments: ["Express middleware error handler caught an error.", err, util.format("Original URL: '%s'.", req.originalUrl)] });
        }
        if(req.xhr){
            res.status(err.status || 500).send({ message : err.message, error: {} });
        } else {
            res.status(err.status || 500);
            res.render('error', {
                title: 'Error',
                message: err.message,
                error: {}
            });
        }
    });
    
    // conditionally beautify output
    app.locals.pretty = applicationConfig.useExpressPrettyOutput;
    logger.info("Express initialised.");
};

/********************************************************
 * Initializes the express locals for use in routes and
 * views.
 ********************************************************/
var initExpressLocals = function initExpressLocals(app, locals){
    app.locals.context = locals;
    logger.info("Express locals initialised.");
};

/********************************************************
 * Initializes the bank product JSON service.
 ********************************************************/
var initCurrenctExchangeJsonService = function initCurrenctExchangeJsonService(applicationConfig, datastore){
    currencyExchangeJsonService.configure(applicationConfig, datastore);
    logger.info("Currency Exchange JSON Service initialised.");
    return(currencyExchangeJsonService);
}

module.exports = {
    initDatastore : initDatastore,
    initLog4js : initLog4js,
    processArguments : processArguments,
    outputConfigToConsole : outputConfigToConsole,
    outputEnvToConsole : outputEnvToConsole,
    initExpress : initExpress,
    initExpressLocals : initExpressLocals,
    initCurrenctExchangeJsonService : initCurrenctExchangeJsonService
};