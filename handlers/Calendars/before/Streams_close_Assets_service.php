<?php
/**
 * Hook to remove all related Calendars/availabilities streams before remove assets service.
 * @event Streams/close/Assets_service {before}
 * @param {array} $params
 */
function Calendars_before_Streams_close_Assets_service($params)
{
	$stream = $params['stream'];

	$relatedAvailabilities = Streams_RelatedTo::select()->where(array(
		'toPublisherId' => $stream->publisherId,
		'toStreamName' => $stream->name,
		'type' => 'Calendars/availability'
	))->fetchDbRows();
	foreach ($relatedAvailabilities as $item) {
		Streams::close($item->fromPublisherId, $item->fromPublisherId, $item->fromStreamName, array(
			'skipAccess' => true
		));
	}
}