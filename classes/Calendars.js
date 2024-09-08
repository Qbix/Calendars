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

var Streams = Q.plugins.Streams;
Streams.Message.define('Calendars/going', function () {}, {
	goingText: function (language) {
		var message = this.message || this;
		var text = Q.Text.get("Calendars/content", {
			language: language
		});

		switch (message.getInstruction('going')) {
			case 'yes':
				return Q.getObject(["event", "tool", "GoingTo"], text);
			case 'no':
				return Q.getObject(["event", "tool", "NotGoingTo"], text);
			case 'maybe':
				return Q.getObject(["event", "tool", "MaybeGoingTo"], text)
		}

		return 'undefined';
	}
});
