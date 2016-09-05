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
var underscore = require('underscore');

// modules
var appConstants = require('./app-constants');
var models = require('./app-models');

// variables
var applicationConfig = null;
var logger = null;
var datastore = null;
var emailTemplate = null;
var pullJob = null;

//TODO: add debugging / info logging 

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
	datastore.getEventsCollection().insert(rateChange, handleInsertNewEventDocEvent);
};

/********************************************************
 * Handles the insert result of a new notification 
 * document.
 ********************************************************/
var handleInsertNewNotificationDocEvent = function handleInsertNewNotificationDocEvent(err, doc){
    if(err){
        logger.error(err);
    } else {
        logger.info("Inserted new notification doc.");
    }
};

/********************************************************
 * Inserts a new notification document.
 ********************************************************/
var insertNewNotificationEvent = function insertNewNotificationEvent(notification){
	datastore.getNotificationsCollection().insert(notification, handleInsertNewNotificationDocEvent);
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
          		for(var i=0; i < configuredRatesOfInterest.length; i++) {
	          		for(var j=0; j < ratesOfInterest.length; j++) {
              		// if this rateis in the last pull
                  if(configuredRatesOfInterest[i].id === ratesOfInterest[j].id)
                  {	
                		var rulesResult = evalutaeRules(configuredRatesOfInterest[i].notifyRules, ratesOfInterest[j].Rate);
                    if(rulesResult.triggered)
                    {
											var processedRateChange = processRateChange(
													configuredRatesOfInterest[i], 
													ratesOfInterest[j], 
													lastPullRates[configuredRatesOfInterest[i].id], 
													rulesResult);  
											if(processedRateChange !== null) { changedRates.push(processedRateChange); }
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
 * Process the rate change by checking the last notification
 * created date for this rate of interest.
 ********************************************************/
var processRateChange = function processRateChange(configRate, sourceRate, lastPullRate, rulesResult){
	var result = null;
	datastore.getNotificationsCollection().find({ ri_id : configRate.id }, { limit : 1, sort : { created: -1 } }, function (err, notifications) {
    if(err){
        logger.error("Failed to get latest notification from the datastore.", err);
    } else {  
		  if(shouldSendNotification(notifications)){
				var rateChange = new models.event();
				rateChange.ri_id = configRate.ri_id;
				rateChange.ri_name = configRate.ri_name;
				rateChange.old_rate = lastPullRate ? lastPullRate.Rate : null;
				rateChange.new_rate = sourceRate.Rate;
				rateChange.created = new Date();
				rateChange.description = buildRateChangeDescription(rateChange);
				logger.info(rateChange.description);
				insertNewEventDoc(rateChange);
				result = rateChange;
				
				var rateChangeNotification = new models.notification();    
				rateChangeNotification.ri_id = configRate.ri_id;
				rateChangeNotification.ri_name = configRate.ri_name;
				rateChangeNotification.triggered_rules = rulesResult.triggeredRules;
				rateChangeNotification.created = new Date();
				insertNewNotificationEvent(rateChangeNotification);
		  }  
  }                   		
	return(result);
};

/********************************************************
 * Determines if a notification of a change 
 * should be sent.
 ********************************************************/
var shouldSendNotification = functionshouldSendNotification(notifications, configRate, sourceRate, rulesResult){
	if(notifications === null || notifications.length === 0){
		return(true);
	} else if (){
		// check if in triggered rules of last notification
		var lastNotification = notifications[0];
		var triggeredIntersection = underscore.intersection(rulesResult.triggeredRules, lastNotifications.triggered_rules);
		if(triggeredIntersection.length > 0){
			// if in the triggered rules list - check how long ago it was compared to configured threshold
			for(var i=0; i < triggeredIntersection.length; i++){			
				// if in list but longer than threshold return true
				if(olderThanThreshold(lastNotification.created)){
					return(true);
				}
			}
			return(false);
		}
	}
	return(true);
};

/********************************************************
 * Determines if the last notification for a particular
 * rate change is older than the threshold in hours.
 ********************************************************/
var olderThanThreshold = function olderThanThreshold(notificationDate){
	var notificationDateMoment = moment(notificationDate);
	var nowMoment = moment(new Date());
	var threshold = applicationConfig.currencyExchangeJsonService.notificationThresholdHours;
	var difference = nowMoment.diff(notificationMoment, 'hours');
	return(difference > threshold);
};

/********************************************************
 * Evaluates the notification rules to determine if any
 * trigger.
 ********************************************************/
var evalutaeRules = function evaluateRule(rules, rate){
	var results = { triggeredRules: [], triggered: false };
	if(check.array(rules) && check.number(rate)){		 
			for(var i=0; i < rules.length; i++){
				var ruleResult = evaluateRule(rule, rate);
				if(ruleResult === true){
					results.triggeredRules.push(rule.id);
					results.triggered = true;
				}
			}
		}
		return(results);
	} else {
		return({ triggeredRules: [], triggered: false });
	}
};

/********************************************************
 * Evaluates a notification  rule.
 ********************************************************/
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