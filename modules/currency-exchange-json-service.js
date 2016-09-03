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
        logger.info("Inserted new pull doc (" + doc.rates.keys().length + " rates).");
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
    var event = new models.event();
    event.ri_id = rateChange.ri_id;
    event.ri_name = rateChange.ri_name;
    event.created = new Date();
    event.old_rate : rateChange.oldRate,
    event.new_rate : rateChange.newRate,
    event.description : rateChange.description
    datastore.getEventsCollection().insert(event, handleInsertNewEventDocEvent);
};

/********************************************************
 * Builds a description of the rate change found.
 ********************************************************/
var buildRateChangeDescription = function buildRateChangeDescription(rateChange){
    return(util.format("%s (%s) changed interest rate from %d to %d.",
        rateChange.ri_name,
        rateChange.ri_id,
        rateChange.old_rate,
        rateChange.new_rate));
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
    var rateChangesMessage = 'Notification\n\nChanges in currency exchange rates have been detected.\n\n';
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
            subject: appConstants.APP_NAME + ": Currency Exchange Change(s) @ " + moment().format(appConstants.DISPLAY_DATE_FORMAT),
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
            text: "Test from CEWatcher application.",
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
    datastore.getPullsCollection().find({}, { limit : 1, sort : { created: -1 } }, function (err, pulls) {
        if(err){
            logger.error("Failed to get latest pull from the datastore.", err);
        } else {
            // check for changed rates
            var changedRates = [];
            if(pulls.length >= 1)
            {
            	var lastPullRates = pulls[0].rates;
            	var configuredRatesOfInterest = applicationConfig.currencyExchangeJsonService.ratesOfInterest;
          		for(var i=0; i < configuredRatesOfInterest.length; i++){
	          		for(var j=0; j < ratesOfInterest.length; j++)
	              {
	              		// if this rateis in the last pull
	                  if(lastPullRates[ratesOfInterest[j].id] && configuredRatesOfInterest[i].id === ratesOfInterest[j].id)
	                  {
	                  		
	                  		// TODO: this needs to change to use rules in config
	                  		var rulesResult = evalutaeRules(configuredRatesOfInterest[i].notifyRules, ratesOfInterest[j].id);
	                  		
	                  		// loop through the rules and find and matches 
	                  		// build a list of triggered rules
	                  		// if any rules triggered - build rate change and push onto changed rates
	                      if(rulesResult.triggered)
	                      {
	                      		var rateChange = new models.event();
	                          rateChange.description = buildRateChangeDescription(rateChange);
	                          rateChange.ri_id = null;
														rateChange.ri_name = null;
														rateChange.old_rate = null;
														rateChange.new_rate = null;
														rateChange.created = new Date();
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

var evalutaeRules = function evaluateRule(rules, rate){
	if(check.array(rules) && check.number(rate)){
			var results = { triggeredRules: [], triggered: false }; 
			for(var i=0; i < rules.length; i++){
				var ruleResult = evaluateRule(rule, rate);
				if(ruleResult === true){
					results.triggeredRules.push(rule.id);
					results.triggered = true;
				}
			}
		}
		return();
	} else {
		return({ triggeredRules: [], triggered: false });
	}
};

var evaluateRule = function evaluateRule(rule, rate){
	if(check.nonEmptyString(rule.type)){
		switch(rule.type){
			case "greaterThanEqualTo": return(rate >= rule.value);
			case "greaterThan": return(rate > rule.value);
			case "lessThanEqualTo": return(rate <= rule.value);
			case "lessThan": return(rate < rule.value);
		}
	}
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
        if(check.nonEmptyString(ri.id)){
            specifiers.push(util.format('"%s"', ri.id));
        }
    }
    logger.debug("Adding the following specifiers to service source URL.", specifiers);
    if(specifiers.length > 0){
        result += util.format(applicationConfig.currencyExchangeJsonService.serviceSourceQueryPattern, specifiers.join());
    }
    logger.debug("Built service source URL.", result);
    return(result);
};

/********************************************************
 * Finds the rates of interest in the service source 
 * object.
 ********************************************************/
var findRatesOfInterest = function findRatesOfInterest(body){
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
		rateResults.concat(body.query.results.rate);
	} else {
		rateResults.push(body.query.results.rate);
	}
		
	if(check.array(ratesToFind) && ratesToFind.length > 0){
		for(var i=0; i < ratesToFind.length; i++){	
			found = false;
			for(var j=0; j < rateResults; j++){
				if(ratesToFind[i].id == rateResults[j].id){
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
            var ratesOfInterest = findRatesOfInterest(body);
            if(ratesOfInterest){
            	compareRates(ratesOfInterest);
            }
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