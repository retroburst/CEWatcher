/********************************************************
 * Event model.
 ********************************************************/
var event = function event() {
    this.ri_id = null;
    this.ri_name = null;
    this.rate = null;
    this.description = null;
    this.created = null;
}

/********************************************************
 * Pull model.
 ********************************************************/
var pull = function pull(){
    this.rates = [];
    this.created = null;
};

module.exports = {
    event : event,
    pull : pull
};