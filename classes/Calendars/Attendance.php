<?php

/**
 * @module Calendars
 */

/**
 * Static methods backing the attendance sheet: fetching the event stream with
 * authorization, and building the list of people sorted for check-in.
 *
 * People are grouped by their "going" extra ("yes", then "maybe", then "no")
 * and within each group sorted alphabetically by first name, then last name.
 *
 * @class Calendars_Attendance
 */
class Calendars_Attendance
{
	/**
	 * The "going" values, in the order they are displayed.
	 * @property $goingOrder
	 * @type array
	 * @static
	 */
	static $goingOrder = array('yes', 'maybe', 'no');

	/**
	 * Read publisherId and eventId from the request (querystring fields or
	 * routed URI parts), then fetch the event stream and authorize the viewer.
	 * @method requestedStream
	 * @static
	 * @param {string} [$asUserId] Defaults to the logged-in user
	 * @return {Streams_Stream}
	 */
	static function requestedStream($asUserId = null)
	{
		$uri = Q_Dispatcher::uri();
		$publisherId = Q::ifset($_REQUEST, 'publisherId', $uri->publisherId);
		$eventId = Q::ifset($_REQUEST, 'eventId', $uri->eventId);
		if (empty($publisherId) or empty($eventId)) {
			throw new Q_Exception_RequiredField(array(
				'field' => 'publisherId and eventId'
			));
		}
		return self::stream($publisherId, $eventId, $asUserId);
	}

	/**
	 * Fetch an event stream and make sure the user may see its attendance.
	 * @method stream
	 * @static
	 * @param {string} $publisherId
	 * @param {string} $eventId The last part of "Calendars/event/$eventId"
	 * @param {string} [$asUserId] Defaults to the logged-in user
	 * @param {boolean} [$throwIfNotAuthorized=true]
	 * @return {Streams_Stream|null}
	 */
	static function stream($publisherId, $eventId, $asUserId = null, $throwIfNotAuthorized = true)
	{
		if (!isset($asUserId)) {
			$user = Users::loggedInUser($throwIfNotAuthorized);
			$asUserId = $user ? $user->id : null;
		}
		$streamName = "Calendars/event/$eventId";
		$stream = Streams_Stream::fetch($asUserId, $publisherId, $streamName, true);
		if (!self::authorized($stream, $asUserId)) {
			if ($throwIfNotAuthorized) {
				throw new Users_Exception_NotAuthorized();
			}
			return null;
		}
		return $stream;
	}

	/**
	 * Whether a user may view the attendance sheet for an event.
	 * Admins (writeLevel "close" or adminLevel "manage") always may.
	 * Participants with the "screener" role may too, since they run check-in.
	 * @method authorized
	 * @static
	 * @param {Streams_Stream} $stream
	 * @param {string} $asUserId
	 * @return {boolean}
	 */
	static function authorized($stream, $asUserId)
	{
		if (!$stream) {
			return false;
		}
		if (self::isAdmin($stream)) {
			return true;
		}
		if (!$asUserId) {
			return false;
		}
		// screeners run the door, same as in Calendars/checkin
		$participant = self::participant($stream, $asUserId);
		return ($participant and $participant->testRoles('screener'));
	}

	/**
	 * Whether the current user administers the event. Same test
	 * Calendars/checkin makes, so approval rights line up.
	 * @method isAdmin
	 * @static
	 * @param {Streams_Stream} $stream
	 * @return {boolean}
	 */
	static function isAdmin($stream)
	{
		return $stream ? (bool)$stream->testWriteLevel(40) : false;
	}

