<?php
/**
 * @module Calendars
 */
/**
 * Class for dealing with calendar availabilities
 * 
 * @class Calendars_Availability
 */
class Calendars_Availability {
	/**
	 * relation type recurring category related to availability
	 */
	const recurringRelationType = "Calendars/recurring";

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
	 * Get all the Calendars/availability streams the user is participating in
	 * @method participating
	 * @param {string} $userId If null, currently logged in user used.
	 * @return {array} The streams, filtered by the above parameters
	 */
	static function participating($userId = null) {
		if (!isset($userId)) {
			$userId = Users::loggedInUser(true)->id;
		}

		return Streams::participating("Calendars/availability", @compact("userId"));
	}
	/**
	 * Used to create or update availability
	 * @method aggregate
	 * @param {array} $options
	 * @param {array} $options.template Required. Calendars availability stream info array('publisherId' => ..., 'streamName' => ...)
	 * @param {array} $options.location Required. Location info in format:
	 * array(
	 * 		'publisherId' => ...,
	 * 		'placeId' => ...,
	 * 		'area' => array(
	 * 			'publisherId' => ...,
	 * 			'streamName' => ...
	 * 		)
	 *  )
	 * @param {array} $options.timeSlots Required. Time slots in format array('Mon' => array(array('7:00', '8:00'), ...), ...)
	 * @param {array} [$options.availability] Availability stream data array('publisherId' => ..., 'streamName' => ...). If this
	 * param defined - it means 'edit' mode.
	 * @param {array} [$options.labels]	Optional. Labels in format array('Users/guests' => "Guest")
	 * @param {Int} [$options.peopleMin] People minimum. If omit, default used from Calendars/events/defaults config.
	 * @param {Int} [$options.peopleMax] People max. If omit, default used from Calendars/events/defaults config.
	 * @throws Q_Exception
	 * @throws Q_Exception_MissingRow
	 *
	 * @return {Streams_Stream} Availability stream
	 */
	static function aggregate($options, $skipAccess = false)
	{
		$user = Users::loggedInUser(true);
		$data = Q::take($options, array(
			'availability' => null,
			'location' => null,
			'template' => null,
			'timeSlots' => null,
			'teleconference' => null,
			'teleconferenceUrl' => null,
			'timezone' => null,
			'recurringStartDate' => null,
			'recurringEndDate' => null,
			'labels' => null,
			'peopleMin' => null,
			'peopleMax' => null
		));

		if (empty($data['template'])) {
			throw new Q_Exception_RequiredField(array('field' => 'Service template'));
		}

		if (empty($data['location']) && empty($data['teleconference'])) {
			throw new Q_Exception_RequiredField(array('field' => 'location'));
		}

		if (empty($data['timeSlots'])) {
			throw new Q_Exception_RequiredField(array('field' => 'Time slots'));
		}

		$availabilityPublisherId = Q::ifset($data, 'availability', "publisherId", null);
		$availabilityStreamName = Q::ifset($data, 'availability', "streamName", null);
		$availabilityStream = null;
		if ($availabilityPublisherId && $availabilityStreamName) {
			$availabilityStream = Streams_Stream::fetch(null, $availabilityPublisherId, $availabilityStreamName);
		}

		$currentCommunity = Users::currentCommunityId(true);
		$publisherId = $currentCommunity;

		$templatePublisherId = Q::ifset($data, 'template', 'publisherId', null);
		$templateStreamName = Q::ifset($data, 'template', 'streamName', null);
		if (!$templatePublisherId || !$templateStreamName) {
			throw new Q_Exception("Assets/service template missing");
		}
		$assetsService = Streams_Stream::fetch($user->id, $templatePublisherId, $templateStreamName, true);

		$defaults = Q_Config::expect('Calendars', 'events', 'defaults');
		$peopleMin = $data['peopleMin'] ?: $defaults['peopleMin'];
		$peopleMax = $data['peopleMax'] ?: $defaults['peopleMax'];
		if (!is_numeric($peopleMin) or floor($peopleMin) != $peopleMin) {
			throw new Q_Exception("Min availability size must be a number");
		}
		if (!is_numeric($peopleMax) or floor($peopleMax) != $peopleMax) {
			throw new Q_Exception("Max availability size must be a number");
		}
		$peopleMin = (integer)$peopleMin;
		$peopleMax = (integer)$peopleMax;
		if ($peopleMin >= $peopleMax) {
			throw new Q_Exception("Max event size can't be less than $peopleMin");
		}

		// location
		$placeId = Q::ifset($data, 'location', 'placeId', null);
		$area = Q::ifset($data, 'location', 'area', null);

		$attributes = array(
			'timeSlots' => $data['timeSlots'],
			'recurringStartDate' => $data['recurringStartDate'],
			'recurringEndDate' => $data['recurringEndDate'],
			'teleconference' => $data['teleconference'],
			'teleconferenceUrl' => $data['teleconferenceUrl'],
			'timezone' => $data['timezone'],
			'peopleMin' => $peopleMin,
			'peopleMax' => $peopleMax
		);

		if ($labels = $data['labels']) {
			$attributes['labels'] = $labels;
		}

		// if availability stream defined - edit mode
		if ($availabilityStream) {
			foreach ($attributes as $name => $attribute) {
				$availabilityStream->setAttribute($name, $attribute);
			}
			$availabilityStream->changed();

			self::relateToAssetsService($availabilityStream, $assetsService);
			if ($placeId) {
				self::relateToLocation($availabilityStream, $placeId);
				if ($area) {
					self::relateToArea($availabilityStream, $area);
				}
			}
			self::updateRecurringCategory($availabilityStream);
		} else {
			// create availabilityies main category if not exists
			$categoryStreamName = "Calendars/availabilities/main";
			if (empty(Streams_Stream::fetch($currentCommunity, $currentCommunity, $categoryStreamName))) {
				Streams::create($currentCommunity, $currentCommunity, 'Streams/category', array('name' => $categoryStreamName));
			}

			$availabilityStream = Streams::create(null, $publisherId, 'Calendars/availability', array(
				'title' => $assetsService->title,
				'content' => $assetsService->content,
				'attributes' => $attributes
			), array(
				'skipAccess' => $skipAccess
			));

			self::relateToAssetsService($availabilityStream, $assetsService);
			if ($placeId) {
				self::relateToLocation($availabilityStream, $placeId);
				if ($area) {
					self::relateToArea($availabilityStream, $area);
				}
			}
			self::getRecurringCategory($availabilityStream); // create recurring stream for availability

			$availabilityStream->relateTo(
				(object)array('publisherId' => $currentCommunity, 'name' => $categoryStreamName),
				'Calendars/availability',
				null,
				array(
					'skipAccess' => $skipAccess,
					'inheritAccess' => true,
					'weight' => time()
			));
		}

		return $availabilityStream;
	}
	/**
	 * Relate availability to Assets service stream (template)
	 * @method relateToAssetsService
	 * @static
	 * @param {Streams_Stream} $availability
	 * @param {Streams_Stream} $assetsService
	 */
	private static function relateToAssetsService($availability, $assetsService) {
		// if availability stream doesn't changed - nothing to do
		if (Q::ifset($availability->getAttribute('serviceTemplate'), 'streamName', null) == $assetsService->name) {
			return;
		}

		// unrelate from old location
		$related = Streams_RelatedTo::select()->where(array(
			'fromPublisherId' => $availability->publisherId,
			'fromStreamName' => $availability->name,
			'type' => 'Calendars/availability'
		))->fetchDbRows();
		foreach ($related as $item) {
			if (!Q::startsWith($item->toStreamName, 'Assets/service')) {
				continue;
			}

			$availability->unrelateTo((object)array(
				'publisherId' => $item->toPublisherId,
				'name' => $item->toStreamName
			), 'Calendars/availability');
		}

		$availability->relateTo($assetsService, 'Calendars/availability', null, array(
			'skipAccess' => true,
			'weight' => time()
		));

		$availability->title = $assetsService->title;
		$availability->content = $assetsService->content;
		$availability->setAttribute('serviceTemplate', array(
			"publisherId" => $assetsService->publisherId,
			"streamName" => $assetsService->name,
			"price" => $assetsService->getAttribute('price'),
			"currency" => $assetsService->getAttribute('currency'),
			"requiredParticipants" => $assetsService->getAttribute('requiredParticipants'),
			"payment" => $assetsService->getAttribute('payment'),
			"link" => $assetsService->getAttribute('link')
		));
		$availability->changed();
	}
	/**
	 * Relate availability to location stream
	 * @method relateToLocation
	 * @static
	 * @param {Streams_Stream} $availability
	 * @param {Streams_Stream} $placeId
	 */
	private static function relateToLocation($availability, $placeId) {
		$location = $availability->getAttribute('location') ?: array();

		if (Q::ifset($location, 'placeId', null) == $placeId) {
			return;
		}

		// unrelate from old location
		$related = Streams_RelatedTo::select()->where(array(
			'fromPublisherId' => $availability->publisherId,
			'fromStreamName' => $availability->name,
			'type' => 'Calendars/availability'
		))->fetchDbRows();
		foreach ($related as $item) {
			if (!Q::startsWith($item->toStreamName, 'Places/location')) {
				continue;
			}

			$availability->unrelateTo((object)array(
				'publisherId' => $item->toPublisherId,
				'name' => $item->toStreamName
			), 'Calendars/availability');
		}

		$locationStream = Places_Location::stream(null, Users::communityId(), $placeId, array(
			'throwIfBadValue' => true,
			'withTimeZone' => true
		));
		$location['placeId'] = $placeId;
		$location['latitude'] = $locationStream->getAttribute('latitude');
		$location['longitude'] = $locationStream->getAttribute('longitude');
		$location['venue'] = $locationStream->title;
		$location['address'] = $locationStream->getAttribute("address");
		$location['timeZone'] = $locationStream->getAttribute('timeZone');

		// relate to new location
		$availability->relateTo($locationStream, 'Calendars/availability', null, array(
			'skipAccess' => true,
			'weight' => time()
		));

		$availability->setAttribute('location', $location);
		$availability->changed();
	}
	/**
	 * Relate availability to area stream
	 * @method relateToArea
	 * @static
	 * @param {Streams_Stream} $availability
	 * @param {array} $area
	 */
	private static function relateToArea($availability, $area)
	{
		$location = $availability->getAttribute('location') ?: array();
		$areaPublisherId = Q::ifset($area, 'publisherId', null);
		$areaStreamName = Q::ifset($area, 'streamName', null);

		if (Q::ifset($location, 'area', 'publisherId', null) == $areaPublisherId && Q::ifset($location, 'area', 'streamName', null) == $areaStreamName) {
			return;
		}

		// unrelate from old location
		$related = Streams_RelatedTo::select()->where(array(
			'fromPublisherId' => $availability->publisherId,
			'fromStreamName' => $availability->name,
			'type' => 'Calendars/availability'
		))->fetchDbRows();
		foreach ($related as $item) {
			if (!Q::startsWith($item->toStreamName, 'Places/area')) {
				continue;
			}

			$availability->unrelateTo((object)array(
				'publisherId' => $item->toPublisherId,
				'name' => $item->toStreamName
			), 'Calendars/availability');
		}

		if ($areaPublisherId && $areaStreamName) {
			$areaStream = Streams_Stream::fetch(null, $areaPublisherId, $areaStreamName, true);
			$location['area'] = array(
				'publisherId' => $areaStream->publisherId,
				'streamName' => $areaStream->name,
				'text' => $areaStream->title
			);

			// relate to new area
			$availability->relateTo($areaStream, 'Calendars/availability', null, array(
				'skipAccess' => true,
				'weight' => time()
			));
		} else {
			unset($location['area']);
		}

		$availability->setAttribute('location', $location);
		$availability->changed();
	}

