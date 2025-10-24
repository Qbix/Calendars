<?php
/**
 * @module Calendars
 */
/**
 * Class for dealing with calendar events
 * 
 * @class Calendars_Event
 */
class Calendars_Event extends Base_Calendars_Event
{
	static function defaultDuration()
	{
		return Q_Config::expect('Calendars', 'events', 'defaults', 'duration');
	}
	
	static function defaultListingDuration()
	{
		return Q_Config::expect('Calendars', 'events', 'listing', 'duration');
	}
	
	/**
	 * Gets the eventId from the request
	 * @method requestedId
	 * @static
	 * @return {string}
	 */
	static function requestedId()
	{
		$uri = Q_Dispatcher::uri();
		return Q::ifset($_REQUEST, 'eventId', Q::ifset($uri, 'eventId', null));
	}
	
	/**
	 * Gets event info to send to clients in iCal and other formats.
	 * The events are in the UTC time zone, unless a time zone is specified
	 * @method info
	 * @static
	 * @param {Streams_Stream} $stream - Calendars/event stream
	 * @param {string} [$timezoneName] - name of time zone to use, instead of location time zone
	 * @return {array} An array of possible keys:
	 * 	'publisherId', 'streamName',
	 * 	'startTime', 'endTime', 'start', 'end', 'timezone', 'timezoneName'
	 * 	'title', 'content', 'url', 'address'
	 */
	static function info($stream, $timezoneName=null)
	{
		$url = $stream->url();
		$duration = Calendars_Event::defaultDuration();
		$title = $stream->title;
		$location = Places_Location::fromStream($stream);
		$address = Q::ifset($location, "address", null);
		$startTime = (int)$stream->getAttribute('startTime', 0);
		$endTime = $stream->getAttribute('endTime', $startTime + $duration);
		$timezoneName = $timezoneName ? $timezoneName : $stream->getAttribute('timezoneName', 'UTC');

		$dt = new DateTime("now", new DateTimeZone($timezoneName));

		$start = $startTime ? $dt->setTimestamp($startTime)->format('Ymd\THis') : '';
		$end = $endTime ? $dt->setTimestamp($endTime)->format('Ymd\THis') : '';
		$createdTime = $dt->setTimestamp(time())->format('Ymd\THis');
		$publisherId = $stream->publisherId;
		$streamName = $stream->name;
		$content = $stream->content;
		return @compact(
			'publisherId', 'streamName',
			'startTime', 'endTime', 'start', 'end', 'timezone', 'timezoneName',
			'title', 'content', 'url', 'address', 'createdTime'
		);
	}
	
