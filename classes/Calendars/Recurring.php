<?php
/**
 * @module Calendars
 */
/**
 * Class for dealing with calendar recurring streams
 * 
 * @class Calendars_Recurring
 */
class Calendars_Recurring
{
	private static $WEEK_DAYS = array('Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat');
	
	/**
	 * Create Calendars/recurring category stream
	 * @method create
	 * @param {string} $publisherId
	 * @param {array} $recurringInfo
	 * @param {string} $recurringInfo.period Required. for example "weekly" or "monthly"
	 * @param {array} $recurringInfo.days Required.
	 * @param {object} $recurringInfo.recurringCategory Recurring category stream. If absent - new will created.
	 * @param {array} [$options=array()]
	 * @param {string} [$options.asUserId] Defaults to the logged-in user's id
	 * @return Streams_Stream
	 */
	static function create($publisherId, $recurringInfo, $options = array())
	{
		$userId = Q::ifset($options, 'asUserId', $publisherId);

		// create category stream for recurring streams
		$fields = array(
			'attributes' => array(
				'period' => Q::ifset($recurringInfo, "period", "weekly"),
				'days' => $recurringInfo["days"]
			)
		);

		return Streams::create($userId, $publisherId, 'Calendars/recurring', $fields);
	}
	/**
	 * Get actual stream from array("publisherId" => ..., "streamName" => ...) or return stream itself
	 * @method toStream
	 * @param {object|array} $stream Required. Stream or array with keys "publisherId" and "streamName"
	 * @throws {Q_Exception_WrongType} If $stream is not stream and not array
	 * @throws {Q_Exception_MissingRow} If recurring category absent
	 * @return Streams_Stream
	 */
	static function toStream ($stream) {
		if ($stream instanceof Streams_Stream) {
			return $stream;
		}
		if (!is_array($stream)
			or !isset($stream['publisherId'])
			or !isset($stream['streamName'])) {
			throw new Q_Exception_WrongType(array(
				'field' => 'stream',
				'type' => 'Streams_Stream'
			));
		}
		return Streams_Stream::fetch(
			$stream['publisherId'], $stream['publisherId'], $stream['streamName'], true
		);
	}
	/**
	 * get or create participant to this recurring category stream
	 * @method getRecurringParticipant
	 * @param {object|array} $stream Required. Event stream or array with keys "publisherId" and "streamName"
	 * @param {string} $userId Optional. User id. If empty - current logged user use.
	 * @throws {Q_Exception_MissingRow} If recurring category absent
	 * @return object
	 */
	static function getRecurringParticipant($stream, $userId = null)
	{
		$userId = $userId ?: Users::loggedInUser(true)->id;

		$stream = self::toStream($stream);

		// get Calendar/recurring stream
		$recurringCategory = self::fromStream($stream);

		if (!$recurringCategory) {
			$parts = explode('/', $stream->type);
			$type = ucfirst(end($parts));
			throw new Calendars_Exception_NotRecurring(@compact('type'));
		}

		// get or create participant in Calendar/recurring stream
		$participant = new Streams_Participant();
		$participant->publisherId = $recurringCategory->publisherId;
		$participant->streamName = $recurringCategory->name;
		$participant->userId = $userId;
		$participant->streamType = $recurringCategory->type;
		if (!$participant->retrieve(null, false, array("ignoreCache" => true))) {
			$participant->state = "participating";
			$participant->save();
		}

		return $participant;
	}
	/**
	 * Calculate new recurring time
	 * @method calculateTime
	 * @param {int} $time Required. Unix timestamp
	 * @param {array} $recurringInfo Required.
	 * @return number|bool Unix timestamp for new start date
	 */
	static function calculateTime ($time, $recurringInfo) {
		if (!is_array($recurringInfo['days']) || !count($recurringInfo['days'])) {
			//TODO log "wrong days"
			return false;
		}

		// get start time for UTC timezone
		$newTime = $time;

		// get current timestamp for UTC timezone
		$date_utc = (new DateTime(null, new DateTimeZone("UTC")))->getTimestamp();

		// for weekly period
		if ($recurringInfo['period'] == "weekly") {
			// days counter
			$days = 0;

			// search next day when event will occur
			while (1){

				$days++;

				// $days don't contain week days
				if ($days > 365) {
					//TODO log "Calendars_Recurring::calculateTime: days invalid!"
					return false;
				}

				$newTime = (int)$time + ($days * 24 * 60 * 60);

				// if new time > current time and week day in array of recurring days - we found next day
				if ($newTime > $date_utc && in_array(date("D", $newTime), array_keys($recurringInfo['days']))) {
					break;
				}
			}
		}

		return $newTime;
	}
	/**
	 * get last added recurring stream to recurring category
	 * @method getLastStream
	 * @static
	 * @param {Streams_Stream} $recurringStream Required. Recurring category stream.
	 * @return Streams_Stream|null
	 */
	static function getLastStream ($recurringStream) {
		$lastRelated = Streams_RelatedTo::select()->where(array(
			"toPublisherId" => $recurringStream->publisherId,
			"toStreamName" => $recurringStream->name,
			"type" => "Calendars/recurring"
		))->orderBy("weight", false)->limit(1)->fetchDbRow();
		if (!$lastRelated) { return null; }

		$stream = Streams_Stream::fetch($lastRelated->fromPublisherId, $lastRelated->fromPublisherId, $lastRelated->fromStreamName);

		return $stream;
	}
	/**
	 * get Recurring category stream
	 * @method fromStream
	 * @static
	 * @param {Streams_Stream} $stream Required. Stream or array("publisherId" => ..., "streamName" => ...)
	 * @return object
	 */
	static function fromStream ($stream) {
		try {
			$stream = self::toStream($stream);
		} catch(Exception $e) {
			return null;
		}

		$recurringCategory = $stream->related(
			$stream->publisherId,
			false,
			array(
				'limit' => 1,
				'type' => 'Calendars/recurring',
				'streamsOnly' => true
			)
		);

		$recurringCategory = $recurringCategory ?: array();

		// get first array element
		$recurringCategory = reset($recurringCategory);

		return $recurringCategory;
	}
	/**
	 * Turn stream to recurring.
	 * @method makeRecurring
	 * @static
	 * @param {object} $stream Required. Stream need to make as recurring.
	 * Can be array("publisherId" => ..., "streamName" => ...)
	 * Stream MUST contain attribute "startTime" or "endTime".
	 *
	 * @param {array} $recurringInfo Required. Info about recurring.
	 * @param {string} $recurringInfo.period Required. for example "weekly", "monthly"
	 * @param {array} $recurringInfo.days Required. Array of days, for example array("Mon", "Wed", "Fri")
	 * @param {object} [$recurringInfo.recurringCategory] Recurring category stream where to stream will related.
	 * @param {boolean} [$recurringInfo.skipParticipating=false] If true skip user participating to event.
	 * If absent - new will created.
	 *
	 * @return Streams_Stream Recurring category stream
	 */
	static function makeRecurring($stream, $recurringInfo) {
		if (is_string($recurringInfo)) {
			try {
				$recurringInfo = json_decode($recurringInfo, true);
			} catch (Exception $e) {}
		}

		// recurring info must contain "period" and "days"
		if (!is_array($recurringInfo) || empty($recurringInfo['period']) || empty($recurringInfo['days'])) {
			return null;
		}

		$stream = self::toStream($stream);

		// recurring category already defined
		if (empty($recurringInfo['recurringCategory'])) {
			// if days is array of days, reformat it to array with keys days and values empty array
			foreach ($recurringInfo["days"] as $day => $timeSlots) {
				if (!is_array($timeSlots)) {
					$recurringInfo["days"][$timeSlots] = array();
					unset($recurringInfo[$day]);
				}
			}
			$recurringCategory = self::create($stream->publisherId, $recurringInfo);
		} else {
			$recurringCategory = self::toStream($recurringInfo['recurringCategory']);
			$days = $recurringCategory->getAttribute("days");
			$days_modified = false;
			foreach ($recurringInfo["days"] as $day => $timeSlots) {
				if (in_array($day, array_keys($days))) {
					continue;
				}

				$days[$day] = $timeSlots;
				$days_modified = true;
			}
			if ($days_modified) {
				$recurringCategory->setAttribute("days", $days)->save();
			}
		}

		// weight - one of startTime or endTime
		$time = (int)$stream->getAttribute('startTime') ?: (int)$stream->getAttribute('endTime');

		// relate stream to category
		Streams::relate(
			null,
			$recurringCategory->publisherId,
			$recurringCategory->name,
			"Calendars/recurring",
			$stream->publisherId,
			$stream->name,
			array('skipAccess' => true, 'weight' => $time)
		);

		// if recurring category just created - participate publisher with all recurring days
		// later he can change days from front end
		if (!Q::ifset($recurringInfo, 'skipParticipating', false)) {
			self::setRecurringParticipant($stream, $recurringInfo);
		}

		return $recurringCategory;
	}
	/**
	 * Participate user to recurring stream (if not participated) and set recurring days to participant extra
	 * @method setRecurringParticipant
	 * @static
	 * @param {Streams_Stream} $eventStream Required.
	 * @param {array} [$recurringInfo] Info about recurring (period, days).
	 * @param {String} [$recurringInfo.period]
	 * @param {array} [$recurringInfo.days] array of days ["Mon", "Tue", ...]
	 * @param {array} [$recurringInfo.relatedParticipants] array in format [[publisherId: ..., streamName: ...], ...]
	 * @param {boolean} [$recurringInfo.updateExistingStreams=false] If true find all created events and update participating and related participants
	 * @param {boolean} [$recurringInfo.skipStream=false] If true skip $eventStream from participating and related participants changes. Need for requests from web to avoid changing currently opened event.
	 * @param {boolean} [$update=false] If true, update recurring days instead replace.
	 * @return Streams_Participant Streams_Participant row
	 */
	static function setRecurringParticipant ($eventStream, $recurringInfo = array(), $update=false) {
		$publisherId = Q::ifset($eventStream, "publisherId", null);
		$streamName = Q::ifset($eventStream, "streamName", null);
		$participant = self::getRecurringParticipant($eventStream);
		$currentPeriod = $participant->getExtra("period") ?: array();
		if ($update) {
			$newDays = Q::ifset($recurringInfo, "days", array());
			$currentDays = $participant->getExtra("days") ?: array();
			$recurringInfo["days"] = array_merge($currentDays, $newDays);
		}
		$period = Q::ifset($recurringInfo, "period", null);
		$days = Q::ifset($recurringInfo, "days", null);
		$startDate = Q::ifset($recurringInfo, "startDate", null);
		$endDate = Q::ifset($recurringInfo, "endDate", null);
		$skipStream = Q::ifset($recurringInfo, "skipStream", false);
		$relatedParticipants = Q::ifset($recurringInfo, "relatedParticipants", null);
		$daysUpdated = false;
		$relatedParticipantsUpdated = false;
		if ($period && $period != $currentPeriod) {
			$participant->setExtra(@compact("period"));
		}
		if (is_array($days)) {
			$participant->setExtra(@compact("days"));
			$daysUpdated = true;
		}
		if (is_array($relatedParticipants)) {
			$participant->setExtra(@compact("relatedParticipants"));
			$relatedParticipantsUpdated = true;
		}
		if ($startDate !== null) {
			$participant->setExtra(@compact("startDate"));
		}
		if ($endDate !== null) {
			$participant->setExtra(@compact("endDate"));
		}

		$participant->save();

		if (Q::ifset($recurringInfo, "updateExistingStreams", false) && ($daysUpdated || $relatedParticipantsUpdated)) {
			$recurringCategory = Calendars_Recurring::fromStream($eventStream);
			$recurringDays = $recurringCategory->getAttribute("days");
			$relatedParticipants = $participant->getExtra("relatedParticipants");
			$extra = Q::json_decode($participant->extra);
			$createdEvents = Streams_RelatedTo::select()->where(array(
				"toPublisherId" => $recurringCategory->publisherId,
				"toStreamName" => $recurringCategory->name,
				"type" => "Calendars/recurring",
				"weight > " => time()
			))->fetchDbRows();
			foreach ($createdEvents as $createdEventRelated) {
				// skip currently selected event stream, means user selected "just once"
				if ($skipStream && $publisherId == $createdEventRelated->fromPublisherId && $streamName == $createdEventRelated->fromStreamName) {
					continue;
				}

				$event = Streams_Stream::fetch($createdEventRelated->fromPublisherId, $createdEventRelated->fromPublisherId, $createdEventRelated->fromStreamName);
				$location = json_decode($event->location);

				$timeZone = Q::ifset($location, "timeZone", $event->getAttribute("timezoneName"));
				$startDate = (new DateTime("now", new DateTimeZone($timeZone)))->setTimestamp((int)$event->getAttribute("startTime"));

				// hours:minutes when event start
				$startTime = $startDate->format('H:i');

				// week day when event will start
				$weekDay = $startDate->format('D');

				// week day when event will start
				$monthDay = $startDate->format('j');

				// if user going that day - join him to event
				if (Q::ifset($extra->days, $weekDay, false) !== false || Q::ifset($extra->days, $monthDay, false) !== false) {
					// if time slots not empty check if user subscribed to time slots
					if (is_array($recurringDays[$weekDay]) && sizeof($recurringDays[$weekDay])) {
						$found = false;
						foreach ($extra->days->$weekDay as $timeSlot) {
							if (ltrim($timeSlot[0], '0') == ltrim($startTime, '0')) {
								$found = true;
							}
						}

						$going = $found ? "yes" : "no";
					} else { // if time slots empty, than event happen only once a day
						$going = "yes";
					}
				} else {
					$going = "no";
				}
				Calendars_Event::rsvp($event, $participant->userId, $going, array(
					"forcePayment" => true,
					"relatedParticipants" => $relatedParticipants,
					"skipRecurringParticipant" => true
				));
			}
		}

		return $participant;
	}

	/**
	 * Check if arrays contains same values
	 * @method arraysEqual
	 * @static
	 * @param {array} $arr1
	 * @param {array} $arr2
	 * @return Boolean
	 */
	static function arraysEqual (array $arr1, array $arr2) {
		if (sizeof($arr1) != sizeof($arr2)) {
			return false;
		}

		if (self::isAssoc($arr1) !== self::isAssoc($arr2)) {
			return false;
		}

		// for associative array
		if (self::isAssoc($arr1)) {
			foreach ($arr1 as $key => $value) {
				if (is_array($value)) {
					if (is_array($arr2[$key] && !self::arraysEqual($value, $arr2[$key]))) {
						return false;
					}
				} else if ($value !== $arr2[$key]) {
					return false;
				}
			}
		} else {
			foreach ($arr1 as $value) {
				if (is_array($value)) {
					if (!is_array($arr2) || !self::arraysEqual($value, $arr2)) {
						return false;
					}

				} else if (!in_array($value, $arr2)) {
					return false;
				}
			}
		}

		return  true;
	}

	static function isAssoc (array $arr) {
		if (array() === $arr) return false;
		return array_keys($arr) !== range(0, count($arr) - 1);
	}
}