	/**
	 * Build the grouped, sorted list of people participating in an event.
	 * @method people
	 * @static
	 * @param {Streams_Stream} $stream
	 * @param {string} [$asUserId] Whose view of the avatars to use
	 * @return {array} keys "yes", "maybe", "no", each an array of people
	 */
	static function people($stream, $asUserId = null)
	{
		$participants = Streams_Participant::select('*')->where(array(
			'publisherId' => $stream->publisherId,
			'streamName' => $stream->name,
			'state' => 'participating'
		))->fetchDbRows();

		$userIds = array();
		foreach ($participants as $p) {
			$userIds[] = $p->userId;
		}
		$avatars = $userIds
			? Streams_Avatar::fetch($asUserId, $userIds)
			: array();

		$groups = array();
		foreach (self::$goingOrder as $going) {
			$groups[$going] = array();
		}

		foreach ($participants as $p) {
			$userId = $p->userId;
			$avatar = Q::ifset($avatars, $userId, null);
			$firstName = $avatar ? trim((string)$avatar->firstName) : '';
			$lastName = $avatar ? trim((string)$avatar->lastName) : '';
			$displayName = $avatar
				? $avatar->displayName(array('short' => false))
				: '';
			if (!$displayName) {
				$displayName = trim("$firstName $lastName");
			}
			$going = $p->getExtra('going');
			if (!in_array($going, self::$goingOrder, true)) {
				// participants who never answered are listed with the "no" group
				$going = 'no';
			}
			$groups[$going][] = array(
				'userId' => $userId,
				'firstName' => $firstName,
				'lastName' => $lastName,
				'displayName' => $displayName,
				'going' => $going,
				// the client builds a Streams.Participant from this,
				// to compute badges the same way the event tool does
				'participant' => $p->exportArray()
			);
		}

		foreach ($groups as $going => $people) {
			usort($people, array(__CLASS__, 'compare'));
			$groups[$going] = $people;
		}
		return $groups;
	}

	/**
	 * Mark a participant as checked in, or clear it.
	 *
	 * Mirrors the semantics of Calendars/checkin exactly, so the QR scanner
	 * and the attendance sheet can never disagree about who is in:
	 *
	 * - "attendee" means checked in. This is the flag that counts.
	 * - "arrived" means they showed up but the event requires payment and
	 *   they haven't paid. An admin can approve them through anyway; a
	 *   screener can only record that they turned up.
	 *
	 * @method setAttending
	 * @static
	 * @param {Streams_Stream} $stream
	 * @param {string} $userId Whose participation to mark
	 * @param {boolean} $attending
	 * @param {string} [$asUserId] Who is doing the marking
	 * @param {boolean} [$isAdmin] Whether they may approve an unpaid person
	 * @return {Streams_Participant}
	 */
	static function setAttending($stream, $userId, $attending, $asUserId = null, $isAdmin = false)
	{
		$participant = self::participant($stream, $userId);
		if (!$participant) {
			throw new Q_Exception_MissingRow(array(
				'table' => 'participant',
				'criteria' => $userId
			));
		}

		$role = null;

		if ($attending) {
			$paymentType = Q::ifset($stream->getAttribute("payment"), "type", null);
			$paid = $participant->getExtra('paid');

			// same test Calendars/checkin makes
			if ($paymentType !== "required" or $paid === 'fully' or $isAdmin) {
				$role = 'attendee';
			} else {
				$role = 'arrived';
			}

			self::revokeRoles($participant, array('attendee', 'arrived'));
			Calendars_Event::grantRoles($participant, $role);

			// don't trust it — testRoles is the same check the UI makes, so
			// verify rather than let a no-op look like a success
			if (!$participant->testRoles($role)) {
				self::stripRoles($participant, array('attendee', 'arrived'));
				$roles = $participant->getExtra('roles');
				$roles = is_array($roles) ? $roles : array();
				$roles[] = $role;
				$participant->setExtra('roles', array_values(array_unique($roles)));
			}

			if ($role === 'attendee') {
				$participant->setExtra(array('checkedInByUserId' => $asUserId));
			}
		} else {
			self::revokeRoles($participant, array('attendee', 'arrived'));

			// same again in reverse: if the role survived, strip it directly,
			// otherwise the sheet toggles back to green a moment later
			if ($participant->testRoles('attendee')
			or $participant->testRoles('arrived')) {
				self::stripRoles($participant, array('attendee', 'arrived'));
			}

			$participant->setExtra(array('checkedInByUserId' => null));
		}

		$participant->save();

		// so open attendance sheets and event tools update in place
		$stream->post($asUserId, array(
			'type' => 'Calendars/attending',
			'content' => '',
			'instructions' => Q::json_encode(array(
				'userId' => $userId,
				'attending' => (bool)$attending,
				'role' => $role,
				'participant' => $participant->exportArray()
			))
		), true);

		return $participant;
	}

