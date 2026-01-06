<?php

function Calendars_after_Streams_relateTo_Media_webrtc($params) {
	/* $category = $params['category'];
	$stream = $params['stream'];
	$webrtcStream = $params['category'];

	if($stream->type === 'Media/webrtc/livestream' && $webrtcStream->fields['publisherId'] === $stream->fields['publisherId']) {
		list($relations, $streams) = $webrtcStream->related(null, false, array(
			'type' => 'Media/webrtc',
			'where' => array(
				'toStreamName' => new Db_Range('Calendars/event/', false, false, true)
			),
			'skipAccess' => true
		));
		$streamEvent = reset($streams);
		if (empty($streamEvent)) {
			return;
		}

	}
	Calendars_Event::postMessage($category, 'relate', $stream); */
}