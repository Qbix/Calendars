/**
 * Calendars/attendance tool.
 * Lists everyone participating in an event so staff can find a person by name
 * and check them in. People going "yes" come first, then "maybe", then "no",
 * and within each group they are sorted by first name, then last name.
 *
 * Only event admins (and screeners) can load the data — the server enforces it.
 *
 * @module Calendars-attendance
 * @class Calendars/attendance
 */
(function (Q, $, window, undefined) {

var Streams = Q.Streams;
var Calendars = Q.Calendars;

Q.Tool.define("Calendars/attendance", function (options) {
	var tool = this;
	var state = tool.state;

	state.publisherId = state.publisherId
		|| Q.getObject("stream.fields.publisherId", state);
	state.streamName = state.streamName
		|| Q.getObject("stream.fields.name", state)
		|| (state.eventId ? 'Calendars/event/' + state.eventId : null);

	if (!state.publisherId) {
		throw new Q.Error("Calendars/attendance: missing publisherId option");
	}
	if (!state.streamName) {
		throw new Q.Error("Calendars/attendance: missing streamName or eventId option");
	}
	state.eventId = state.eventId || state.streamName.split('/').pop();

	tool.peopleByUserId = {};

	// delegated once, survives re-renders
	$(tool.element).on(
		Q.Pointer.fastclick + '.Calendars_attendance',
		'.Calendars_attendance_person',
		function () {
			var userId = this.getAttribute('data-userId');
			var person = tool.peopleByUserId[userId];

			if (false === Q.handle(state.onSelect, tool, [userId, person, this])) {
				return false;
			}
			if (state.checkInOnClick && tool.canCheckIn) {
				tool.toggleAttending(userId);
			}
			return false;
		}
	);

	tool.refresh();

	// keep the sheet current while it's open at the door
	Streams.retainWith(tool).get(
		state.publisherId, state.streamName,
		function (err) {
			if (Q.firstErrorMessage(err)) {
				return;
			}
			var stream = tool.stream = this;
			var _refresh = Q.debounce(function () {
				tool.refresh();
			}, 500);
			Q.each([
				'Calendars/going',
				'Streams/joined',
				'Streams/left',
				'Streams/participant/extraUpdated'
			], function (i, type) {
				stream.onMessage(type).set(_refresh, tool);
			});

			// someone was checked in elsewhere (QR scanner at another door,
			// or a second admin) — patch that one row instead of reloading
			stream.onMessage('Calendars/attending').set(function (message) {
				var instructions = JSON.parse(message.instructions || '{}');
				tool.applyParticipant(
					instructions.userId, instructions.participant
				);
			}, tool);
		}
	);
},

{
	publisherId: null,
	streamName: null,
	eventId: null,
	order: ['yes', 'maybe', 'no'],
	showSearch: true,
	checkInOnClick: true,
	marks: {
		attendee: '\u2705',
		arrived: '\u23F3'
	},
	avatar: {
		icon: (window.devicePixelRatio > 1 ? '80' : '40'),
		"short": false,
		reflectChanges: false
	},
	onRefresh: new Q.Event(),
	onSelect: new Q.Event()
},

{
	/**
	 * Load the attendance data and re-render.
	 * @method refresh
	 * @param {Function} [callback]
	 */
	refresh: function (callback) {
		var tool = this;
		var state = tool.state;
		var $te = $(tool.element);

		$te.addClass('Q_working');
		Q.req('Calendars/attendance', ['attendance'], function (err, response) {
			$te.removeClass('Q_working');
			var msg = Q.firstErrorMessage(err, response && response.errors);
			if (msg) {
				return console.warn("Calendars/attendance: " + msg);
			}
			var attendance = Q.getObject(['slots', 'attendance'], response);
			if (!attendance) {
				return;
			}
			tool.attendance = attendance;
			tool.canCheckIn = !!attendance.canCheckIn;
			tool._render(attendance, callback);
		}, {
			fields: {
				publisherId: state.publisherId,
				eventId: state.eventId
			}
		});
	},

	/**
	 * Render the groups and rows.
	 * @method _render
	 * @private
	 * @param {Object} attendance
	 * @param {Function} [callback]
	 */
	_render: function (attendance, callback) {
		var tool = this;
		var state = tool.state;
		var $te = $(tool.element);
		var text = Q.getObject("attendance", tool.text) || {};
		var query = tool.$search ? tool.$search.val() : '';

		tool.peopleByUserId = {};

		Q.Tool.clear(tool.element);
		$te.empty();

		if (state.showSearch) {
			tool.$search = $('<input type="search" />')
			.addClass('Calendars_attendance_search_input')
			.attr('placeholder', text.SearchPlaceholder || 'Search by name')
			.val(query)
			.on('input.Calendars_attendance', Q.debounce(function () {
				tool.filter($(this).val());
			}, 150));

			$('<div class="Calendars_attendance_search" />')
			.append(tool.$search)
			.appendTo($te);
		}

		$te.attr('data-canCheckIn', tool.canCheckIn ? 'true' : 'false');

		var $groups = $('<div class="Calendars_attendance_groups" />');

		Q.each(state.order, function (i, going) {
			var people = Q.getObject(['groups', going], attendance) || [];
			var label = Q.getObject(['going', going], text) || going;

			var $group = $('<div class="Calendars_attendance_group" />')
			.attr('data-going', going);

			$('<div class="Calendars_attendance_group_title" />')
			.append($('<span class="Calendars_attendance_group_label" />').text(label))
			.append($('<span class="Calendars_attendance_group_count" />').text(people.length))
			.appendTo($group);

			var $people = $('<div class="Calendars_attendance_people" />')
			.appendTo($group);

			if (!people.length) {
				$('<div class="Calendars_attendance_none" />')
				.text(text.NoOne || '')
				.appendTo($people);
			}

			Q.each(people, function (j, person) {
				tool.peopleByUserId[person.userId] = person;
				$people.append(tool._person(person));
			});

			$groups.append($group);
		});

		$te.append($groups);

		Q.activate(tool.element, function () {
			tool._applyBadges(attendance);
			if (query) {
				tool.filter(query);
			}
			Q.handle(callback, tool, [attendance]);
			Q.handle(state.onRefresh, tool, [attendance]);
		});
	},

	/**
	 * Build one row.
	 * @method _person
	 * @private
	 * @param {Object} person
	 * @return {jQuery}
	 */
	_person: function (person) {
		var tool = this;
		var state = tool.state;

		// what we match the search box against
		var haystack = [
			person.firstName, person.lastName, person.displayName
		].join(' ').toLowerCase().replace(/\s+/g, ' ').trim();

		var $row = $('<div class="Calendars_attendance_person" />').attr({
			'data-userId': person.userId,
			'data-going': person.going,
			'data-name': haystack
		});

		$row.append(Q.Tool.setUpElement(
			'div',
			'Users/avatar',
			Q.extend({}, state.avatar, { userId: person.userId }),
			person.userId,
			tool.prefix
		));

		// our own mark, rather than a Q/badge: updateParticipants returns
		// early when a participant has no roles left, so it can add a badge
		// but never take one away — which makes un-checking invisible.
		$row.append($('<div class="Calendars_attendance_mark" />'));

		return $row;
	},

	/**
	 * Whether a person is checked in. "attendee" is the flag that counts —
	 * "arrived" means they turned up but haven't paid.
	 * @method isAttending
	 * @param {String} userId
	 * @return {Boolean}
	 */
	isAttending: function (userId) {
		var person = this.peopleByUserId[userId];
		if (!person || !person.participant) {
			return false;
		}
		var participant = new Streams.Participant(person.participant);
		return !!(participant.testRoles('attendee')
			|| participant.testRoles('arrived'));
	},

	/**
	 * Check someone in, or undo it. Optimistic: the row updates immediately
	 * and reverts if the request fails.
	 * @method toggleAttending
	 * @param {String} userId
	 * @param {Function} [callback]
	 */
	toggleAttending: function (userId, callback) {
		var tool = this;
		var state = tool.state;
		var person = tool.peopleByUserId[userId];
		if (!person) {
			return;
		}

		var was = tool.isAttending(userId);
		var $row = tool.$('.Calendars_attendance_person[data-userId="' + userId + '"]');

		$row.addClass('Q_working');
		Calendars.Event.setAttending(
			state.publisherId, state.eventId, userId, !was,
			function (err, participant) {
				$row.removeClass('Q_working');
				if (err) {
					Q.alert(err);
					return Q.handle(callback, tool, [err]);
				}
				tool.applyParticipant(userId, participant);

				// the row is painted from what the server sent back, so if
				// the write didn't take we'd silently snap green again.
				// Name the culprit instead of leaving it a mystery.
				if (tool.isAttending(userId) !== !was) {
					console.warn(
						"Calendars/attendance: asked to set attending="
						+ (!was) + " for " + userId
						+ " but the participant came back unchanged — "
						+ "check Calendars_Attendance::revokeRoles"
					);
				}

				Q.handle(callback, tool, [null, !was]);
			}
		);
	},

	/**
	 * Replace one person's participant and repaint just their row.
	 * @method applyParticipant
	 * @param {String} userId
	 * @param {Object} participantFields
	 */
	applyParticipant: function (userId, participantFields) {
		var tool = this;
		var person = tool.peopleByUserId[userId];
		if (!person || !participantFields) {
			return;
		}
		person.participant = participantFields;
		tool.$('.Calendars_attendance_person[data-userId="' + userId + '"]')
		.each(function () {
			tool._paintRow(this, person);
		});
	},

	/**
	 * Repaint one row from its participant. Unlike the Q/badge path, this
	 * clears as well as sets, so un-checking someone actually shows.
	 * @method _paintRow
	 * @private
	 * @param {Element} rowElement
	 * @param {Object} person
	 */
	_paintRow: function (rowElement, person) {
		var tool = this;
		var state = tool.state;
		if (!person || !person.participant) {
			return;
		}

		var participant = new Streams.Participant(person.participant);
		var attendee = !!participant.testRoles('attendee');
		var arrived = !!participant.testRoles('arrived');

		// three states: checked in, turned up but unpaid, not here yet
		var status = attendee ? 'true' : (arrived ? 'arrived' : 'false');
		var mark = attendee
			? state.marks.attendee
			: (arrived ? state.marks.arrived : '');

		var text = Q.getObject("attendance", tool.text) || {};

		$(rowElement)
		.attr('data-attending', status)
		.attr('title', tool.canCheckIn
			? (attendee || arrived
				? (text.UndoCheckIn || '')
				: (text.CheckIn || ''))
			: null
		);

		$('.Calendars_attendance_mark', rowElement).text(mark);
	},

	/**
	 * Paint every row after a full render.
	 * @method _applyBadges
	 * @private
	 * @param {Object} attendance
	 */
	_applyBadges: function (attendance) {
		var tool = this;
		tool.$('.Calendars_attendance_person').each(function () {
			tool._paintRow(this, tool.peopleByUserId[this.getAttribute('data-userId')]);
		});
	},

	/**
	 * Show only the people whose name contains the query.
	 * Group counts show how many matched.
	 * @method filter
	 * @param {String} query
	 */
	filter: function (query) {
		var tool = this;
		query = (query || '').toLowerCase().replace(/\s+/g, ' ').trim();

		tool.$('.Calendars_attendance_person').each(function () {
			var name = this.getAttribute('data-name') || '';
			this.style.display = (!query || name.indexOf(query) >= 0) ? '' : 'none';
		});

		tool.$('.Calendars_attendance_group').each(function () {
			var $group = $(this);
			var matched = $('.Calendars_attendance_person', $group)
			.filter(function () {
				return this.style.display !== 'none';
			}).length;
			$('.Calendars_attendance_group_count', $group).text(matched);
			$group.toggleClass(
				'Calendars_attendance_group_hidden',
				!!(query && !matched)
			);
		});
	},

	Q: {
		beforeRemove: function () {
			$(this.element).off('.Calendars_attendance');
		}
	}
});

})(Q, Q.jQuery, window);