	/**
	 * Get availability and create future events
	 * @method createEvents
	 * @static
	 * @param {Streams_Stream} $availability
	 * @param {array} $params array of params needed to create events
	 * @param {boolean} [$params.paymentCheck=false] If true, check whether user have enough enough credits to pay for participate to events
	 * @param {boolean} [$params.userId] If defined, calculate events related to this user.
	 * @param {boolean} [$params.recurring=false] If true, participate user during event creation.
	 * This flag defined as true if user reserve availability from web and set "recurring/just once" switch selected "recurring".
	 * Otherwise this option false.
	 *
	 * @return {array} events streams created
	 */
	static function createEvents ($availabilityStream, $params = array()) {
		$params['publisherId'] = $availabilityStream->publisherId;
		$params['interestTitle'] = $availabilityStream->title;
		$location = $availabilityStream->getAttribute('location');
		$locationStream = null;
		if ($location) {
			$locationStream = Places_Location::stream(null, Users::communityId(), $location['placeId']);
		}
		$params['placeId'] = $location['placeId'];
		$params['areaSelected'] = Q::ifset($location, 'area', null);
		$paymentCheck = Q::ifset($params, "paymentCheck", false);
		$userId = Q::ifset($params, "userId", null);
		$isPublisher = $userId == $params['publisherId'];

		$assetsService = $availabilityStream->getAttribute('serviceTemplate');
		$assetsService = Streams_Stream::fetch(null, $assetsService['publisherId'], $assetsService['streamName']);
		if ($assetsService->icon != "default") {
			$params['icon'] = $assetsService->icon;
		}
		$params['eventUrl'] = $assetsService->getAttribute('link');
		$assetsServicePayment = array(
			'type' => $assetsService->getAttribute('payment'),
			'amount' => $assetsService->getAttribute('price'),
			'currency' => $assetsService->getAttribute('currency') ?: "USD"
		);
		$params["payment"] = $assetsServicePayment;

		$requiredParticipants = $assetsService->getAttribute('requiredParticipants');
		$params['peopleMin'] = $availabilityStream->getAttribute('peopleMin');
		$params['peopleMax'] = $availabilityStream->getAttribute('peopleMax');
		$params['labels'] = $availabilityStream->getAttribute('labels');
		if (is_array($params['labels'])) {
			$params['labels'] = implode("\t", array_keys($params['labels']));
		}

		// get related recurring category
		$recurringCategory = self::getRecurringCategory($availabilityStream);
		$recurringDays = $recurringCategory->getAttribute("days");

		// default time slots from availability
		if (empty($params['timeSlots'])) {
			$availabilityTimeSlots = $availabilityStream->getAttribute("timeSlots");

			// if recurring days, filter by days
			if (is_array($recurringDays)) {
				foreach ($availabilityTimeSlots as $weekDay => $timeSlots) {
					if (!Q::ifset($recurringDays, $weekDay, null)) {
						unset($availabilityTimeSlots[$weekDay]);
						continue;
					}
					foreach ($timeSlots as $i => $timeSlot) {
						if (!in_array($timeSlot, $recurringDays[$weekDay])) {
							unset($availabilityTimeSlots[$weekDay][$i]);
						}
					}
				}
			}

			$params['timeSlots'] = $availabilityTimeSlots;
		}
		$recurringInfo = array(
			"period" => "weekly",
			"recurringCategory" => $recurringCategory,
			"skipParticipating" => $params['recurring'] !== true, //If true, participate user during event creation
			"days" => $params['timeSlots']
		);

		$startDate = null;
		$endDate = null;
		$events = array();
		$needCredits = 0; // will collect credits need to pay to join events
		$eventsAmount = 0;
		foreach ($params['timeSlots'] as $weekDay => $timeSlots) {
			foreach ($timeSlots as $timeSlot) {
				$timeSlot = array($weekDay => array($timeSlot));
				$nearestDate = Calendars_Event::getNearestDate($timeSlot, $locationStream);
				$eventsAmount++;

				// check if event already exists
				$eventExists = Streams_RelatedTo::select()->where(array(
					'toPublisherId' => $availabilityStream->publisherId,
					'toStreamName' => $availabilityStream->name,
					'type' => 'Calendars/event',
					'weight' => $nearestDate[0]
				))->fetchDbRows();
				if (count($eventExists)) {
					$eventExists = reset($eventExists);
					$event = Streams_Stream::fetch($eventExists->fromPublisherId, $eventExists->fromPublisherId, $eventExists->fromStreamName);

					$participated = false;
					if ($userId) {
						$participated = Streams_Participant::select("count(*) as res")->where(array(
							"streamName" => $event->name,
							"userId" => $userId,
							"state" => "participating",
							"extra like " => '%"going":"yes"%'
						))->ignoreCache()->execute()->fetchAll(PDO::FETCH_ASSOC)[0]["res"];

						if ($params['recurring']) {
							// update recurring participant with day
							Calendars_Recurring::setRecurringParticipant($event, array("period" => $recurringInfo["period"], "days" => array($weekDay => $timeSlots)), true);
						}
					}

					$events[] = $event;

					if ($paymentCheck && !$participated && !$isPublisher) {
						$payment = $event->getAttribute("payment");
						if (Q::ifset($payment, "type", null) == "required") {
							$needCredits += Assets_Credits::convert($payment["amount"], $payment["currency"], "credits");
						}
					}
					continue;
				} elseif ($paymentCheck) {
					if (!$isPublisher && $assetsServicePayment["type"] == "required") {
						$needCredits += Assets_Credits::convert($assetsServicePayment["amount"], $assetsServicePayment["currency"], "credits");
					}
					continue;
				}

				$params['startTime'] = $nearestDate[0];
				$params['endTime'] = $nearestDate[1];

				// make event recurring anyway, because all availability events are recurring
				$params['recurring'] = $recurringInfo;

				// if non logged user, login as availability publisher
				if (!Users::loggedInUser()) {
					Users::setLoggedInUser($params['publisherId']);
				}

				// create event
				$event = Calendars_Event::create($params, true);

				// relate event to availability stream
				$event->relateTo($availabilityStream, 'Calendars/event', null, array(
					'skipAccess' => true,
					'extra' => array(
						$availabilityStream->name => array('timeSlots' => $timeSlot)
					),
					'weight' => $event->getAttribute('startTime')
				));

				// join staff users
				$staffParticipants = Streams_Participant::select()->where(array(
					'publisherId' => $availabilityStream->publisherId,
					'streamName' => $availabilityStream->name,
					'state' => 'participating'
				))->ignoreCache()->fetchDbRows();
				foreach ($staffParticipants as $staffParticipant) {
					if (!$staffParticipant->testRoles('staff')) {
						continue;
					}

					Calendars_Event::rsvp($event, $staffParticipant->userId, 'yes', array(
						'skipPayment' => true,
						'extra' => array('role' => 'staff')
					));
				}

				// set required participants
				if ($requiredParticipants) {
					$event->setAttribute("requiredParticipants", $requiredParticipants)->save();
				}

				$events[] = $event;
			}
		}

		// if paymentCheck==true, return check results
		if ($paymentCheck) {
			return @compact("needCredits", "eventsAmount");
		}

		return $events;
	}

