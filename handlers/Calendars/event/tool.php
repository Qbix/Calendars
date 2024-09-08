<?php

/**
 * @module Calendars-tools
 */

/**
 * Renders interface for an event
 * @class Calendars event
 * @constructor
 * @param {Object} [$options] this is an object that contains parameters for this function
 *   @param {String} $options.publisherId The publisher id
 *   @param {String} $options.streamName The name of the stream
 *   @param {Object} $options.show
 *   @param {boolean} [$options.show.promote=true]
 *   @param {boolean} [$options.show.trips=true]
 *   @param {boolean} [$options.show.chat=true]
 *   @param {boolean} [$options.show.time=true]
 *   @param {boolean} [$options.show.local=true]
 *   @param {boolean} [$options.show.interests=true]
 *   @param {boolean} [$options.show.openTo=true]
 *   @param {Q.Event} [$options.onRefresh] Occurs when the tool is refreshed
 *   @param {Q.Event} [$options.onGoing] Occurs right after tool is refreshed or when someone clicks on on of the "going" buttons
 *   @param {Q.Event} [$options.onInvoke(button)] Occurs when the user clicks one of the buttons.
 *     The value of "button" depends on what is shown, see the "show" option.
 */
function Calendars_event_tool($options)
{
	Q_Response::setToolOptions($options);
	Q_Response::addScript('{{Calendars}}/js/tools/event.js', "Calendars");
	Q_Response::addStylesheet('{{Calendars}}/css/event.css', "Calendars");
	return '';
}