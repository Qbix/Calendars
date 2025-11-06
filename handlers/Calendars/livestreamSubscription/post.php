<?php

/**
 * Sets or unsets notification when any livestream is started in a teleconference of online event (when user clicks "Notify me when live" button in the event tool)
 *
 * @param {array} $params 
 * @param {string} [$params.publisherId] Required. The id of the event's publisher
 * @param {string} [$params.eventId] Required. The id of the event.
 * @return void
 */
function Calendars_livestreamSubscription_post($params)
{
	$r = array_merge($_REQUEST, $params);
	$required = array('action', 'eventId', 'publisherId');
	Q_Valid::requireFields($required, $r, true);
	$action = $r['action'];
	$publisherId = $r['publisherId'];
	$streamName = 'Calendars/event/' . $r['eventId'];
	$user = Users::loggedInUser(true);
	$stream = Streams_Stream::fetch($user->id, $publisherId, $streamName, true);
	$participant = $stream->getParticipant();
	$subscription = false;
	if ($action == 'subscribe') {
		if ($participant && $participant->subscribed == 'yes') {
			$subscription = $stream->subscription();
			if(!$subscription) {
				throw new Exception("User is subscribed but has no subscription record");
			}
			$currentFilters = json_decode($subscription->filter, true);
			$filterMessageTypes = $currentFilters['types'];
			array_push($filterMessageTypes, 'Calendars/event/livestream/started', 'Calendars/event/livestream/stopped');
			$currentFilters['types'] = $filterMessageTypes;
			$subscription->filter = Q::json_encode($currentFilters);
			$subscription->save();
		} else {
			$participant = $stream->subscribe([
				'filter' => [
					'types' => ['Calendars/event/livestream/started', 'Calendars/event/livestream/stopped']
				]
			]);
			$subscription = $stream->subscription();
		}
	} else {
		$going = $participant->getExtra('going');
		if ($going && $going == 'yes') {
			$subscription = $stream->subscription();
			if (!$subscription) {
				throw new Exception("User is subscribed but has no subscription record");
			}
			$currentFilters = json_decode($subscription->filter, true);
			$filterMessageTypes = $currentFilters['types'];
			for ($i = count($filterMessageTypes) - 1; $i >= 0; $i--) {
				if (in_array($filterMessageTypes[$i], ['Calendars/event/livestream/started', 'Calendars/event/livestream/stopped'])) {
					array_splice($filterMessageTypes, $i, 1); // Remove 1 element at current index
				}
			}
			$currentFilters['types'] = $filterMessageTypes;
			$subscription->filter = Q::json_encode($currentFilters);
			$subscription->save();
		} else {
			$participant = $stream->unsubscribe();
			$subscription = $stream->subscription();
		}
	}

	Q_Response::setSlot('stream', $stream);
	Q_Response::setSlot('subscription', $subscription);
	Q_Response::setSlot('participant', $participant);
}