	/**
	 * Check if user have permissions to edit events in some community
	 * @method isAdmin
	 * @param {string} $userId if null - logged user id
	 * @param {string} $communityId if null - current community
	 * @return bool
	 */
	static function isAdmin ($userId = null, $communityId = null) {
		if (empty($userId)) {
			$user = Users::loggedInUser(false, false);
			if ($user) {
				$userId = $user->id;
			} else {
				return false;
			}
		}

		if (empty($communityId)) {
			$communityId = Users::currentCommunityId(true);
		}

		// labels allowed to edit recurring category
		$labels = array_map(function($value){
			return Q::interpolate($value, array('app' => Q::app()));
		}, (array)Q_Config::expect("Calendars", "events", "admins"));

		// check if user have permissions to edit recurring category
		return (bool)Users::roles($communityId, $labels, array(), $userId);
	}
	/**
	 * Get all the Calendars/event streams the user is participating in,
	 * as related to their "Calendars/participating/events" category stream.
	 * @method participating
	 * @param {string} $userId
	 * @param {integer} $fromTime The earliest endTime of the stream
	 * @param {integer} $untilTime The earliest startTime of the stream
	 * @param {string|array} [$going] Filter by either "yes" or "no" or "maybe"
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
		$options = array_merge($options, array(
			'filter' => function ($relations) use ($going, $fromTime, $untilTime) {
				$result = array();
				foreach ($relations as $r) {
					$startTime = $r->getExtra('startTime');
					$duration = Calendars_Event::defaultDuration();
					$endTime = $r->getExtra('endTime', $startTime + $duration);
					if (($fromTime and $endTime < $fromTime)
					or ($untilTime and $startTime > $untilTime)
					or ($going !== null and !in_array($r->getExtra('going', 'no'), $going))) {
						continue;
					}
					$result[] = $r;
				}
				return $result;
			}
		));
		return Streams::participating("Calendars/event", $options);
	}

	/**
	 * Join random users to events with participants less than $lessThan
	 * @method joinRandomUsers
	 * @param {integer} [$lessThan=5] Events with more than this amount of participants will ignored.
	 * @param {string} [$publisherId]
	 * @param {array} [$streamName]
	 *
	 * @return {array} with keys "event" and "participant"
	 */
	static function joinRandomUsers($lessThan = 5, $publisherId=null, $streamName=array()) {
		$currentCommunityId = Users::currentCommunityId();
		Q_Config::set('Streams', 'db', 'limits', 'stream', 1000);
		if (!empty($publisherId) && !empty($streamName)) {
			$events = Streams::fetch($publisherId, $publisherId, $streamName);
		} else {
			$events = Streams::related($currentCommunityId, $currentCommunityId, "Calendars/calendar/main", true, array(
				'type' => 'Calendars/events',
				'weight' => new Db_Range(time(), false, false, null),
				'limit' => 1000
			))[1];
		}

		$users = Users_User::select()->where(array('username' => '', 'sessionCount > ' => 1))->fetchDbRows();

		if(empty($events) || !is_array($events)) {
			return;
		}

		// pause offline notifications
		Streams_Notification::pause();

		foreach ($events as $event) {
			if (!empty($event->closedTime)) {
				continue;
			}

			// check whether events have max participated users
			$participated = Streams_Participant::select("count(*) as res")
				->where(array(
					"streamName" => $event->name,
					"extra like " => '%"going":"yes"%'
				))
				->execute()
				->fetchAll(PDO::FETCH_ASSOC)[0]["res"];

			if ($participated >= $lessThan) {
				continue;
			}

			$randomAmount = rand(5, 10);

			shuffle($users);

			foreach ($users as $user) {
				if ($randomAmount <= 0) {
					break;
				}
				$participated = Streams_Participant::select("count(*) as res")
					->where(array(
						"streamName" => $event->name,
						"extra like " => '%"going":"yes"%',
						"userId" => $user->id
					))
					->execute()
					->fetchAll(PDO::FETCH_ASSOC)[0]["res"];
				if ($participated >= 1) {
					continue;
				}

				try {
					Calendars_Event::rsvp($event, $user->id);
				} catch (Exception $e) {}

				$randomAmount--;
			}
		}

		Streams_Notification::resume();
	}
	/**
	 * Used to start a new group
	 * @method create
	 * @param {array} $options
	 * @param {string} $options.interestTitle Required. Title of an interest that exists in the system.
	 * @param {string} $options.placeId Required. Pass the id of a location where people will gather.
	 * @param {string} $options.localStartDateTime Local datetime when the people should gather at the location.
	 * @param {string} [$options.localEndDateTime]  Optional. Local datetime when people should start to disperse
	 * @param {string} [$options.startTime] If set, uses this time directly instead of localStartDateTime
	 * @param {string} [$options.endTime] If set, uses this time directly instead of localEndDateTime
	 * @param {string} [$options.icon] Event illustration image. Can be image URL or path or image contents data.
	 * @param {string} [$options.timezone=null] Optional. The timezone offset on the browser of the user who created the event.
	 * @param {string} [$options.timezoneName=null] Optional. The name of the timezone, out of the common ones e.g. "America/New_York".
	 * @param {string} [$options.labels=''] Optional. You can specify a tab-delimited string of labels to which access is granted. Otherwise access is public.
	 * @param {string} [$options.asUserId=Users::loggedInUser()] The user who is taking the action
	 * @param {string} [$options.publisherId=Users::loggedInUser()->id] Optional. The user who would publish the event. Defaults to the logged-in user.
	 * @param {string} [$options.communityId=Users::communityId()] Optional. The user id of the community, which will publish the streams to which this event would be related. Defaults to the main community's id.
	 * @param {string|array} [$options.experienceId="main"] Can set one or more ids of community experiences the event will be related to.
	 * @param {array} [$options.recurring] Info about recurring
	 * @param {bool} [$skipAccess=false] skipp access during stream create
	 * @throws Q_Exception
	 * @throws Q_Exception_MissingRow
	 *
	 * @return {array} with keys "event" and "participant"
	 */
	static function create($options, $skipAccess = false)
	{
		$user = Users::loggedInUser(true);
		$r = Q::take($options, array(
			'interestTitle' => null,
			'eventTitle' => null,
			'eventType' => null,
			'placeId' => null,
			'venueName' => null,
			'areaSelected' => null,
			'livestream' => null,
			'startTime' => null,
			'localStartDateTime' => null,
			'endTime' => null,
			'localEndDateTime' => null,
			'duration' => null,
			'eventUrl' => null,
			'ticketsUrl' => null,
			'timezone' => null,
			'timezoneName' => null,
			'labels' => null,
			'asUserId' => null,
			'communityId' => null,
			'publisherId' => null,
			'peopleMin' => null,
			'peopleMax' => null,
			'experienceId' => null,
			'recurring' => null,
			'payment' => null,
			'icon' => null,
			'contact' => null,
			'description' => ""
		));

		if (!$r['placeId'] && !$r['livestream']) {
			throw new Q_Exception_RequiredField(array('field' => 'location or live stream URL'));
		}

		if (empty($r['localStartDateTime']) && empty($r['startTime'])) {
			throw new Q_Exception_RequiredField(array('field' => 'startTime or localStartDateTime'));
		}

		$rpid = Streams::requestedPublisherId();
		$publisherId = Q::ifset($r, 'publisherId', $rpid ? $rpid : $user->id);

		$defaults = Q_Config::expect('Calendars', 'events', 'defaults');
		$peopleMin = Q::ifset($r, 'peopleMin', $defaults['peopleMin']);
		$peopleMax = Q::ifset($r, 'peopleMax', $defaults['peopleMax']);
		if (!is_numeric($peopleMin) or floor($peopleMin) != $peopleMin) {
			throw new Q_Exception("Min event size must be a number");
		}
		if (!is_numeric($peopleMax) or floor($peopleMax) != $peopleMax) {
			throw new Q_Exception("Max event size must be a number");
		}
		$peopleMin = (integer)$peopleMin;
		$peopleMax = (integer)$peopleMax;
		if ($peopleMin >= $peopleMax) {
			throw new Q_Exception("Max event size can't be less than $peopleMin");
		}

		$communityId = Q::ifset($r, 'communityId', Users::currentCommunityId(true));
		$mainCommunityId = Users::communityId();
		$asUserId = Q::ifset($r, 'asUserId', $user->id);

		// validate labels
		$labelTitles = array('People');
		$labels = null;
		$r['labels'] = $r['labels'] == 'Calendars/*' ? '' : $r['labels'];
		if (!empty($r['labels'])) {
			$labelTitles = array();
			$labels = explode("\t", $r['labels']);
			$rows = Users_Label::fetch($publisherId, $labels, array(
				'checkContacts' => true
			));
			foreach ($labels as $label) {
				if ($label == 'Calendars/*') {
					continue;
				}

				if (!isset($rows[$label])) {
					throw new Q_Exception("No contacts found with label $label");
				}
				$labelTitles[] = $rows[$label]->title;
			}
		}
	
		// interest
		$interestIcon = null;
		$interests = $interestStreams = array();
		if (!empty($r['interestTitle'])) {
			if (!is_array($r['interestTitle'])) {
				$r['interestTitle'] = array($r['interestTitle']);
			}
			foreach ($r['interestTitle'] as $interestTitle) {
				if (empty($interestTitle)) {
					continue;
				}

				$interest = Streams::getInterest($interestTitle);

				$interests[] = array(
					'publisherId' => $interest->publisherId,
					'name' => $interest->name,
					'title' => $interest->title
				);

				$interestIcon = $interest->icon;
				$interestStreams[] = $interest;
			}
		}

		// event title custom or title of first interest
		$eventTitle = Q::ifset($r, 'eventTitle', Q::ifset($interests, 0, 'title', null));
		if (empty($eventTitle)) {
			throw new Exception("title required");
		}

		// search icon if not defined
		$searchFrom = Q_Config::get('Calendars', 'event', 'icon', 'search', array());
		if (empty($r['icon'] && !empty($searchFrom))) {
			foreach ($searchFrom as $service) {
				try {
					$results = call_user_func(array('Q_Image', $service), $eventTitle, array(
						"imgType" => "photo",
						"imgSize" => "large"
					), false);

					foreach ($results as $result) {
						// get just header
						$ch = curl_init($result);
						curl_setopt($ch, CURLOPT_HEADER, true);    // we want headers
						curl_setopt($ch, CURLOPT_NOBODY, true);    // we don't need body
						curl_setopt($ch, CURLOPT_RETURNTRANSFER,1);
						curl_setopt($ch, CURLOPT_TIMEOUT,10);
						curl_exec($ch);
						$HTTPcode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
						curl_close($ch);

						if ($HTTPcode == 200) {
							$r['icon'] = $result;
							break;
						}
					}

				} catch (Exception $e) {}
			}
		}

		// start time calculation
		$startTime = (int)Q::ifset($r, 'startTime', null);
		$endTime = (int)Q::ifset($r, 'endTime', null);
		$localStartDateTime = Q::ifset($r, 'localStartDateTime', null);
		$localEndDateTime = Q::ifset($r, 'localEndDateTime', null);
		$duration = Q::ifset($r, 'duration', null);
		$timezone = Q::ifset($r, 'timezoneName', null);

		// location
		$venue = null;
		$locationStream = null;
		if ($r['placeId']) {
			$locationStream = Places_Location::stream($asUserId, $mainCommunityId, $r['placeId'], array(
				'throwIfBadValue' => true,
				'withTimeZone' => true
			));
			if ($r['areaSelected']) {
				if (gettype($r['areaSelected']) == 'string') {
					$areaSelected = json_decode($r['areaSelected']);
				} else {
					$areaSelected = $r['areaSelected'];
				}
			}
			$venue = Q::ifset($r, 'venueName', $locationStream->title);
			$lat = $locationStream->getAttribute('latitude');
			$lng = $locationStream->getAttribute('longitude');
			$timezone = $locationStream->getAttribute('timeZone');
		}

		if (!$startTime) {
			if ($locationStream) {
				$startTime = (int)self::calculateStartTime($localStartDateTime, $locationStream);
			} else {
				$startTime = new DateTime($localStartDateTime, new DateTimeZone($timezone));
				$startTime = (int)$startTime->format('U');
			}
		}

		// end time calculation
		if (!$endTime) {
			if ($localEndDateTime) {
				if ($locationStream) {
					$endTime = self::calculateStartTime($localEndDateTime, $locationStream);
				} else {
					$endTime = new DateTime($localEndDateTime, new DateTimeZone($timezone));
					$endTime = $endTime->format('U');
				}
			} elseif ($duration) {
				$duration = explode(':', $duration);
				$durationHours = (int)$duration[0];
				$durationMinutes = (int)$duration[1];

				$endTime = $startTime + $durationHours*3600 + $durationMinutes*60;
			} else {
				$endTime = $startTime + self::defaultDuration();
			}
		}

		$defaultAccess = array(
			'readLevel' => Q_Config::expect('Streams', 'types', 'Calendars/event', 'defaults', 'readLevel'),
			'writeLevel' => Q_Config::expect('Streams', 'types', 'Calendars/event', 'defaults', 'writeLevel'),
			'adminLevel' => Q_Config::expect('Streams', 'types', 'Calendars/event', 'defaults', 'adminLevel')
		);
		$fields = array_merge(array(
			// be default icon always from interest,
			// after event created, if icon defined in request, it will downloaded and
			// implemented with Q/image/post
			'icon' => $interestIcon,
			'title' => $eventTitle,
			'content' => $r['description'],
			'attributes' => array(
				'communityId' => $communityId,
				'eventType' => $r['eventType'],
				'venue' => $venue,
				'eventUrl' => $r['eventUrl'],
				'ticketsUrl' => $r['ticketsUrl'],
				'livestream' => $r['livestream'],
				'startTime' => $startTime,
				'localStartDateTime' => $localStartDateTime,
				'endTime' => $endTime,
				'timezoneName' => $timezone,
				'peopleMin' => $peopleMin,
				'peopleMax' => $peopleMax,
				'labels' => $labels,
				'labelTitles' => $labelTitles,
				'contact' => $r['contact'],
				'userId' => $user->id
			),
			'skipAccess' => $skipAccess
		), $defaultAccess);
		if ($r['labels']) {
			$fields['readLevel'] = 0;
			$fields['writeLevel'] = 0;
			$fields['adminLevel'] = 0;
		} elseif ($r['payment']) {
			$fields['readLevel'] = 20;
		}

		// save the event in the database
		$event = Streams::create(null, $publisherId, 'Calendars/event', $fields);

		// relate event to Calendars/calendar/main of community category
		self::relateToCommunity($event, $communityId);

		// import icon to event stream
		self::importIcon($r['icon'], $event);

		// make event recurring
		Calendars_Recurring::makeRecurring($event, $r['recurring']);

		// validate payment info before save
		Calendars_Payment::setInfo($event, $r['payment']);

		// if request is POST means user just created event from web
		// so need join him to event, because publisher sure going
		if(Q_Request::method() === 'POST' && !Users::isCommunityId($publisherId)) {
			// join publisher to event
			$participant = self::rsvp($event, $publisherId);
		}

		// save any access labels
		if (!empty($labels)) {
			foreach ($labels as $label) {
				$access = new Streams_Access();
				$access->publisherId = $event->publisherId;
				$access->streamName = $event->name;
				$access->ofContactLabel = $label;
				if ($access->retrieve()) {
					continue;
				}
				$access->readLevel = $defaultAccess['readLevel'];
				$access->writeLevel = $defaultAccess['writeLevel'];
				$access->adminLevel = $defaultAccess['adminLevel'];
				$access->save();
			}
		}

		// now, relate it to a few streams, so it can be found
		$o = array('skipAccess' => true, 'weight' => $startTime);
		$relationType = "Calendars/event";

		if ($locationStream) {
			$event->relateTo($locationStream, $relationType, null, $o);
		}

		foreach ($interestStreams as $interest) {
			$event->relateTo($interest, $relationType, null, $o);
		}

		// relate to Places/area stream
		$areaPublisherId = Q::ifset($areaSelected, 'publisherId', null);
		$areaStreamName = Q::ifset($areaSelected, 'streamName', null);
		if ($areaPublisherId && $areaStreamName) {
			Streams::relate(
				null,
				$areaPublisherId,
				$areaStreamName,
				$relationType,
				$event->publisherId,
				$event->name,
				$o
			);
		}

		$firstInterestTitle = Q::ifset($interests, 0, 'title', null);
		if ($firstInterestTitle && $locationStream) {
			$experienceId = Q::ifset($r, 'experienceId', 'main');
			$experienceIds = is_array($experienceId) ? $experienceId : array($experienceId);
			$streamNames = array();
			foreach ($experienceIds as $experienceId) {
				$co = array('skipAccess' => true, 'experienceId' => $experienceId);
				$latitude = $lat;
				$longitude = $lng;
				Places_Interest::streams(
					$mainCommunityId,
					$latitude,
					$longitude,
					$firstInterestTitle,
					$co,
					$streamNames
				);
				Places_Nearby::streams(
					$mainCommunityId,
					$latitude,
					$longitude,
					$co,
					$streamNames
				);
			}
			Streams::relate(
				null,
				$mainCommunityId,
				$streamNames,
				$relationType,
				$event->publisherId,
				$event->name,
				$o
			);
		}

		// save interests info to extended table
		$event->interests = Q::json_encode(self::getInterests($event));

		// save location info to extended table
		$location = self::getLocation($event);
		$event->location = $location ? Q::json_encode($location) : null;

		$event->changed();

		return $event;
	}
	/**
	 * Relate event to community Calendars/calendar/main category
	 * @method relateToCommunity
	 * @static
	 * @param {String} $communityId
	 * @param Streams_Stream $eventStream Event stream
	 * @return array
	 */
	static function relateToCommunity($event, $communityId) {
		$communityEventsCategory = Calendars::stream($communityId);
		$startTime = $event->getAttribute('startTime');
		$event->relateTo($communityEventsCategory, 'Calendars/events', null, array(
			'skipAccess' => true,
			'weight' => $startTime
		));
	}
	/**
	 * Calculate event duration time
	 * @method calculateDuration
	 * @static
	 * @param {String} $startTime String in format 'yyyy-mm-dd hh:mm:ss'
	 * @param {String} [$endTime=null] String in format 'yyyy-mm-dd hh:mm:ss'. If null, default event duration will be used.
	 * @return integer
	 */
	static function calculateDuration ($startTime, $endTime=null) {
		$eventDuration = self::defaultDuration();
		if ($endTime) {
			$eventDuration = strtotime($endTime) - strtotime($startTime);

			if ($eventDuration <= 0) {
				throw new Q_Exception("Event duration can't be zero or negative");
			}
		}

		return $eventDuration;
	}
	/**
	 * Calculate start time for event
	 * @method calculateStartTime
	 * @static
	 * @param {String} $dateString String in format 'yyyy-mm-dd hh:mm:ss'
	 * @param Streams_Stream $locationStream Location stream
	 * @return integer
	 */
	static function calculateStartTime ($dateString, $locationStream) {
		$lat = $locationStream->getAttribute('latitude');
		$lng = $locationStream->getAttribute('longitude');
		$timezone = $locationStream->getAttribute('timeZone');

		// shift times from timestamp formed by local time
		if (!$timezone) {
			$timezone = Places::timezone($lat, $lng);
			$timezone = $timezone['timeZoneId'];
			$locationStream->setAttribute('timeZone', $timezone);
			$locationStream->save();
		}

		$startTime = new DateTime($dateString, new DateTimeZone($timezone));
		return $startTime->format('U');
	}
	/**
	 * Import icon to event stream
	 * @method importIcon
	 * @static
	 * @param {String|image source} $icon URL or local path to image or image source.
	 * @param Streams_Stream $eventStream Event stream
	 * @return array
	 */
	static function importIcon ($icon, $eventStream) {
		// if icon is URL, get image data
		if (Q_Valid::url($icon) || @file_exists($icon)) {
			if ($imageData = file_get_contents($icon)) {
				$icon = $imageData;
			}
		}

		// if icon is valid image
		if ($icon) {
			if (imagecreatefromstring($icon)) {
				// upload image to stream
				Q_Image::save(array(
					'data' => $icon, // these frills, with base64 and comma, to format image data for Q/image/post handler.
					'path' => "Q/uploads/Streams",
					'subpath' => Q_Utils::splitId($eventStream->publisherId, 3, '/')."/".$eventStream->name."/icon/".time(),
					'save' => "Calendars/event"
				));
			} else {
				$eventStream->icon = $icon;
			}
		}
	}
	/**
	 * Get event interests in one array
	 * return should be
		[
			{publisherId: "...", name: "...", title: "..."},
			{publisherId: "...", name: "...", title: "..."},
			...
		]
	 * @method getInterests
	 * @static
	 * @param Streams_Stream $event Event stream
	 * @return array
	 */
	static function getInterests($event)
	{
		$rows = Streams_Stream::select('ss.publisherId, ss.name, ss.title', 'ss')
			->join(Streams_relatedTo::table(true, 'srt'), array(
				'srt.toStreamName' => 'ss.name',
				'srt.toPublisherId' => 'ss.publisherId'
			))->where(array(
				'srt.fromPublisherId' => $event->publisherId,
				'srt.fromStreamName' => $event->name,
				'ss.type' => 'Streams/interest'
			))
			->orderBy('srt.weight', false)
			->fetchDbRows();

		return $rows;
	}
	/**
	 * Get event location with area in one array.
	 * return should be
	 * {
			publisherId: "...",
			name: "...",
			venue: "...",
			address: "...",
			latitude: ...,
			longitude: ...,
			area: {
				publisherId: "...",
				name: "...",
				title: "..."
			}
		}
	 * @method getLocation
	 * @static
	 * @param Streams_Stream $event Event stream
	 * @return array
	 */
	static function getLocation($event)
	{
		$rows = Streams_Stream::select('ss.publisherId, ss.name, ss.title, ss.type, ss.attributes', 'ss')
			->join(Streams_relatedTo::table(true, 'srt'), array(
				'srt.toStreamName' => 'ss.name',
				'srt.toPublisherId' => 'ss.publisherId'
			))->where(array(
				'srt.fromPublisherId' => $event->publisherId,
				'srt.fromStreamName' => $event->name,
				'ss.type' => array('Places/location', 'Places/area')
			))->fetchDbRows();

		$result = array();
		foreach ($rows as $row) {
			if ($row->type == 'Places/location') {
				$result['publisherId'] = $row->publisherId;
				$result['name'] = $row->name;

				$attributes = empty($row->attributes) ? array() : Q::json_decode($row->attributes);
				$result['address'] = $attributes->address;
				$result['latitude'] = $attributes->latitude;
				$result['longitude'] = $attributes->longitude;
				$result['timeZone'] = $attributes->timeZone;
			} elseif ($row->type == 'Places/area') {
				$result['area'] = array(
					'publisherId' => $row->publisherId,
					'name' => $row->name,
					'title' => $row->title
				);
			}
		}

		if (empty($result)) {
			return null;
		}

		$result['venue'] = $event->getAttribute('venue');
		return $result;
	}
	/**
	 * Make user participated to event
	 * @method join
	 * @static
	 * @param {Streams_Stream} $stream Event stream
	 * @param {string} $userId Id of user need to participate
	 * @param {string} $going Whether user going. Can ge one of "yes", "no", "maybe"
	 * @param {array} [$options]
	 * @param {bool} [$options.skipPayment=false] Sometime need to skip payment, for instance when participate staffer.
	 * @param {Boolean} [$options.skipRecurringParticipant=false] If true don't manage recurring participant
	 * @param {Boolean} [$options.skipSubscription=false] If true skip subscription to stream
	 * @param {bool} [$options.forcePayment=false] If true, do payment if required. If false, throw exception.
	 * @param {array} [$options.relatedParticipants] If defined array of related participants, relate all of them to event.
	 * Array format: array(array("publisherId" => ..., "streamName" => ...), ...)
	 * @throws Streams_Exception_Full
	 * @throws Q_Exception_MissingRow
	 * @return {Streams_Participating} The row representing the participant
	 */
	static function rsvp ($stream, $userId, $going = 'yes', $options = array()) {
		// check if event already started
		if ((int)$stream->getAttribute("startTime") < time()) {
			return;
		}

		$user = Users_User::fetch($userId, true);
		$isPublisher = $userId == $stream->publisherId;
		$isAdmin = (bool)Users::roles(Users::currentCommunityId(true), Q_Config::expect('Calendars', 'events', 'admins'));
		$skipPayment = Q::ifset($options, 'skipPayment', false);
		$relatedParticipants = Q::ifset($options, "relatedParticipants", null);

		$recurringCategory = Calendars_Recurring::fromStream($stream);

		$options['userId'] = $userId;

		if ($going == 'no') {
			$stream->leave($options);

			$stream->unsubscribe($options);

			// unrelate all relatedParticipants streams related by this user
			$relations = Streams_RelatedTo::select()->where(array(
				'toPublisherId' => $stream->publisherId,
				'toStreamName' => $stream->name,
				'fromPublisherId' => $userId
			))->orderBy('weight', false)->fetchDbRows();
			foreach ($relations as $relation) {
				Streams::unrelate(
					$userId,
					$relation->toPublisherId,
					$relation->toStreamName,
					$relation->type,
					$relation->fromPublisherId,
					$relation->fromStreamName,
					array("skipAccess" => true)
				);
			}

			// unsubscribe from recurring category
			if ($recurringCategory instanceof Streams_Stream) {
				$recurringCategory->unsubscribe();
			}

			Q::event('Calendars/event/leave', array(
				'stream' => $stream,
				'user' => $user
			), 'after');
		} else { // yes or maybe
			if ($going == 'yes') {
				// check people max
				$peopleMax = $stream->getAttribute('peopleMax', 0);
				$participants = Streams_Participant::select()
					->where(array(
						'publisherId' => $stream->publisherId,
						'streamName' => $stream->name,
						'state' => 'participating'
					))->fetchDbRows();
				$yesCount = 0;
				foreach ($participants as $p) {
					if ($p->getExtra('going') === 'yes') {
						if ($p->userId == $userId) {
							// this user already participated
							// relate participants
							self::relateParticipants($userId, $stream, $relatedParticipants);

							// and do nothing...
							return $p;
						}

						++$yesCount;
					}
				}
				if ($yesCount >= $peopleMax) {
					throw new Streams_Exception_Full(array('type' => 'event'));
				}

				// check payment
				$paymentRequired = false;
				$payment = $stream->getAttribute("payment");
				$amount = Q::ifset($payment, "amount", 0);
				$resAmount = 0;
				$paymentType = Q::ifset($payment, "type", null);
				if ($paymentType == "required" && ($isPublisher || $isAdmin)) {
					Streams_Message::post($userId, $userId, "Calendars/user/reminders", array(
						"type" => "Calendars/payment/skip",
						"instructions" => array(
							"publisherId" => $stream->publisherId,
							"streamName" => $stream->name,
							"reason" => $isPublisher ? "publisher" : "admin"
						)
					), true);
				} elseif (!$skipPayment && $paymentType == 'required') {
					if (!Assets_Credits::checkJoinPaid($userId, $stream)) {
						$resAmount += $amount;
						$paymentRequired = true;
					}

					// also check payment for all related streams
					$possibleRelatedParticipants = Q_Config::get('Assets', 'service', 'relatedParticipants', array());
					foreach ($possibleRelatedParticipants as $streamType => $relatedParticipant) {
						$relatedRows = Streams_RelatedTo::select()->where(array(
							'toPublisherId' => $stream->publisherId,
							'toStreamName' => $stream->name,
							'fromPublisherId' => $userId,
							'type' => $relatedParticipant["relationType"]
						))->fetchDbRows();
						foreach ($relatedRows as $relatedRow) {
							if (!Assets_Credits::checkJoinPaid($userId, $stream, array(
									'publisherId' => $relatedRow->fromPublisherId,
									'streamName' => $relatedRow->fromStreamName)
							)) {
								$resAmount += $amount;
								$paymentRequired = true;
							}
						}
					}

					if ($paymentRequired) {
						if (!Q::ifset($options, "forcePayment", false)) {
							throw new Streams_Exception_Payment();
						}
						Q::event("Assets/credits/post", array(
							"amount" => $resAmount,
							"currency" => $payment["currency"],
							"toStream" => $stream,
							"forcePayment" => true
						));

						// after payment try again to unsure that payments success
						$options["forcePayment"] = false;
						return self::rsvp($stream, $userId, $going, $options);
					}
				}
			}

			// join user to event
			$stream->join($options);

			if (!Q::ifset($options, 'skipSubscription', false)) {
				$stream->subscribe($options);
			}

			// collect stats by event
			Users_Vote::saveActivity("Calendars/event", $stream->title);

			// collect stats by availability
			$availability = self::getAvailability($stream);
			if ($availability) {
				Users_Vote::saveActivity("Calendars/availability", $availability->title);

				// collect stats by service
				$service = self::getService($stream);
				if ($service) {
					Users_Vote::saveActivity("Assets/service", $service->title);
				}
			}

			// if defined related participants, relate them to event
			if ($recurringCategory && !Q::ifset($options, "skipRecurringParticipant", false)) {
				Calendars_Recurring::setRecurringParticipant($stream);
			}

			self::relateParticipants($userId, $stream, $relatedParticipants);

			// add user to community as a Users/guests
			if (Users::isCommunityId($stream->publisherId)) {
				// join to Streams/experience/main of community
				$experienceStream = Streams_Stream::fetch($stream->publisherId, $stream->publisherId, "Streams/experience/main");
				if ($experienceStream instanceof Streams_Stream) {
					$participant = $experienceStream->participant($userId);
					if (!($participant instanceof Streams_Participant)
					|| $participant->state != 'participating') {
						$experienceStream->join($userId);
					}
				}

				// add contact
				if (!Users_Contact::fetchOne($stream->publisherId, "Users/guests", $userId)) {
					Users_Contact::addContact($stream->publisherId, "Users/guests", $userId, null, false, true);
				}
			}

			// subscribe to recurring category to get notifications about changes
			if ($recurringCategory instanceof Streams_Stream && !$recurringCategory->subscription($userId)) {
				$recurringCategory->subscribe(array('userId' => $userId));
			}
		}

		$participant = new Streams_Participant();
		$participant->publisherId = $stream->publisherId;
		$participant->streamName = $stream->name;
		$participant->userId = $user->id;
		if (!$participant->retrieve()) {
			// this shouldn't happen, but just in case
			throw new Q_Exception_MissingRow(array(
				'table' => 'participant',
				'criteria' => http_build_query($participant->toArray(), '', ' & ')
			));
		}
		$startTime = $stream->getAttribute('startTime');
		$participant->setExtra(@compact('going', 'startTime'));
		if ($going === 'no') {
			$participant->revokeRoles("attendee");
		} else {
			$participant->grantRoles("attendee");
		}
		$participant->save();

		// Let everyone in the stream know of a change in RSVP
		$stream->post($user->id, array(
			'type' => 'Calendars/going',
			'instructions' => array('going' => $going)
		), true);

		Q::event('Calendars/event/going', compact(
			'stream', 'user', 'participant', 'going', 'recurringCategory',
			'isAdmin', 'skipPayment', 'relatedParticipants'
		), 'after');

		return $participant;
	}

