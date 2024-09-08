<?php
/**
 * Hook to relate event stream to Calendars/calendar/$experienceId stream
 * If Calendars/calendar/$experienceId stream don't exist - create one
 * @event Streams/create/Calendars_event {after}
 * @param {array} $params
 * @param {Streams_Stream} $params.event
 * @param {string} $options.experienceId
 */
function Calendars_after_Streams_create_Calendars_event($params)
{
	$event = $params['stream'];
	$communityId = $event->getAttribute("communityId");
	$startTime = $event->getAttribute("startTime");

	$experienceId = Q::ifset($params, 'experienceId', 'main');
	$experienceIds = is_array($experienceId) ? $experienceId : array("$experienceId");
	$categoryTypes = array("Calendars/calendar");
	foreach ($experienceIds as $experienceId) {
		foreach ($categoryTypes as $categoryType) {
			$name = $categoryType."/".$experienceId;
			$categoryStream = Streams_Stream::fetch($communityId, $communityId, $name);
			if (empty($categoryStream)) {
				$categoryStream = Streams::create(
					$communityId, $communityId, 'Streams/category', @compact('name')
				);
			}
			$event->relateTo($categoryStream, 'Calendars/events', null, array(
				'skipAccess' => true,
				'weight' => $startTime
			));
		}
	}
}