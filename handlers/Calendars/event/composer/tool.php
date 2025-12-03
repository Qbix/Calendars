<?php

/**
 * @module Calendars
 */

/**
 * This tool lets the user plan a new event
 * @class Calendars event composer
 * @param {array} $options
 * @param {string} [$publisherId=Users::loggedInUser()->id] The user id to publish the event as
 * @constructor
 * @return string
 */
function Calendars_event_composer_tool($options)
{
	$user = Users::loggedInUser(true);
	$publisherId = Q::ifset($options, 'publisherId', null);

	Q_Response::setToolOptions($options);

	$l = Streams_Stream::fetch(null, $user->id, 'Places/user/location');
	$locationDefined = $l && $l->getAttribute('latitude') && $l->getAttribute('longitude')
		? 'true'
		: 'false';
	$datePicker = Q_Html::tag('input', array(
		'name' => 'date',
		'id' => 'date',
		'min' => date("Y-m-d", strtotime('today')),
		'max' => date("Y-m-d", strtotime('today + 1 year')),
		'class' => 'Calendars_event_composer_date'
	));
	$times = array();
	for ($i = 0; $i < 24; ++$i) {
		$h = $i % 24;
		for ($m = 0; $m < 60; $m += 15) {
			$hh = sprintf("%02d", $h);
			$mm = sprintf("%02d", $m);
			$times["$hh:$mm"] = ($h < 12)
				? ($h ? $h : 12).":$mm am"
				: ($h > 12 ? $h - 12 : $h).":$mm pm";
		}
	}
	$timeRange = Q_Html::smartTag('select', array(
		'name' => 'time',
		'id' => 'time',
		'class' => 'Calendars_event_composer_time'
	), '15:15', $times);
	$defaults = Q_Config::expect('Calendars', 'events', 'defaults');
	$peopleMin = Q::ifset($defaults, 'peopleMin', 2);
	$peopleMax = Q::ifset($defaults, 'peopleMax', 10);
	$communityId = Q::ifset($options, 'communityId', Users::communityId());

	// decide whether show "Select Publisher" bitton
	$newEventAuthorized = Q::ifset($options, 'publishers', array());
	$showPublisher = false;
	if (count($newEventAuthorized) > 1 || (count($newEventAuthorized) == 1 && !in_array($user->id, $newEventAuthorized))) {
		$showPublisher = true;
	}

	// show options
	$show = array(
		'location' => Q_Config::get('Calendars', 'newEvent', 'location', true),
		'livestream' => Q_Config::get('Calendars', 'newEvent', 'livestream', true),
		'externalLinks' => Q_Config::get('Calendars', 'newEvent', 'externalLinks', true)
	);

    // default payment options
    $payment = Q_Config::get('Calendars', 'events', 'defaults', 'payment', []);

	// collect labels for publisher
	$labelsUserId = $publisherId ? $publisherId : $user->id;
	$labels = Q::event('Calendars/event/response/labels', array('userId' => $labelsUserId));

	return Q::view('Calendars/templates/event/composer.handlebars', @compact(
		'locationDefined', 'datePicker', 'timeRange', 'peopleMin', 'peopleMax', 'communityId', 'showPublisher',
		'labels', 'show', 'payment'
	));
}