<?php

function Calendars_after_Streams_relateTo_Media_webrtc($params) {
	$category = $params['category'];
	$stream = $params['stream'];

	Calendars_Event::postMessage($category, 'unrelate', $stream);
}