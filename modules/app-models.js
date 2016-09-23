/********************************************************
 * Event model.
 ********************************************************/
var event = function event() {
    this.ri_id = null;
    this.ri_name = null;
    this.old_rate = null;
    this.new_rate = null;
    this.description = null;
    this.created = null;
};

/********************************************************
 * Pull model.
 ********************************************************/
var pull = function pull(){
    this.rates = null;
    this.created = null;
};

/********************************************************
 * Notification model.
 ********************************************************/
var notification = function notification() {
	this.ri_id = null;
    this.ri_name = null;
	this.triggered_rules = [];
	this.created = null;
};

module.exports = {
    event : event,
    pull : pull,
    notification : notification
};