<?php
	
function Calendars_after_Streams_invite ($params)
{
	$publisherId = Q::ifset($params, 'publisherId', null);
	$streamName = Q::ifset($params, 'streamName', null);
	$userId = reset(Q::ifset($params, 'userIds', array()));

	// set extra for Calendars/availability participants
	if (strpos($streamName, 'Calendars/availability/') === 0) {
		if (Users::roles($publisherId, array('Calendars/staff'), array(), $userId)) {
			$participant = new Streams_Participant();
			$participant->publisherId = $publisherId;
			$participant->streamName = $streamName;
			$participant->userId = $userId;
			if ($participant->retrieve()) {
				$participant->setExtra('roles', array('staff'));
				$participant->save();

				$stream = Streams_Stream::fetch(null, $publisherId, $streamName);
				$stream->post($userId, array(
					'type' => 'Streams/join',
					'instructions' => array(
						'extra' => array(
							'role' => 'staff'
						)
					)
				), true);
			}
		}
	}
}