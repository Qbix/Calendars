<?php
/**
 * Hook to relate recurring category stream to Calendars/recurring/$experienceId stream
 * If Calendars/recurring/$experienceId stream doesn't exist - create one
 * @param {array} $params
 */
function Calendars_after_Streams_create_Calendars_recurring($params)
{
	$recurringStream = $params['stream'];
	$lastStream = Calendars_Recurring::getLastStream($recurringStream);

	if(!$lastStream instanceof Streams_Stream) {
		return;
	}

	$communityId = $lastStream->getAttribute("communityId", Users::communityId());

	if(empty($communityId)) {
		return;
	}

	// streams may not contain startTime. Then use endTime, which is same - stream start time
	$time = $lastStream->getAttribute("startTime", $lastStream->getAttribute("endTime"));

	$experienceId = Q::ifset($options, 'experienceId', 'main');
	$experienceIds = is_array($experienceId) ? $experienceId : array("$experienceId");
	foreach ($experienceIds as $experienceId) {
		$name = "Calendars/recurring/$experienceId";
		$categoryStream = Streams_Stream::fetch($communityId, $communityId, $name);
		if (!$categoryStream) {
			$categoryStream = Streams::create(
				$communityId, $communityId, 'Calendars/category', @compact('name')
			);
		}
		$recurringStream->relateTo($categoryStream, 'Calendars/recurring', null, array(
			'skipAccess' => true,
			'weight' => $time
		));
	}
}