<?php

/**
 * @module Calendars
 */

/**
 * This handler read and return 'paid' participant extra of selected user
 * @class Calendars event paid
 * @param {array} $options
 * @param {string} $userId The user id to read from
 * @param {string} $publisherId Event publisher Id
 * @param {string} $streamName Event stream name
 * @return String
 */
function Calendars_event_response_paid($options)
{
	$r = array_merge($_REQUEST, $options);
	$required = array("userId", "publisherId", "streamName");
	Q_Valid::requireFields($required, $r, true);
	$r = Q::take($r, $required);

    $currentUser = Users::loggedInUser(true);
    $publisherId = $r['publisherId'];
    $streamName = $r['streamName'];
    $userId = $r['userId'];
    $eventStream = Streams::fetchOne(null, $publisherId, $streamName, true);
    $communityId = $eventStream->getAttribute("communityId");
    $adminLabels = Q_Config::get("Calendars", "events", "admins", array());
    $isAdmin = $adminLabels ? (bool)Users::roles($communityId, $adminLabels, array(), $currentUser->id) : false;
    if(!$isAdmin) {
        throw new Users_Exception_NotAuthorized();
    }

    $participant = new Streams_Participant();
    $participant->publisherId = $publisherId;
    $participant->streamName = $streamName;
    $participant->userId = $userId;
    if (!$participant->retrieve()) {
        throw new Exception("User ".$userId." is not a participant of ".$publisherId.":".$streamName);
    }
	
	return $participant->getExtra('paid') ?: 'no';
}