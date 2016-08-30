// requires
var jade = require('jade');
var request = require('request');
var jsonPath = require('jsonpath-plus');
var util = require('util');
var moment = require('moment');
var email = require('emailjs');
var schedule = require('node-schedule');
var loggerWrapper = require('log4js-function-designation-wrapper');
var check = require('check-types');

// modules
var appConstants = require('./app-constants');
var models = require('./app-models');

// variables
var applicationConfig = null;
var logger = null;
var datastore = null;
var emailTemplate = null;
var pullJob = null;

/********************************************************
 * Configures the currency exchange JSON service.
 ********************************************************/
var configure = function configure(_applicationConfig, _datastore) {
    applicationConfig = _applicationConfig;
    datastore = _datastore;
    logger = loggerWrapper(global.logger, 'currency-exchange-json-service');
    emailTemplate = jade.compileFile(appConstants.EMAIL_TEMPLATE_PATH, { pretty : true });
    pullJob = scheduleJob();
    // TODO: remoce / for testing only
    process();
}

/********************************************************
 * Schedules the pull job based on config.
 ********************************************************/
var scheduleJob = function scheduleJob(){
    var scheduleLocalToServer = null;
    var scheduleTime = new Date();
    scheduleTime.setUTCHours(applicationConfig.currencyExchangeJsonService.jobSchedule.hour);
    scheduleTime.setUTCMinutes(applicationConfig.currencyExchangeJsonService.jobSchedule.minute);
    scheduleLocalToServer = { hour: scheduleTime.getHours(), minute: scheduleTime.getMinutes() };
    logger.info("Scheduling Currency Exchange JSON Service to run according to configuration converted to local time.",
        scheduleLocalToServer, "local timezone offset", scheduleTime.getTimezoneOffset());
    console.log(process);
    var job = schedule.scheduleJob(scheduleLocalToServer, process);
    return(job);
};

/********************************************************
 * Handles the insert result of a new pull document.
 ********************************************************/
var handleInsertNewPullDocEvent = function handleInsertNewPullDocEvent(err, doc){
    if(err){
        logger.error(err);
    } else {
        logger.info("Inserted new pull doc (" + doc.rates.length + " rates).");
    }
};

/********************************************************
 * Inserts a new pull document.
 ********************************************************/
var insertNewPullDoc = function insertNewPullDoc(ratesOfInterest)
{
    var pull = new models.pull();
    pull.created = new Date();
    pull.rates = ratesOfInterest;
    datastore.getPullsCollection().insert(pull, handleInsertNewPullDocEvent);
};

/********************************************************
 * Handles the insert result of a new event document.
 ********************************************************/
var handleInsertNewEventDocEvent = function handleInsertNewEventDocEvent(err, doc){
    if(err){
        logger.error(err);
    } else {
        logger.info("Inserted new event doc.");
    }
};

/********************************************************
 * Inserts a new event document.
 ********************************************************/
var insertNewEventDoc = function insertNewEventDoc(rateChange){
    var eventDoc = {
        date : new Date(),
        oldRate : rateChange.oldRate,
        newRate : rateChange.newRate,
        description : rateChange.description
    };
    datastore.getEventsCollection().insert(eventDoc, handleInsertNewEventDocEvent);
};

/********************************************************
 * Builds a description of the rate change found.
 ********************************************************/
var buildRateChangeDescription = function buildRateChangeDescription(rateChange){
    return(util.format("Product '%s' with rate code '%s' changed interest rate from %d %s to %d%s",
        rateChange.oldRate.description,
        rateChange.oldRate.code,
        rateChange.oldRate.ratevalue,
        rateChange.oldRate.ratesuffix,
        rateChange.newRate.ratevalue,
        rateChange.newRate.ratesuffix));
};

/********************************************************
 * Handles the notification mail sent event.
 ********************************************************/
var handleNotificationMailEvent = function handleNotificationMailEvent(err, message){
    if(err){
        logger.error(err);
    } else {
        logger.info("Email notifications sent successfully.");
    }
};

