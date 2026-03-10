<?php

/**
 * Check in the user to a stream or event
 * @class HTTP Communities checkin
 * @method POST
 * @static
 * @param {array} $_REQUEST
 * @param {string} $_REQUEST.userId User who we are checking in
 * @param {string} $_REQUEST.publisherId Event publisher
 * @param {string} $_REQUEST.streamName Event stream name
 */
function Calendars_checkin_post($params)
{
	$req = array_merge($_REQUEST, $params);
	Q_Valid::requireFields(array(
		'publisherId', 'streamName', 'userId', 'sig'
	), $req, true);

	$sig = Q::ifset($_REQUEST, 'sig', null);
	$len = Q_Config::get('Streams', 'invites', 'signature', 'length', 10);
	$fields = Q::take($_REQUEST, array(
		'publisherId', 'streamName', 'userId', 'expires', 'approve'
	));
	$fields2['u'] = $fields['userId'];
	if (!empty($fields['expires'])) {
		$fields2['e'] = $fields['expires'];
	}
	if ($sig !== substr(Q_Utils::signature($fields2), 0, $len)) {
		throw new Q_Exception_WrongValue(
			array('field' => 'sig', 'range' => 'a valid signature')
		);
	}
	if (!empty($fields['expires']) and time() > $fields['expires']) {
		throw new Q_Exception("Request made after time has expired", 'expires');
	}

	$currentUser = Users::loggedInUser(true);
	$userId = $req['userId'];
    $user = Users_User::fetch($userId, true);
	$publisherId = $req['publisherId'];
	$name = $req['streamName'];

	$eventStream = Streams_Stream::fetch($currentUser->id, $publisherId, $name);

	// set default 'message' slot
	Q_Response::setSlot('message', "");

    // check if admin
    $isAdmin = $eventStream->testWriteLevel(40);
    if(!$isAdmin) {
        // check if screener
        $participant = new Streams_Participant();
        $participant->publisherId = $eventStream->publisherId;
        $participant->streamName = $eventStream->name;
        $participant->streamType = $eventStream->type;
        $participant->userId = $currentUser->id;
        if (!($participant->retrieve(null, false, array("ignoreCache" => true)) && $participant->testRoles("screener"))) {
            throw new Users_Exception_NotAuthorized();
        }
    }

    $text = Q_Text::get("Calendars/content");

    // get participant
	$participant = new Streams_Participant();
	$participant->publisherId = $eventStream->publisherId;
	$participant->streamName = $eventStream->name;
	$participant->streamType = $eventStream->type;
	$participant->userId = $userId;
	$participant->state = "participating";
	// get or create this row
	if(!$participant->retrieve(null, false, array("ignoreCache" => true))){
		if (empty($req['join'])) {
			$user = Users_User::fetch($userId, true);
			$message = Q::text($text['QRScanner']['confirmParticipate'], array($user->displayName()));

			Q_Response::setSlot('message', $message);
			Q_Response::setSlot('participating', false);
			return;
		}

		// join user to event
		$participant = Calendars_Event::going($eventStream, $userId, 'yes', array("autoCharge" => true));
	}

    $paymentType = Q::ifset($eventStream->getAttribute("payment"), "type", null);
    $paid = $participant->getExtra('paid');
    if ($participant->testRoles('attendee')) {
        if ($checkedInByUserId = $participant->getExtra('checkedInByUserId')) {
            $checkedInByUserName = Users_User::fetch($checkedInByUserId, true)->displayName();
        } else {
            $checkedInByUserName = "unknown user";
        }
        Q_Response::setSlot('message', Q::text($text['QRScanner']['UserAlreadyCheckedIn'], array($user->displayName(), $checkedInByUserName)));
    } elseif ($paymentType !== "required" || $paid === 'fully') {
        Calendars_Event::grantRoles($participant,"attendee");
        $participant->setExtra(array('checkedInByUserId' => $currentUser->id));
        $participant->save();
    } elseif ($fields['approve']) {
        if (!$isAdmin) {
            throw new Users_Exception_NotAuthorized();
        }
        Calendars_Event::grantRoles($participant,"attendee");
        $participant->setExtra(array('checkedInByUserId' => $currentUser->id));
        $participant->save();
    } else {
        Calendars_Event::grantRoles($participant,"arrived");
        $participant->save();
    }

	Q_Response::setSlot('participating', true);
	Q_Response::setSlot('participant', $participant);
}