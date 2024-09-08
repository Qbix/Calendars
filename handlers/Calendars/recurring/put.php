<?php
/**
 * Used to change recurring category participant row extra
 *
 * @param {array} $params 
 * @param {string} [$params.publisherId] Required. The publisher of the recurring stream
 * @param {string} [$params.streamName] Required. The name of the recurring stream.
 * @param {string} [$params.recurringInfo] Required. Info about recurring array(period => .., days => ..., possibleDays => ...)
 *
 * @return void
 */
function Calendars_recurring_put($params)
{
	$r = array_merge($_REQUEST, $params);
	$required = array('streamName', 'publisherId', 'recurringInfo', 'action');
	Q_Valid::requireFields($required, $r, true);
	$publisherId = $r['publisherId'];
	$streamName = $r['streamName'];
	$action = $r['action'];

	$r['recurringInfo']['period'] = Q::ifset($r, 'recurringInfo', 'period', null);
	if (is_string($r['recurringInfo']['days'])) {
		try {
			$r['recurringInfo']['days'] = json_decode($r['recurringInfo']['days'], true);
		} catch (Exception $e) {}
	}
	$r['recurringInfo']['days'] = Q::ifset($r, 'recurringInfo', 'days', null); // important to have default value null, because empty array will lead to clear recurring dasy
	$r['recurringInfo']['startDate'] = Q::ifset($r, 'recurringInfo', 'startDate', null);
	$r['recurringInfo']['endDate'] = Q::ifset($r, 'recurringInfo', 'endDate', null);
	$r['recurringInfo']['relatedParticipants'] = Q::ifset($r, 'recurringInfo', 'relatedParticipants', null);
	if (is_string($r['recurringInfo']['relatedParticipants'])) {
		try {
			$r['recurringInfo']['relatedParticipants'] = json_decode($r['recurringInfo']['relatedParticipants'], true);
		} catch (Exception $e) {}
	}
	if ($r['recurringInfo']['days'] == "empty") {
		$r['recurringInfo']['days'] = array();
	}
	if ($r['recurringInfo']['relatedParticipants'] == "empty") {
		$r['recurringInfo']['relatedParticipants'] = array();
	}

	$eventStreamData = @compact('streamName', 'publisherId');
	$participant = Calendars_Recurring::getRecurringParticipant($eventStreamData);

	// change participated days for users
	if ($action == "settings") {
		// when requested from web we skip current stream when relate/unrelate related participants, to avoid unrelate of current event when user set "justonce"
		//$r['recurringInfo']['skipStream'] = true;
		// when requested from web we need to update participating and related participants of already created events too. For requests from cron we don't need it
		$r['recurringInfo']['updateExistingStreams'] = true;
		$participant = Calendars_Recurring::setRecurringParticipant($eventStreamData, $r['recurringInfo']);

		// for trips need individual algorithm
		if(strpos($streamName, 'Travel/trip/') === 0) {
			Q::event('Calendars/recurring/Travel/recurring', array(
				'participant' => $participant
			));
		}
	} elseif ($action == "admin") { // change recurring rules
		$eventStream = Calendars_Recurring::toStream(@compact("publisherId", "streamName"));
		$period = $r['recurringInfo']['period'];
		$days = $r['recurringInfo']['days'];
		$startDate = $r['recurringInfo']['startDate'];
		$endDate = $r['recurringInfo']['endDate'];
		$modified = false;

		$recurringStream = Calendars_Recurring::fromStream($eventStream);
		if ($period) {
			$recurringStream->setAttribute("period", $period);
			$modified = true;
		}
		// these two updates no need to inform users
		if ($startDate !== null) {
			$recurringStream->setAttribute("startDate", $startDate)->save();
		}
		if ($endDate !== null) {
			$recurringStream->setAttribute("endDate", $endDate)->save();
		}
		if (is_array($days)) {
			$recurringStream->setAttribute("days", $days);

			$days = implode(",", $days) ?: "none";

			// send special message to notify subscribed users
			$recurringStream->post($publisherId, array(
				'type' => 'Calendars/recurring/changed',
				'instructions' => array(
					'eventTitle' => $eventStream->title,
					'days' => $days,
					'url' => $eventStream->url()
				)
			), true);
			$modified = true;
		}

		if ($modified) {
			$recurringStream->changed();
		}
	}

	Q_Response::setSlot('participant', $participant);
}