/********************************************************
 * Builds a plain text notification email.
 ********************************************************/
var buildPlainTextChangedRatesMessage = function buildPlainTextChangedRatesMessage(changedRates){
    var rateChangesMessage = 'Notification\n\nChanges in rates of interest at ANZ bank have been detected.\n\n';
    for(var i=0; i < changedRates.length; i++)
    {
        rateChangesMessage += ' • ' + changedRates[i].description + '\n';
    }
    return(rateChangesMessage);
};

/********************************************************
 * Builds the SMTP configuration based conditionally on
 * the environment in use (local or OpenShift).
 ********************************************************/
var buildSmtpConfig = function buildSmtpConfig(){
    var config = null;
    if(applicationConfig.environment == appConstants.ENVIRONMENT_LOCAL_NAME){
        config =
        {
            user : applicationConfig.argumentSmtpUser,
            password : applicationConfig.argumentSmtpPassword,
            host : applicationConfig.argumentSmtpHost,
            ssl : true,
            notifyAddresses : applicationConfig.argumentNotifyAddresses
        };
    } else {
        config =
        {
            user : applicationConfig.smtpUser,
            password : applicationConfig.smtpPassword,
            host : applicationConfig.smtpHost,
            ssl : true,
            notifyAddresses : applicationConfig.notifyAddresses
        };
    }
    return(config);
};

/********************************************************
 * Sends email notifications for rate changes.
 ********************************************************/
var sendEmailNotifications = function sendEmailNotifications(changedRates){
    logger.info("Sending email notifications to notify addresses.");
    try{
        var config = buildSmtpConfig();
        var server = email.server.connect(config);
        var rateChangesMessage = buildPlainTextChangedRatesMessage(changedRates);
        var messageHTML = emailTemplate({ model : { appName : appConstants.APP_NAME, selfURL : applicationConfig.selfURL, changedRates : changedRates } });
        var message	= {
            text: rateChangesMessage,
            from: appConstants.APP_NAME + " <" + config.user + ">",
            to: config.notifyAddresses,
            subject: appConstants.APP_NAME + ": Rates of Interest Change(s) @ " + moment().format(appConstants.DISPLAY_DATE_FORMAT),
            attachment: [{ data: messageHTML, alternative: true }]
        };
        server.send(message, handleNotificationMailEvent);
    } catch(err) {
        logger.error("Failed to send email notifications.", err);
    }
};

/********************************************************
 * Test email send.
 ********************************************************/
var testEmailSend = function testEmailSend(){
    logger.info("Sending test email to notify addresses.");
    try{
        var config = buildSmtpConfig();
        var server = email.server.connect(config);
        var message	= {
            text: "Test from IRWatcher application.",
            from: appConstants.APP_NAME + " <" + config.user + ">",
            to: config.notifyAddresses,
            subject: appConstants.APP_NAME + ": Test @ " + moment().format(appConstants.DISPLAY_DATE_FORMAT)
        };
        server.send(message, function (err, message){
            if(err){
                logger.error(err);
            } else {
                logger.info("Email test sent successfully.", message);
            }
        });
    } catch(err) {
        logger.error("Failed to send test email.", err);
    }
};

/********************************************************
 * Compares the rates in the current pull with the last pull.
 ********************************************************/
