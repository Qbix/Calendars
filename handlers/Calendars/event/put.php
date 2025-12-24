<?php

/**
 * @module Streams
 * @class HTTP Streams event
 */

/**
 * Used to update event.
 * @method put
 *
 * @param {array} $_REQUEST
 */
function Calendars_event_put($params) {
	$params = array_merge($_REQUEST, $params);

    if (Q_Request::slotName("roles")) {
        $required = array("userId", "publisherId", "streamName", "role");
        Q_Valid::requireFields($required, $params, true);
        $r = Q::take($params, $required);

        $currentUser = Users::loggedInUser(true);
        $eventStream = Streams::fetchOne(null, $r['publisherId'], $r['streamName'], true);
        $communityId = $eventStream->getAttribute("communityId");
        $adminLabels = Q_Config::get("Calendars", "events", "admins", array());
        $isAdmin = $adminLabels ? (bool)Users::roles($communityId, $adminLabels, array(), $currentUser->id) : false;
        if(!$isAdmin) {
            throw new Users_Exception_NotAuthorized();
        }

        $participant = new Streams_Participant();
        $participant->publisherId = $r['publisherId'];
        $participant->streamName = $r['streamName'];
        $participant->userId = $r['userId'];
        if (!$participant->retrieve()) {
            throw new Exception("User ".$r['userId']." is not a participant of ".$r['publisherId'].":".$r['streamName']);
        }
        Calendars_Event::grantRoles($participant, $r['role']);
        $participant->save();

        Q_Response::setSlot('roles', true);
        return;
    }
}