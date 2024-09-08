<?php
	
function Calendars_after_Streams_Stream_save_Assets_service($params)
{
	$assetsService = $params['stream'];

	$relatedAvailabilities = Streams_RelatedTo::select()->where(array(
		'toPublisherId' => $assetsService->publisherId,
		'toStreamName' => $assetsService->name,
		'type' => 'Calendars/availability'
	))->fetchDbRows();
	foreach ($relatedAvailabilities as $item) {
		$calendarsAvailability = Streams_Stream::fetch($item->fromPublisherId, $item->fromPublisherId, $item->fromStreamName, true);
		$calendarsAvailability->title = $assetsService->title;
		$calendarsAvailability->content = $assetsService->content;
		$calendarsAvailability->setAttribute('serviceTemplate', array(
			'publisherId' => $assetsService->publisherId,
			'streamName' => $assetsService->name,
			'price' => $assetsService->getAttribute('price'),
			'payment' => $assetsService->getAttribute('payment'),
			'link' => $assetsService->getAttribute('link')
		));
		$calendarsAvailability->changed();
	}
}