var compareRates = function compareRates(ratesOfInterest)
{
    datastore.getPullsCollection().find({}, { limit : 1, sort : { date: -1 } }, function (err, pulls) {
        if(err){
            logger.error(err);
        } else {
            // check for changed rates
            var changedRates = [];
            if(pulls.length >= 1)
            {
                for(var i=0; i < pulls[0].ratesOfInterest.length; i++)
                {
                    for(var j=0; j < ratesOfInterest.length; j++)
                    {
                        if(pulls[0].ratesOfInterest[i].code === ratesOfInterest[j].code)
                        {
                            if(pulls[0].ratesOfInterest[i].ratevalue !== ratesOfInterest[j].ratevalue)
                            {
                                var rateChange = { oldRateDate: pulls[0].date, oldRate : pulls[0].ratesOfInterest[i], newRate : ratesOfInterest[j] };
                                rateChange.description = buildRateChangeDescription(rateChange);
                                logger.info(rateChange.description);
                                insertNewEventDoc(rateChange);
                                changedRates.push(rateChange);
                            }
                        }
                    }
                }
            }
            // if we have some change in rates or if there is no pulls
            // in the datastore yet - save the pull
            if(changedRates.length > 0 || pulls.length === 0){
                logger.info("Storing this pull in the datastore.");
                // stuff them into the datastore
                insertNewPullDoc(ratesOfInterest);
            } else {
                logger.info("Not storing this pull in the datastore.");
            }
            // if change in rates - notify via email
            if(changedRates.length > 0) {
                sendEmailNotifications(changedRates);
            }
        }
    });
};

/********************************************************
 * Builds the source URL.
 ********************************************************/
var buildSourceURL = function buildSourceURL(){
    var result = applicationConfig.currencyExchangeJsonService.serviceSourceURL;
    var specifiers = [];
    var ratesOfInterest = applicationConfig.currencyExchangeJsonService.ratesOfInterest;
    for(var i=0; i < ratesOfInterest.length; i++){
        var ri = ratesOfInterest[i];
        console.log("ri", ri);
        if(check.nonEmptyString(ri.specifier)){
            specifiers.push(util.format('"%s"', ri.specifier));
        }
    }
    console.log("specifiers", specifiers);
    if(specifiers.length > 0){
        result += util.format(applicationConfig.currencyExchangeJsonService.serviceSourceQueryPattern, specifiers.join());
    }
    return(result);
};

/********************************************************
 * Finds the rates of interest in the service source 
 * object.
 ********************************************************/
var findRatesOfInterest = function findRatesOfInterest(body){
	//TODO: check the structure of the service source when multiple rates are defined
	var result = null;
	var ratesToFind = applicationConfig.currencyExchangeJsonService.ratesOfInterest;
	var rateResults = [];
	var found = false;
	// check the source body
	if(!body.query.result.rate){
		logger.warn("There was no rate results in the object returned from the service source.");
		return(result);
	}
	
	if(check.array(body.query.results.rate)){
		rateResults.join(body.query.results.rate);
	} else {
		rateResults.push(body.query.results.rate);
	}
		
	if(check.array(ratesToFind) && ratesToFind.length > 0){
		for(var i=0; i < ratesToFind.length; i++){	
			found = false;
			for(var j=0; j < rateResults; j++){
				if(ratesToFind[i].specifier == rateResults[j].id){
					found = true;		
					result[ratesToFind[i].id] = rateResults[j];
					break;
				}
			}
			if(!found){
				logger.warn(util.format("There was no result for rate of interest with id '%s' found in service source object.", ratesToFind[i].id));
			}
		}
	} else {
		logger.warn("There are no rates of interest defined in configuration or there is a problem with the definition.");
	}
	return(result);
};

/********************************************************
 * Requests the bank product JSON and processes it.
 ********************************************************/
var process = function process(callback){
    var builtSourceURL = buildSourceURL();
    logger.info("Process called - doing a pull from the currency exchange source.", builtSourceURL);
    request(builtSourceURL, function(error, response, body){
        logger.info("Entering request handler.");
        if (!error && response.statusCode == 200) {
            logger.info("Response ok. Processing...");
            console.log(body);
            //var ratesOfInterest = findRatesOfInterest(body);
            //if(ratesOfInterest){
            //	compareRates(ratesOfInterest);
            //}
            logger.info("Process complete.");
        } else {
            logger.error(error);
        }
        if(callback) { callback(); }
    });
};

/********************************************************
 * Returns when the service is set to next run.
 ********************************************************/
var getScheduledRunInfo = function getScheduledRunInfo(){
    return({ next: pullJob.nextInvocation() });
};

module.exports = {
    configure : configure,
    getScheduledRunInfo : getScheduledRunInfo,
    testEmailSend : testEmailSend
};