	/**
	 * Relate additional streams (pets, ...) to event
	 * @method relateParticipants
	 * @static
	 * @param {String} $userId
	 * @param {Streams_Stream} $event
	 * @param {Array} $relatedParticipants array in format [["publisherId" => ..., "streamName" => ...], ...]
	 * @throws
	 * @return String Yes, No, Maybe
	 */
	static function relateParticipants ($userId, $event, $relatedParticipants) {
		if (!is_array($relatedParticipants)) {
			return;
		}

		$possibleRelatedParticipants = Q_Config::get('Assets', 'service', 'relatedParticipants', array());
		$possibleRelations = array();
		foreach ($possibleRelatedParticipants as $possibleRelatedParticipant) {
			$possibleRelations[] = $possibleRelatedParticipant["relationType"];
		}
		$alreadyRelatedParticipants = Streams_RelatedTo::select()->where(array(
			"toPublisherId" => $event->publisherId,
			"toStreamName" => $event->name,
			"fromPublisherId" => $userId,
			'type' => $possibleRelations
		))->fetchDbRows();

		// relate participants
		foreach ($relatedParticipants as $relatedParticipant) {
			$publisherId = Q::ifset($relatedParticipant, "publisherId", null);
			$streamName = Q::ifset($relatedParticipant, "streamName", null);

			if (!$publisherId || !$streamName) {
				continue;
			}

			$streamToRelate = Streams_Stream::fetch($publisherId, $publisherId, $streamName);
			if (!$streamToRelate || !is_null($streamToRelate->closedTime)) {
				continue;
			}

			// remove participants
			foreach ($alreadyRelatedParticipants as $index => $alreadyRelatedParticipant) {
				if ($alreadyRelatedParticipant->fromStreamName == $streamName) {
					unset($alreadyRelatedParticipants[$index]);
				}
			}

			$streamToRelate->relateTo($event, $streamToRelate->type, null, array(
				"skipAccess" => true,
				"ignoreCache" => true,
				"weight" => time()
			));
		}

		// remove participants
		foreach ($alreadyRelatedParticipants as $alreadyRelatedParticipant) {
			Streams::unrelate(
				$userId,
				$alreadyRelatedParticipant->toPublisherId,
				$alreadyRelatedParticipant->toStreamName,
				$alreadyRelatedParticipant->type,
				$alreadyRelatedParticipant->fromPublisherId,
				$alreadyRelatedParticipant->fromStreamName,
				array("skipAccess" => true)
			);
		}
	}
	/**
	 * Get RSVP for userId in event
	 * @method getRsvp
	 * @static
	 * @param {Streams_Stream} $event Required.
	 * @param {String} $userId If null loggedin user used.
	 * @throws
	 * @return String Yes, No, Maybe
	 */
	static function getRsvp($event, $userId = null) {
		if (!$userId) {
			$loggedInUser = Users::loggedInUser();
			$userId = Q::ifset($loggedInUser, "id", null);
		}

		$participant = new Streams_Participant();
		$participant->publisherId = $event->publisherId;
		$participant->streamName = $event->name;
		$participant->userId = $userId;
		if (!$participant->retrieve(null, false, array("ignoreCache" => true))) {
			return 'no';
		}
		return $participant->getExtra('going');
	}
	/**
	 * Make events import from CSV file.
	 * @method import
	 * @static
	 * @param {Streams_Stream} $taskStream Required. Stream with filled instruction field.
	 * @throws
	 * @return void
	 */
	static function import($taskStream)
	{
		// increase memory limit
		ini_set('memory_limit', '500M');
		
		$texts = Q_Text::get('Calendars/content')['import'];

		if (!($taskStream instanceof Streams_Stream)) {
			throw new Exception($texts['taskStreamInvalid']);
		}

		$instructions = $taskStream->instructions;
		if (empty($instructions)) {
			throw new Exception($texts['instructionsEmpty']);
		}
		$instructions = json_decode($instructions);

		$luid = Users::loggedInUser(true)->id;

		// Send the response and keep going.
		// WARN: this potentially ties up the PHP thread for a long time
		$timeLimit = Q_Config::get('Streams', 'import', 'timeLimit', 100000);
		ignore_user_abort(true);
		set_time_limit($timeLimit);
		session_write_close();

		// count the number of rows
		$lineCount = count($instructions);
		$taskStream->setAttribute('items', $lineCount);

		$requiredFields = array(
			'event_title',
			'interest',
			'venue_address',
			'start_time'
		);

		$mappedTitle = array(
			'interest' => 'interestTitle',
			'event_title' => 'eventTitle',
			'venue_name' => 'venueName',
			'venue_address' => 'placeId',
			'venue_area' => 'areaSelected',
			'start_time' => 'localStartDateTime',
			'end_time' => 'localEndDateTime',
			'event_main_url' => 'eventUrl',
			'event_image_url' => 'icon',
			'contact' => 'contact',
			'event_description' => 'description',
			'tickets_url' => 'ticketsUrl',
			'speaker' => 'speaker',
			'leader' => 'leader'
		);

		$arguments = @compact(
		"instructions","taskStream", "lineCount",
			"luid", "mappedTitle", "requiredFields", "texts"
		);

		// pause offline notifications
		Streams_Notification::pause();

		// test processing
		$exceptions = self::import_process($arguments);

		// resume offline notifications
		Streams_Notification::resume();

		if (count($exceptions)) {
			$taskStream->setAttribute("processed", 0);
			$taskStream->setAttribute("progress", 0);
			$taskStream->save();

			$errors = array();
			foreach($exceptions as $i => $exception) {
				$errors[Q::interpolate($texts['errorLine'], array($i))] = $exception->getMessage();
			}

			$taskStream->post($luid, array(
				'type' => 'Streams/task/error',
				'instructions' => $errors,
			), true);

			return;
		}

		// if we reached here, then the task has completed
		$taskStream->setAttribute('complete', 1);
		$taskStream->save();
		$taskStream->post($luid, array(
			'type' => 'Streams/task/complete'
		), true);
	}

