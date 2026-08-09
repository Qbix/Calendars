<?php

function Calendars_after_Streams_invite_response_suggestion($params)
{
    // check whether user is participating in any events
	$relations = Calendars_Event::participating(null, strtotime('-1 minute'), strtotime('+1 minute'), array('maybe', 'yes'), array(
		'dontFilterUsers' => true,
		'relationsOnly' => true
	));

    if ($relations) {
        Q_Response::setSlot('hide', array('contacts', 'share', 'social'));
    }
}