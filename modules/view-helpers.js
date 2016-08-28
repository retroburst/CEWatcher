// requires
var util = require('util');
var moment = require('moment');
var momentDurationFormat = require("moment-duration-format");

// modules
var appConstants = require('./app-constants');

/********************************************************
 * Build the title for views.
 ********************************************************/
var buildTitle = function buildTitle(title)
{
    if(title){
        return(util.format("%s - %s", title, appConstants.APP_NAME));
    } else {
        return(appConstants.APP_NAME);
    }
};
/********************************************************
 * Formats a date using moment and format string from 
 * constants.
 ********************************************************/
var formatDate = function formatDate(target){
    if(target){
        if(target instanceof moment){
            return(target.format(appConstants.DISPLAY_DATE_FORMAT));
        } else if (target instanceof Date) {
            return(moment(target).format(appConstants.DISPLAY_DATE_FORMAT));
        }
    }
};

/********************************************************
 * Generates the class for a output log on the diagnostics
 * page.
 ********************************************************/
var generateLabelClassForLogEntry = function generateLabelClassForLogEntry(log){
    if(log){
        if(/ERROR/.test(log)) { return("label label-danger"); }
        else if(/INFO/.test(log)) { return("label label-success"); }
        else if(/DEBUG/.test(log)) { return("label label-default"); }
        else if(/WARN/.test(log)) { return("label label-warning"); }
        else if(/TRACE/.test(log)) { return("label label-default"); }
        else if(/FATAL/.test(log)) { return("label label-danger"); }
        else if(/MARK/.test(log)) { return("label label-default"); }
    }
};

/********************************************************
 * Formats the uptime duration for display on diagnostics
 * page.
 ********************************************************/
var formatUptimeDuration = function formatUptimeDuration(){
    var uptime = moment.duration(process.uptime(), 'seconds');
    return(uptime.format("Y [year(s),] M [month(s),] W [week(s),] D [day(s),] H [hour(s),] m [minute(s),] s [second(s)]"));
};

module.exports = {
    buildTitle : buildTitle,
    formatDate : formatDate,
    generateLabelClassForLogEntry : generateLabelClassForLogEntry,
    formatUptimeDuration : formatUptimeDuration
};