	/**
	 * Make process of import task
	 * @method import_process
	 * @param {array} $params
	 * @throws
	 * @return {array} 	$exceptions
	 */
	private static function import_process($params) {
		$fields = array();

		$instructions = $params['instructions'];
		//$instructions = array($instructions[0], $instructions[1], $instructions[2]);
		$taskStream = $params['taskStream'];
		$currentCommunityId = $taskStream->getAttribute("communityId", Users::currentCommunityId(true));
		$mainCommunityId = Users::communityId();
		$lineCount = $params['lineCount'];
		$luid = $params['luid'];
		$mappedTitle = $params['mappedTitle'];
		$requiredFields = $params['requiredFields'];
		$texts = $params['texts'];

		$exceptions = array();

		function clear ($value) {
			$value = preg_replace("/[\n\r|\r|\n]/", " ", $value);
			return trim($value);
		}

		// start parsing the rows
		foreach ($instructions as $j => $line) {
			if (!$line) {
				continue;
			}
			if (++$j === 1) {
				// get the fields from the first row
				$fields = array_map(function ($val) {
					return Q_Utils::normalize(trim(preg_replace("/[^A-Za-z0-9 ]/", '', $val)));
				}, $line);

				// check for required fields
				foreach($requiredFields as $item) {
					if (!in_array($item, $fields)) {
						$exceptions[$j] = new Exception(Q::interpolate($texts['fieldNotFound'], array($item)));
						return $exceptions;
					}
				}

				continue;
			}

			$processed = $taskStream->getAttribute('processed', 0);
			if ($j <= $processed) {
				continue;
			}
			$empty = true;
			foreach ($line as $v) {
				if ($v) {
					$empty = false;
					break;
				}
			}
			if ($empty) {
				continue;
			}

			$data = array(
				'communityId' => $currentCommunityId,
				'publisherId' =>  $currentCommunityId
			);
			$start_time = $end_time = array();

			try {
				foreach ($line as $i => $value) {
					$field = $fields[$i];

					// skip fields not required for event
					if (!Q::ifset($mappedTitle, $field, null)) {
						continue;
					}

					if (empty($value)) {
						$value = clear($value);
					} elseif (in_array($field, array('interest', 'speaker', 'leader'))) {
						$result = array();
						$rows = array_map('trim', preg_split("/\r\n|\n|\r/", trim($value)));
						foreach ($rows as $row) {
							$result = array_merge($result, explode(',', $row));
						}
						$value = array_map('trim', $result);
					} elseif ($field == 'start_time') {
						$start_time = array_filter(explode("\n", $value));
						$start_time = array_map('clear', $start_time);
					} elseif ($field == 'end_time') {
						$end_time = array_filter(explode("\n", $value));
						$end_time = array_map('clear', $end_time);
					} else {
						$value = clear($value);
					}

					switch ($field) {
						case 'venue_address':
							if (empty($value)) {
								break;
							}
							// seems address, let's get placeId
							if (preg_match('/\s/', $value)) {
								$location = Places::autocomplete($value, true);
								$value = $location[0]['place_id'];
							}
							break;
						case 'venue_area':
							if (empty($value)) {
								break;
							}

							$locationStream = Places_Location::stream(null, $mainCommunityId, $data['placeId']);
							$areaStream = Places_Location::addArea($locationStream, $value)[0];
							$currentArea = $value; // need later to compare with already added events
							$value = json_encode(array(
								'publisherId' => $areaStream->publisherId,
								'streamName' => $areaStream->name,
								'text' => $value
							));
							break;
						case 'interest':
							if (empty($value)) {
								break;
							}
							foreach ($value as $item) {
								// create interest stream if not exists
								Streams::getInterest($item, $mainCommunityId);
							}
							break;
						case 'start_time':
						case 'end_time':
							// set dateTime to format yyyy/mm/dd hh:mm:ss
							break;
					}

					$data[$mappedTitle[$field]] = $value;
				}

				foreach ($start_time as $timeIndex => $localStartDateTime) {
					// check whether this event already created
					$addedEvents = Streams_Stream::select()->where(array(
						'title' => $data['eventTitle'],
						'type' => 'Calendars/event',
						'closedTime' => null
					))->fetchDbRows();
					$locationStream = Places_Location::stream($mainCommunityId, $mainCommunityId, $data['placeId']);
					$alreadyAdded = false;
					$addedEvent = null;
					foreach ($addedEvents as $addedEvent) {
						$addedEvent = Streams_Stream::fetch($addedEvent->publisherId, $addedEvent->publisherId, $addedEvent->name);
						$addedEventLocation = Places_Location::fromStream($addedEvent);
						if (
							$addedEventLocation['name'] == $locationStream->name
							&& (empty($currentArea) || Q::ifset($addedEventLocation, 'area', 'title', null) == $currentArea)
							&& $addedEvent->getAttribute('localStartDateTime') == $localStartDateTime
						) {
							$alreadyAdded = true;
							break 1;
						}
					}

					if ($alreadyAdded && $addedEvent instanceof Streams_Stream) {
						$event = $addedEvent;
						$startTime = self::calculateStartTime($localStartDateTime, $locationStream);
						$endTime = $startTime + self::calculateDuration($localStartDateTime, Q::ifset($end_time, $timeIndex, null));
						$event->setAttribute('startTime', $startTime);
						$event->setAttribute('endTime', $endTime);

						$event->content = $data['description'];
						$event->save();

						// import icon to existing event stream
						self::importIcon($data['icon'], $event);
					} else {
						$data['localStartDateTime'] = $localStartDateTime;
						$data['localEndDateTime'] = Q::ifset($end_time, $timeIndex, null);

						$event = self::create($data);
					}

					// relate event to Calendars/calendar/main category
					self::relateToCommunity($event, $currentCommunityId);

					if ($mainCommunityId != $currentCommunityId && (bool)$taskStream->getAttribute('toMainCommunityToo')) {
						self::relateToCommunity($event, $mainCommunityId);
					}

					// join speakers
					self::joinSpeakers($event, Q::ifset($data, 'speaker', null));
					// join leaders
					self::joinSpeakers($event, Q::ifset($data, 'leader', null), "leader");
				}
			} catch (Exception $e) {
				$exceptions[$j] = $e;
			}

			$processed = $j;
			$taskStream->setAttribute('processed', $processed);
			$progress = ($j/$lineCount) * 100;
			$taskStream->setAttribute('progress', $progress);
			$taskStream->save();
			$taskStream->post($luid, array(
				'type' => 'Streams/task/progress',
				'instructions' => @compact('processed', 'progress'),
			), true);
		}

		return $exceptions;
	}
	/**
	 * Participate speakers
	 * @method joinSpeakers
	 * @param {Streams_Stream} $event
	 * @param {array|string} $speakers emails or full names
	 * @param {string} $role
	 * @throws
	 */
	static function joinSpeakers ($event, $speakers, $role="speaker") {
		if (empty($speakers)) {
			return;
		}

		if (!($event instanceof Streams_Stream)) {
			throw new Exception('Calendars_Event::joinSpeakers: $event is not stream');
		}

		foreach ($speakers as $speaker) {
			if (empty($speaker)) {
				continue;
			}

			$userId = null;

			if (filter_var($speaker, FILTER_VALIDATE_EMAIL)) {
				$user = Users_User::select()->where(array(
					'emailAddress' => strtolower($speaker)
				))->orWhere(array(
					'emailAddressPending' => strtolower($speaker)
				))->fetchDbRow();

				if ($user) {
					$userId = $user->id;
				}
			} else {
				$streamsAvatar = Streams_Avatar::select()->where(new Db_Expression(
					"concat(firstName, ' ', lastName)='$speaker'"
				))->fetchDbRow();

				if ($streamsAvatar) {
					$userId = $streamsAvatar->publisherId;
				}
			}

			if ($userId) {
				self::rsvp($event, $userId, 'yes', array(
					'skipPayment' => true,
					'skipSubscription' => true,
					'skipRecurringParticipant' => true,
					'extra' => compact("role")
				));

				$label = null;
				switch($role) {
					case "speaker":
						$label = "Users/speakers";
						break;
					case "leader":
						$label = "Users/hosts";
				}

				if ($label) {
					// add appropriate label
					Users_Contact::addContact($event->publisherId, $label, $userId, '', null, true);
					if ($event->publisherId != Users::communityId()) {
						Users_Contact::addContact(Users::communityId(), $label, $userId, '', null, true);
					}
				}
			}
		}
	}

