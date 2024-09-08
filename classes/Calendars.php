<?php

/**
 * Calendars
 * @module Calendars
 * @main Calendars
 */
/**
 * Static methods for the Calendars plugin
 * @class Calendars
 * @abstract
 */
class Calendars
{
	/**
	 * @static
	 * @method defaultDateFilter
	 */
	static function defaultDateFilter($experienceId = 'main', $today = null)
	{
		if (!$today) {
			$today = date("Y-m-d"); // NOTE; this is the date on the server
		}
		$dates = Calendars::experience($experienceId)->getAttribute('dates', array());
		$today = Q::ifset($_REQUEST, 'today', date("Y-m-d"));
		$day = null;
		foreach ($dates as $year => $arr1) {
			if (!$arr1) continue;
			foreach ($arr1 as $month => $arr2) {
				if (!$arr2) continue;
				foreach ($arr2 as $day) {
					if ($today === "$year-$month-$day") {
						$date = "$year-$month-$day";
					}
				}
			}
		}
	}

	/**
	 * Get all the Groups/group streams the user is participating in,
	 * as related to their "Calendars/participating/events" category stream.
	 * @method participating
	 * @param {string} [$userId=Users::loggedInUser()] The user who is participating
	 * @param {integer} [$fromTime=null] The earliest endTime timestamp of the stream
	 * @param {integer} [$untilTime=null] The latest startTime timestamp of the stream
	 * @param {string|array} [$going=null] Filter by either "yes" or "no" or "maybe"
	 * @return {array} The streams, filtered by the above parameters
	 */
	static function participating(
		$userId = null,
		$fromTime = null,
		$untilTime = null,
		$going = null,
		$options = array()
	) {
		if (!isset($userId)) {
			$userId = Users::loggedInUser(true)->id;
		}
		if (is_string($going)) {
			$going = array($going);
		}

		$query = Streams_RelatedTo::select()
			->where(array(
				'toPublisherId' => $userId,
				'toStreamName' => "Streams/participating",
				'type' => 'Calendars/event'
			))->orderBy('weight', false);

		$relations = $query->fetchDbRows();

		if (empty($relations)) {
			return array();
		}

		$criteria = array();

		// filter relations
		foreach ($relations as $name => $r) {
			$startTime = $r->getExtra('startTime');
			$endTime = $r->getExtra('endTime', $startTime + Calendars_Event::defaultDuration());

			if (($fromTime and $endTime < $fromTime)
				or ($untilTime and $startTime > $untilTime)
				or $going == null
				or ($going !== null and !in_array($r->getExtra('going', 'no'), $going))) {
				continue;
			}
			$criteria[$r->fromPublisherId.$r->fromStreamName] = array($r->fromPublisherId, $r->fromStreamName);
		}

		$streams = Streams_Stream::select()->where(array(
			'publisherId,name' => $criteria,
			'closedTime' => NULL
		))->fetchDbRows();

		return $streams;
	}

	/**
	 * Get the capability object that will be sent in "Q.plugins.Calendars.capability" 
	 * Its signature will be used for subscribing to the Calendars/personal/:userId.ics
	 * @method capability
	 * @static
	 * @return Q_Capability
	 */
	static function capability($userId)
	{
		return new Q_Capability(
			array('Calendars/personal'),
			compact('userId')
		);
	}
	
	/**
	 * Get or create Calendars/calendar/$experienceId stream for some community
	 * @method eventsCalendars
	 * @param $communityId
	 * @param [$title=null] The title to use, if creating one
	 * @param [$experienceId='main'] The experienceId, defaults to main
	 * @return Streams_Stream
	 */
	static function eventsCalendar($communityId, $title = null, $experienceId = 'main') {
		$streamName = "Calendars/calendar/$experienceId";
		$stream = Streams_Stream::fetch($communityId, $communityId, $streamName);
		if (!($stream instanceof Streams_Stream)) {
			$stream = Streams::create($communityId, $communityId, 'Calendars/calendar', array(
				'name' => $streamName,
				'title' => $title
			));
		}
		return $stream;
	}
}