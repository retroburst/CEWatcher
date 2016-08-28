/********************************************************
 * Builds a paginated pulls model for the list pulls route.
 ********************************************************/
var buildListPullsModel = function buildListPullsModel(req, paginationURLPattern, callback){
    var pageNumber = parseInt(req.query.pageNumber) || 1;
    var pageSize = parseInt(req.query.pageSize) || req.app.locals.context.paginationPageSize;
    var skip = pageSize * (pageNumber-1);

    var pullsCollection = req.app.locals.context.datastore.getPullsCollection();
    
    pullsCollection.count({}, function(err, count){
        if(err === null){
            var totalPages = 1;
            if(count != 0) totalPages = Math.ceil(count / pageSize);
            pullsCollection.find({}, { limit : pageSize, skip : skip, sort : { date : -1 } }, function (err, pulls) {
                if(err === null){
                    var model = {
                        pulls : pulls,
                        pagination : {
                            pageNumber : pageNumber,
                            pageSize : pageSize,
                            totalPages : totalPages,
                            URLPattern : paginationURLPattern
                        }
                    };
                    if(callback) callback(null, model);
                } else {
                    if(callback) { callback(err, null); }
                    else { req.logger.error(err); }
                }
            });
        } else {
            if(callback) { callback(err, null); }
            else { req.logger.error(err); }
        }
    });
};

/********************************************************
 * Builds a paginated events model for the list events route.
 ********************************************************/
var buildListEventsModel = function buildListEventsModel(req, paginationURLPattern, callback){
    var pageNumber = parseInt(req.query.pageNumber) || 1;
    var pageSize = parseInt(req.query.pageSize) || req.app.locals.context.paginationPageSize;
    var skip = pageSize * (pageNumber-1);
    var eventsCollection = req.app.locals.context.datastore.getEventsCollection();
    
    eventsCollection.count({}, function(err, count){
        if(err === null){
            var totalPages = 1;
            if(count != 0) totalPages = Math.ceil(count / pageSize);
            eventsCollection.find({}, { sort : { date : -1 } }, function (err, events) {
                if(err === null){
                    var model = {
                        events : events,
                        pagination : {
                            pageNumber : pageNumber,
                            pageSize : pageSize,
                            totalPages : totalPages,
                            URLPattern : paginationURLPattern
                        }
                    };
                    if(callback) callback(null, model);
                } else {
                    if(callback) { callback(err, null); }
                    else { req.logger.error(err); }
                }
            });
        } else {
            if(callback) { callback(err, null); }
            else { req.logger.error(err); }
        }
    });
};

/********************************************************
 * Builds the diagnostics model for the diagnostics route.
 ********************************************************/
var buildDiagnosticsModel = function buildDiagnosticsModel(req, callback){
    var currencyExchangeJsonServiceRunInfo = req.app.locals.context.currencyExchangeJsonService.getScheduledRunInfo();
    var tailLogBuffer = req.app.locals.context.tailLogBuffer.getBuffer();
    var model = {
        localServerTime : new Date(),
        currencyExchangeJsonServiceRunInfo : currencyExchangeJsonServiceRunInfo,
        tailLogBuffer : tailLogBuffer
    };
    if(callback) callback(null, model);
};

/********************************************************
 * Builds the model for use by the index route.
 ********************************************************/
var buildHomeModel = function buildHomeModel(req, callback){
    var pullsCollection = req.app.locals.context.datastore.getPullsCollection();
    pullsCollection.find({}, { limit : 1, sort : { date : -1 } }, function (err, pulls) {
        if(err === null)
        {
            var eventsCollection = req.app.locals.context.datastore.getEventsCollection();
            eventsCollection.find({}, { limit : 5, sort : { date : -1 } }, function (err, events) {
                if(err === null){
                    var model = {
                        pulls : pulls,
                        events : events
                    };
                    if(callback) callback(null, model);
                } else {
                    if(callback) { callback(err, null); }
                    else { req.logger.error(err); }
                }
            });
        } else {
            if(callback) { callback(err, null); }
            else { req.logger.error(err); }
        }
    });
};

module.exports = {
    buildListPullsModel : buildListPullsModel,
    buildListEventsModel : buildListEventsModel,
    buildDiagnosticsModel : buildDiagnosticsModel,
    buildHomeModel : buildHomeModel
};