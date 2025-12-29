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
		'publisherId', 'streamName', 'userId', 'expires'
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
	$publisherId = $req['publisherId'];
	$name = $req['streamName'];

	$eventStream = Streams_Stream::fetch($currentUser->id, $publisherId, $name);

	$communityId = $eventStream->getAttribute("communityId");
	$adminLabels = Q_Config::get("Calendars", "events", "admins", array());

	// set default 'message' slot
	Q_Response::setSlot('message', "");

	if ($publisherId != $currentUser->id) {
		$isAdmin = $adminLabels ? (bool)Users::roles($communityId, $adminLabels, array(), $currentUser->id) : false;
		if(!$isAdmin) {
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
	if(!$participant->retrieve()){
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

    if ($participant->getExtra('checkin') === true) {
        $user = Users_User::fetch($userId, true);
        if ($checkedInByUserId = $participant->getExtra('checkedInByUserId')) {
            $checkedInByUserName = Users_User::fetch($checkedInByUserId, true)->displayName();
        } else {
            $checkedInByUserName = "unknown user";
        }
        Q_Response::setSlot('message', Q::text($text['QRScanner']['UserAlreadyCheckedIn'], array($user->displayName(), $checkedInByUserName)));
    } else {
        $participant->setExtra(array('checkin' => true));
        $participant->setExtra(array('checkedInByUserId' => $currentUser->id));
        $participant->grantRoles('attendee');
        $participant->state = 'participating';
        $participant->streamType = $eventStream->type;
        $participant->save();

        // send message to inform all clients
        $eventStream->post($publisherId, array(
            'type' => 'Calendars/checkin',
            'instructions' => array(
                'userId' => $userId,
                'checkin' => true
            )
        ));
    }

	Q_Response::setSlot('participating', true);
	Q_Response::setSlot('participant', $participant);
}