	/**
	 * get recurring category related to availability
	 * @method getRecurringCategory
	 * @static
	 * @param {Streams_Stream|array|object} $availabilityStream Stream or array("publisherId" => ..., "streamName" => ...)
	 * @return Streams_Stream|null
	 */
	static function getRecurringCategory ($availabilityStream) {
		// $availabilityStream can be array or object with publisherId and streamName
		$availabilityStream = Calendars_Recurring::toStream($availabilityStream);
		$recurringCategory = $availabilityStream->related($availabilityStream->publisherId, true, array(
			'type' => self::recurringRelationType,
			'streamsOnly' => true
		));
		if (is_array($recurringCategory) && sizeof($recurringCategory)) {
			return reset($recurringCategory);
		}

		// each availability must have recurring category
		$recurringCategory = Calendars_Recurring::create($availabilityStream->publisherId, array("days" => $availabilityStream->getAttribute("timeSlots")));
		$recurringCategory->relateTo($availabilityStream, self::recurringRelationType, null, array("skipAccess" => true));

		return $recurringCategory;
	}

	/**
	 * get recurring category related to availability
	 * @method updateRecurringCategory
	 * @static
	 * @param {Streams_Stream|array|object} $availabilityStream Stream or array("publisherId" => ..., "streamName" => ...)
	 */
	static function updateRecurringCategory ($availabilityStream) {
		// update recurring category if exists
		$recurringCategory = self::getRecurringCategory($availabilityStream);
		if (empty($recurringCategory)) {
			return;
		}

		// check recurring days
		// recurring category can't include days absent in availability,
		// but can omit days exist in availability, because recurring category created "on demand" when event reserved
		$recurringCategory->setAttribute("days", $availabilityStream->getAttribute("timeSlots"));
		$recurringCategory->setAttribute("startDate", $availabilityStream->getAttribute("recurringStartDate"));
		$recurringCategory->setAttribute("endDate", $availabilityStream->getAttribute("recurringEndDate"));
		$recurringCategory->changed();
	}
}