/**
 * Class representing event rows.
 *
 * This description should be revised and expanded.
 *
 * @module Calendars
 */
var Q = require('Q');
var Db = Q.require('Db');
var Event = Q.require('Base/Calendars/Event');

/**
 * Class representing 'Event' rows in the 'Calendars' database
 * <br>stored additional info for Calendars/event
 * @namespace Calendars
 * @class Event
 * @extends Base.Calendars.Event
 * @constructor
 * @param {Object} fields The fields values to initialize table row as
 * an associative array of {column: value} pairs
 */
function Calendars_Event (fields) {

	// Run mixed-in constructors
	Calendars_Event.constructors.apply(this, arguments);
	
	/*
 	 * Add any privileged methods to the model class here.
	 * Public methods should probably be added further below.
	 */
}

Q.mixin(Calendars_Event, Event);

/*
 * Add any public methods here by assigning them to Calendars_Event.prototype
 */

/**
 * The setUp() method is called the first time
 * an object of this class is constructed.
 * @method setUp
 */
Calendars_Event.prototype.setUp = function () {
	// put any code here
	// overrides the Base class
};

module.exports = Calendars_Event;