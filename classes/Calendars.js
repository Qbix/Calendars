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
Streams.Message.define('Calendars/going/yes', function () {}, {
	goingText: function (language) {
		var text = Q.Text.get("Calendars/content", { language });
		return Q.getObject(["event", "tool", "GoingTo"], text);
	}
});

Streams.Message.define('Calendars/going/no', function () {}, {
	goingText: function (language) {
		var text = Q.Text.get("Calendars/content", { language });
		return Q.getObject(["event", "tool", "NotGoingTo"], text);
	}
});

Streams.Message.define('Calendars/going/maybe', function () {}, {
	goingText: function (language) {
		var text = Q.Text.get("Calendars/content", { language });
		return Q.getObject(["event", "tool", "MaybeGoingTo"], text);
	}
});