	/**
	 * Fetch a participant row directly, bypassing any cache, the way
	 * Calendars/checkin does.
	 * @method participant
	 * @static
	 * @param {Streams_Stream} $stream
	 * @param {string} $userId
	 * @return {Streams_Participant|null}
	 */
	static function participant($stream, $userId)
	{
		$participant = new Streams_Participant();
		$participant->publisherId = $stream->publisherId;
		$participant->streamName = $stream->name;
		$participant->streamType = $stream->type;
		$participant->userId = $userId;
		if (!$participant->retrieve(null, false, array("ignoreCache" => true))) {
			return null;
		}
		return $participant;
	}

	/**
	 * Remove roles from a participant.
	 *
	 * Calendars_Event::grantRoles is the granting counterpart and is known to
	 * exist; the revoking one isn't, so this tries the likely names before
	 * falling back to editing the "roles" extra directly. Does not save.
	 *
	 * @method revokeRoles
	 * @static
	 * @param {Streams_Participant} $participant
	 * @param {array} $roles
	 */
	static function revokeRoles($participant, $roles)
	{
		$roles = is_array($roles) ? $roles : array($roles);

		foreach (array('revokeRoles', 'removeRoles', 'denyRoles') as $method) {
			if (method_exists('Calendars_Event', $method)) {
				Calendars_Event::$method($participant, $roles);
				return;
			}
		}
		if (method_exists($participant, 'removeRole')) {
			foreach ($roles as $role) {
				$participant->removeRole($role);
			}
			return;
		}

		self::stripRoles($participant, $roles);
	}

	/**
	 * Remove roles by editing the "roles" extra directly. The last resort,
	 * and also the verification fallback when a revoker turns out to be a
	 * no-op. Does not save.
	 * @method stripRoles
	 * @static
	 * @param {Streams_Participant} $participant
	 * @param {array} $roles
	 */
	static function stripRoles($participant, $roles)
	{
		$roles = is_array($roles) ? $roles : array($roles);

		$existing = $participant->getExtra('roles');
		if (is_string($existing)) {
			$existing = json_decode($existing, true);
		}
		if (!is_array($existing)) {
			$existing = array();
		}
		$participant->setExtra('roles', array_values(array_diff($existing, $roles)));
	}

	/**
	 * Compare two people: first name, then last name, then display name.
	 * People with no name at all sort to the end of their group.
	 * @method compare
	 * @static
	 * @param {array} $a
	 * @param {array} $b
	 * @return {integer}
	 */
	static function compare($a, $b)
	{
		$c = self::collate($a['firstName'], $b['firstName']);
		if ($c) {
			return $c;
		}
		$c = self::collate($a['lastName'], $b['lastName']);
		if ($c) {
			return $c;
		}
		return self::collate($a['displayName'], $b['displayName']);
	}

	/**
	 * Case-insensitive comparison that sorts empty values last.
	 * @method collate
	 * @static
	 * @param {string} $a
	 * @param {string} $b
	 * @return {integer}
	 */
	static function collate($a, $b)
	{
		$a = self::sortKey($a);
		$b = self::sortKey($b);
		if ($a === '' and $b === '') {
			return 0;
		}
		if ($a === '') {
			return 1;
		}
		if ($b === '') {
			return -1;
		}
		return strcmp($a, $b);
	}

	/**
	 * Normalize a name for sorting.
	 * @method sortKey
	 * @static
	 * @param {string} $s
	 * @return {string}
	 */
	static function sortKey($s)
	{
		$s = trim((string)$s);
		return function_exists('mb_strtolower')
			? mb_strtolower($s, 'UTF-8')
			: strtolower($s);
	}
}
