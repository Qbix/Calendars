<?php
	
function Calendars_after_Streams_invite_accept ($params)
{
	$invite = $params['invite'];
	$label = "Calendars/staff";

	// set extra for Calendars/availability participants
	if (strpos($invite->streamName, 'Calendars/availability/') === 0) {
		$extra = $invite->getExtra("label");
		if ((is_array($extra) && in_array($label, $extra)) || $extra == $label) {
			$participant = new Streams_Participant();
			$participant->publisherId = $invite->publisherId;
			$participant->streamName = $invite->streamName;
			$participant->userId = $invite->userId;
			if ($participant->retrieve()) {
				$participant->setExtra('roles', array('staff'));
				$participant->save();
			}
		}
	}
}