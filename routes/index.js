// requires
var express = require('express');
var loggerWrapper = require('log4js-function-designation-wrapper');

// variables
var routerHelpers = require('../modules/router-helpers');
var router = express.Router();
var logger = loggerWrapper(global.logger, "routes->index");

// constants
const LIST_PULLS_PAGINATION_PATTERN = "/list-pulls/?pageNumber=%s&pageSize=%s";
const LIST_EVENTS_PAGINATION_PATTERN = "/list-events/?pageNumber=%s&pageSize=%s";

/********************************************************
 * Index route.
 ********************************************************/
router.get('/', function(req, res, next) {
    routerHelpers.buildHomeModel(req, function(err, model){
        if(err) {
            next(err);
        } else {
            res.render('index', { title : 'Home', model : model });
        }
    });
});

/********************************************************
 * List the pull documents route.
 ********************************************************/
router.get('/list-pulls', function(req, res, next){
    routerHelpers.buildListPullsModel(req, LIST_PULLS_PAGINATION_PATTERN, function(err, model){
        if(err) {
            next(err);
        } else {
            res.render('list-pulls', { title : 'List of Pulls from ANZ Bank', model : model });
        }
    });
});

/********************************************************
 * List the event documents route.
 ********************************************************/
router.get('/list-events', function(req, res, next){
    routerHelpers.buildListEventsModel(req, LIST_EVENTS_PAGINATION_PATTERN, function(err, model){
        if(err) {
            next(err);
        } else {
            res.render('list-events', { title : 'List of Events', model : model });
        }
    });
});

/********************************************************
 * Show diagnostics route.
 ********************************************************/
router.get('/diagnostics', function(req, res, next){
    routerHelpers.buildDiagnosticsModel(req, function(err, model){
        if(err) {
            next(err);
        } else {
            res.render('diagnostics', { title : 'Diagnostics', model : model });
        }
    });
});

/********************************************************
 * Test email send route.
 ********************************************************/
//router.get('/test-email-send', function(req, res, next){
//    req.app.locals.context.bankProductJsonService.testEmailSend();
//    res.redirect('/diagnostics');
//});

module.exports = router;