	/**
	 * Get nearest date from time slots
	 * @method getNearestDate
	 * @param {array} $timeSlots
	 * @return {array} array of start, end dates as timestamps
	 */
	static function getNearestDate ($timeSlots, $locationStream) {
		$currentTimestamp = self::calculateStartTime("now", $locationStream);

		$timestamp = $currentTimestamp;
		for ($i = 0; $i < 8; $i++) {
			$weekDay = date('D', $timestamp);
			$dateString = date('Y-m-d', $timestamp);

			if ($timeSlots[$weekDay]) {
				foreach ($timeSlots[$weekDay] as $timeSlot) {
					$startTime = self::calculateStartTime($dateString.' '.$timeSlot[0], $locationStream);
					if ($startTime <= $currentTimestamp) {
						continue;
					}

					$endTime = $timeSlot[1] ? self::calculateStartTime($dateString.' '.$timeSlot[1], $locationStream) : null;

					return array($startTime, $endTime);
				}
			}

			$timestamp = strtotime('+1 day', $timestamp);
		}

		return null;
	}

	/**
	 * Get Calendars/availability by event
	 * @method getAvailability
	 * @param {Streams_Stream} $event
	 * @return {Streams_Stream|null}
	 */
	static function getAvailability ($event) {
		$relation = Streams_RelatedTo::select()->where(array(
			"fromPublisherId" => $event->publisherId,
			"fromStreamName" => $event->name,
			"toStreamName like " => 'Calendars/availability/%',
		))->fetchDbRow();

		if ($relation) {
			return Streams_Stream::fetch($relation->toPublisherId, $relation->toPublisherId, $relation->toStreamName);
		}

		return null;
	}

