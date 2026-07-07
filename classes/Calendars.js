"use strict";
/*jshint node:true */
/**
 * Calendars plugin
 * @module Calendars
 * @main Calendars
 */
var Q = require('Q');

/**
 * Static methods for the Calendars model
 * @class Calendars
 * @extends Base.Calendars
 * @static
 */
function Calendars() { }
module.exports = Calendars;

var Streams_Message = Q.require('Streams/Message');

Streams_Message.define('Calendars/going', function () {}, {
	goingText: function (language) {
		var going = this.getInstruction('going') || 'yes';
		var key = going === 'no' ? 'NotGoingTo'
			: (going === 'maybe' ? 'MaybeGoingTo' : 'GoingTo');
		return Q.getObject(["event", "tool", key], Q.Text.get("Calendars/content", { language }));
	}
});