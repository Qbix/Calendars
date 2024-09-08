<?php

/**
 * @module Calendars
 */

/**
 * This tool lets the user plan a new event
 * @class Calendars service browser
 * @param {array} $options
 * @param {string} [$publisherId=Users::loggedInUser()->id] The user id to publish the event as
 * @constructor
 * @return string
 */
function Calendars_service_browser_tool($options)
{
	Q_Response::setToolOptions($options);

	// show options
	$show = array(
		'location' => Q_Config::get('Calendars', 'service', 'browser', 'location', true),
		'livestream' => Q_Config::get('Calendars', 'service', 'browser', 'livestream', false),
		'eventUrl' => Q_Config::get('Calendars', 'service', 'browser', 'eventUrl', true)
	);

	$multipleSelect = Q_Config::get('Calendars', 'timeslots', 'multipleSelect', false);

	Q_Response::addStylesheet("{{Calendars}}/css/serviceBrowser.css", "Calendars");

	return Q::view('Calendars/templates/event/reservation.handlebars', @compact('multipleSelect', 'show'));
}