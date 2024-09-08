<?php

/**
 * @module Calendars
 */

/**
 * This handler read and return labels of selected user
 * @class Calendars event composer
 * @param {array} $options
 * @param {string} $publisherId The user id to read labels from
 * @constructor
 * @return array
 */
function Calendars_event_response_labels($options)
{
	$r = array_merge($_REQUEST, $options);
	$required = array("userId");
	Q_Valid::requireFields($required, $r, true);
	$r = Q::take($r, $required);

	$labelRows = Users_Label::fetch($r['userId'], 'Users/', array(
		'checkContacts' => true
	));
	
	$labels = array('Calendars/*' => 'Any');
	foreach ($labelRows as $label => $row) {
		$labels[$label] = $row->title;
	}

	return $labels;
}