	/**
	 * Get Assets/service by event
	 * @method getAvailability
	 * @param {Streams_Stream} $event
	 * @return {Streams_Stream|null}
	 */
	static function getService ($event) {
		$availability = self::getAvailability($event);

		if (!$availability) {
			return  null;
		}

		$relation = Streams_RelatedTo::select()->where(array(
			"fromPublisherId" => $availability->publisherId,
			"fromStreamName" => $availability->name,
			"toStreamName like " => 'Assets/service/%',
		))->fetchDbRow();

		if ($relation) {
			return Streams_Stream::fetch($relation->toPublisherId, $relation->toPublisherId, $relation->toStreamName);
		}

		return null;
	}

	/**
	 * Post a message to Calendars/event about webrtc and livestream
	 * @method postMessage
	 * @param {Streams_Stream} $streamWebrtc
	 * @param {string} $action can be "join", "leave", "relate" and "unrelate"
	 * @param {Streams_Stream} [$relatedStream=null] pass it if action = "relate" or "unrelate"
	 */
	static function postMessage ($streamWebrtc, $action, $relatedStream = null) {
		list($relations, $streams) = $streamWebrtc->related(null, false, array(
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
		$streamEvent = Streams::fetchOne(null, $streamEvent->publisherId, $streamEvent->name);
		$instructions = array(
			'publisherId' => $streamWebrtc->publisherId,
			'streamName' => $streamWebrtc->name,
			'url' => $streamWebrtc->url()
		);
		switch ($action) {
			case 'join':
				if ($streamWebrtc->participatingCount == 1) {
					$type = 'webrtc';
					$what = 'started';
				}
				break;
			case 'leave':
				if ($streamWebrtc->participatingCount == 0) {
					$type = 'webrtc';
					$what = 'ended';
				}
				break;
			case 'relate':
				if ($relatedStream->type === 'Media/webrtc/livestream') {
					$type = 'livestream';
					$what = 'started';
					$instructions['related']['publisherId'] = $relatedStream->publisherId;
					$instructions['related']['streamName'] = $relatedStream->name;
					$instructions['related']['url'] = $relatedStream->url();
				}
				break;
			case 'unrelate':
				if ($relatedStream->type === 'Media/webrtc/livestream') {
					$type = 'livestream';
					$what = 'ended';
					$instructions['related']['publisherId'] = $relatedStream->publisherId;
					$instructions['related']['streamName'] = $relatedStream->name;
					$instructions['related']['url'] = $relatedStream->url();
				}
				break;
			default:
				return false;
		}
		if (!$type or !$what) {
			return false;
		}
		$streamEvent->post($streamEvent->publisherId, array(
			'type' => "Calendars/event/$type/$what",
			'instructions' => $instructions
		), true);
		return true;
	}
	
	/**
	 * Generates ics rule for recurring event
	 * @method recurrenceRule
	 * @param {string} $publisherId
	 * @param {string} $streamName
	 * @param {string} $userId
	 */
	static function recurrenceRule ($publisherId, $streamName, $userId) {
		$participant = new Streams_Participant();
		$participant->userId = $userId;
		$participant->publisherId = $publisherId;
		$participant->streamName = $streamName;

		if($participant->retrieve(null, false, array("ignoreCache" => true))) {
			$freq = $participant->getExtra('period');
			$days = $participant->getExtra('days');
			$startDate = $participant->getExtra('startDate');
			$endDate = $participant->getExtra('endDate');
		} else {
			$freq = $recurringInfoStream->getAttribute('period');
			$days = $recurringInfoStream->getAttribute('days');
		}

		$origDaysAbbr = array_keys($days);
		$twoLattersAbbr = [];
		foreach($origDaysAbbr as $abbr) {
			if(strtolower($abbr) == 'sun') {
				$twoLattersAbbr[] = 'SU';
			} else if(strtolower($abbr) == 'mon') {
				$twoLattersAbbr[] = 'MO';
			} else if(strtolower($abbr) == 'tue') {
				$twoLattersAbbr[] = 'TU';
			} else if(strtolower($abbr) == 'wed') {
				$twoLattersAbbr[] = 'WE';
			} else if(strtolower($abbr) == 'thu') {
				$twoLattersAbbr[] = 'TH';
			} else if(strtolower($abbr) == 'fri') {
				$twoLattersAbbr[] = 'FR';
			} else if(strtolower($abbr) == 'sat') {
				$twoLattersAbbr[] = 'SA';
			}
		}
		$byDay = implode(',', $twoLattersAbbr);
		$rrule = 'RRULE:';
		if($freq && !empty($freq)) {
			$rrule .= "FREQ=" . strtoupper($freq);
		}
		if($endDate) {
			$tzFormat = date("Ymd\THis\Z", strtotime($endDate));
			$rrule .= ";UNTIL=" . $tzFormat;
		}
		if(count($twoLattersAbbr) > 0) {
			$rrule .= ";BYDAY=" . $byDay;
		}

		if($rrule != 'RRULE:') {
			return $rrule;
		} else {
			return null;
		}
	}
}