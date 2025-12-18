/**
 * Calendars plugin's front end code
 *
 * @module Calendars
 * @class Calendars
 */
"use strict";
/* jshint -W014 */
(function(Q, $) {

var Places = Q.Places;
var Calendars = Q.Calendars = Q.plugins.Calendars = {};

Calendars.Event = {
	weekdays: [
		'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'
	],
	/**
	 * Add/delete events to/from native calendar.
	 * @method handleCalendar
	 * @static
	 * @param {String} publisherId Event stream publisher id
	 * @param {String} eventId Last part of event stream name (Calendars/event/[eventId])
	 * @param {String} action What need to do (add, delete)
	 */
	handleCalendar: function (publisherId, eventId, action) {
		var validActions = ["add", "delete"];

		if (validActions.indexOf(action) < 0) {
			return console.warn("action can be only " + validActions.join(','));
		}

		var path = ['addToCalendar', 'added', publisherId, eventId];
		var cache = Q.Cache.local('Calendars');
		var added = cache.get(path);

		if ( action === "delete" && !added ) {
			// we don't check when action === 'add',
			// because we always don't know if user really added it
			return;
		}

		// action complete handler
		var onComplete = new Q.Event(function () {
			if (action === "add") {
				cache.set(path, true);
			} else if (action === "delete") {
				cache.remove(path);
			}
		});

		// for web
		if (Q.info.isMobile && !Q.info.isCordova) {
			var src = publisherId + '/' + eventId;
			if (action === 'add') {
				if (Q.info.platform === 'ios') {
					src = src + '/add.ics';
				} else if (Q.info.platform === 'android') {
					src = src + '/add.gcal';
				}
			} else if (action === "delete") {
				if (Q.info.platform === 'ios') {
					src = src + '/delete.ics';
				} else if (Q.info.platform === 'android') {
					src = src + '/delete.gcal';
				}
			}

			// set time zone
			src += '?timeZone=' + Intl.DateTimeFormat().resolvedOptions().timeZone;

			src = Q.url(src);

			if (Q.info.platform === 'ios') {
				var iframe = document.createElement('iframe');
				iframe.setAttribute('src', src);
				iframe.setAttribute("style", "display: none;");
				Q.addEventListener(iframe, 'load', function _Q_formPost_loaded() {
					Q.removeElement(iframe);
				});
				document.body.appendChild(iframe);
				Q.handle(onComplete);
			} else if (Q.info.platform === 'android') {
				Q.handle(onComplete);
				window.location.href = src;
			}

			return;
		}

		var pipe = new Q.Pipe(['deviceready', 'stream'], function (params, subjects) {
			var calendar = params.deviceready[0];
			var onSuccess = params.deviceready[1];
			var onError = params.deviceready[2];
			var stream = subjects.stream;

			var title = stream.fields.title;
			var eventLocation = Q.getObject(["venue"], Places.Location.fromStream(stream));
			var interests = Calendars.Event.getInterests(stream);
			var notes = [];
			for (var i in interests) {
				notes.push(interests[i].title);
			}
			notes = notes.join();

			// start date seconds
			var startDate = parseInt(stream.getAttribute("startTime"));

			if (!startDate) {
				return console.warn("invalid event start time");
			}

			// end date if absent is startDate + 2 hours
			var endDate = parseInt(stream.getAttribute("endTime")) || startDate + 7200;

			// create data object from seconds
			startDate = new Date(startDate * 1000);
			endDate = new Date(endDate * 1000);

			if (action === "add") {
				// silently (on Android < 4 an interactive dialog is shown) add event to calendar
				calendar.createEvent(title, eventLocation, notes, startDate, endDate, function(){
					console.log("Event successfully added to calendar");
				}, onError);
			} else if (action === "delete") {
				calendar.deleteEvent(title, eventLocation, notes, startDate, endDate, function(){
					Q.handle(onComplete);
					console.log("Event successfully removed from calendar");
				}, onError);
			}
		});

		// wait for device ready
		Q.onReady.addOnce(function () {
			// try to get calendar plugin
			var calendar = Q.getObject(['plugins', 'calendar'], window);

			if (!calendar) {
				return console.warn("Calendar plugin not found!");
			}

			var onSuccess = function(message) { console.log("Success: " + JSON.stringify(message)); };
			var onError = function(message) { console.warn("Error: " + message); };

			if (action === "add") {
				// ask user to add event to native calendar
				Q.Text.get('Calendars/content', function (err, text) {
					text = Q.getObject(["event", "addToCalendar", "permissions"], text);

					if (!text) {
						return;
					}

					Q.confirm(text.prompt, function (res) {
						// nevermind what user reply,
						// need to call this event to avoid multiple questions.
						Q.handle(onComplete);

						if (!res){
							return;
						}

						pipe.fill('deviceready').apply(null, [calendar, onSuccess, onError]);
					}, {
						title: text.title,
						ok: text.yes,
						cancel: text.no
					});
				});

				return;
			}

			pipe.fill('deviceready').apply(null, [calendar, onSuccess, onError]);
		}, 'Calendars');

		// load event stream
		Q.Streams.get(publisherId, 'Calendars/event/' + eventId, pipe.fill('stream'));
	},
	/**
	 * add event to native calendar
	 * @method addToCalendar
	 * @static
	 * @param {String} publisherId Event stream publisher id
	 * @param {String} eventId Last part of event stream name (Calendars/event/[eventId])
	 */
	addToCalendar: function (publisherId, eventId) {
		this.handleCalendar(publisherId, eventId, "add");
	},
	/**
	 * remove event from native calendar
	 * @method removeFromCalendar
	 * @static
	 * @param {String} publisherId Event stream publisher id
	 * @param {String} eventId Last part of event stream name (Calendars/event/[eventId])
	 */
	removeFromCalendar: function (publisherId, eventId) {
		this.handleCalendar(publisherId, eventId, "delete");
	},
	/**
	 * Find Streams/participants tool inside tool and update avatars with badges
	 * @method updateParticipants
	 * @static
	 * @param {object} params
	 * @param {object} params.tool Tool parent for participants tool
	 * @param {String} params.userId
	 * @param {String} params.type
	 */
	updateParticipants: function(params){
		params = params || {};
		var userId = params.userId
		if (!userId) {
			return console.warn('Calendars.Event.updateParticipants: userId undefined');
		}

		var tool = params.tool;
		if (!tool) {
			return console.warn('Calendars.Event.updateParticipants: parent tool undefined');
		}

		var participantsTool = Q.Tool.from($(".Streams_participants_tool", tool.element));

		if (!participantsTool) {
			return console.warn('Calendars.Event.updateParticipants: participants tool not found');
		}

		var avatars = participantsTool.children("Users/avatar");

		Q.each(avatars, function(index, avatarTool){
			var avatarUserId = avatarTool.state.userId;

			// if avatar tool is empty - exit
			if(Q.isEmpty(avatarUserId) || avatarUserId !== userId){
				return;
			}

			switch (params.type) {
				case 'checkin':
					$(avatarTool.element).attr({"data-checkin": true});
					break;
				case 'rejected':
				case 'requested':
				case 'attendee':
				case 'paid':
					$(avatarTool.element).attr({"data-role": params.type});
					break;
				case 'staff':
					$(avatarTool.element).attr({"data-staff": true}).tool('Q/badge', {
						tr: {
							size: "16px",
							top: "0px",
							right: "0px",
							className: "Calendars_event_staff",
							display: 'block',
							content: '<i class="qp-communities-owner"></i>'
						}
					}).activate();
					break;
				case 'speaker':
					$(avatarTool.element).attr({"data-speaker": true}).tool('Q/badge', {
						tr: {
							size: "16px",
							top: "0px",
							right: "0px",
							className: "Calendars_event_speaker",
							display: 'block',
							content: '<i class="qp-calendars-mic"></i>'
						},
						skipOverlapped: true
					}).activate();
					break;
				case 'leader':
				case 'host':
					$(avatarTool.element).attr("data-" + params.type, true).tool('Q/badge', {
						tr: {
							size: "16px",
							top: "0px",
							right: "0px",
							className: "Calendars_event_" + params.type,
							display: 'block',
							content: '<i class="qp-calendars-mic"></i>'
						},
						skipOverlapped: true
					}).activate();
					break;
				default:
					// maybe someone else will handle it
					break;
			}
		});
	},
	/**
	 * Get interests from event (for back compatibility)
	 * @method getInterests
	 * @static
	 * @param {Streams_Stream} eventStream
	 */
	getInterests: function(eventStream){
		return JSON.parse(eventStream.fields.interests || null) || eventStream.getAttribute('interests');
	},
	onStarted: new Q.Event.factory(null, ["", ""]),
	onEnded: new Q.Event.factory(null, ["", ""])
};
Q.Streams.define('Calendars/event', function (fields) {
	var eventStream = this;

	// include extended fields to stream
	if (fields) {
		for (var k in fields) {
			if (k in eventStream.fields) {
				continue;
			}

			eventStream.fields[k] = Q.copy(fields[k]);
		}
	}

	eventStream.onStarted = Calendars.Event.onStarted(
		eventStream.fields.publisherId, eventStream.fields.name
	);
	eventStream.onEnded = Calendars.Event.onEnded(
		eventStream.fields.publisherId, eventStream.fields.name
	);

	var startTime = (parseInt(this.getAttribute('startTime')) || 0) * 1000;
	var endTime = (parseInt(this.getAttribute('endTime')) || 0) * 1000;
	var timeToStart = startTime - Date.now();
	var timeToEnd = endTime - Date.now();

	if (timeToStart > 0) {
		setTimeout(function () {
			Q.handle(eventStream.onStarted, this);
		}, timeToStart);
	} else {
		Q.handle(eventStream.onStarted, this);
	}

	if (timeToEnd > 0) {
		setTimeout(function () {
			Q.handle(eventStream.onEnded, this);
		}, timeToEnd);
	} else {
		Q.handle(eventStream.onEnded, this);
	}
});

Calendars.Recurring = {
	/**
	 * Send request to change participant extra of current user
	 * @method setRecurring
	 * @static
	 * @param {Streams.Stream} stream
	 * @param {Object} recurring Contain info recurring info
	 * @param {String} [recurring.action="settings"] Can be "settings" - update just user participant, and "admin" - update whole recurring category.
	 * @param {String} [recurring.period]
	 * @param {String} [recurring.days] Array of recurring days (["Mon", "Tue", ...])
	 * @param {String} [recurring.relatedParticipants] Array of related participants in format [{publisherId: ..., streamName: ...}]. Thes streams will be related to future recurring streams.
	 * @param {Function} [callback]
	 */
	setRecurring: function (stream, recurring, callback) {
		// if relatedParticipants defined as empty array, pass to server string "empty" because we can't send empty array
		if (Q.isArrayLike(recurring.relatedParticipants) && Q.isEmpty(recurring.relatedParticipants)) {
			recurring.relatedParticipants = "empty";
		}

		// same with days
		if (Q.isArrayLike(recurring.days) && Q.isEmpty(recurring.days)) {
			recurring.days = "empty";
		}

		Q.req('Calendars/recurring', ['participant'], function (err, data) {
			var msg = Q.firstErrorMessage(
				err, data && data.errors
			);
			if (msg) {
				Q.handle(callback, null, [msg]);
				return console.warn(msg);
			}

			Q.handle(callback);
		}, {
			method: 'put',
			fields: {
				publisherId: stream.fields.publisherId,
				streamName: stream.fields.name,
				action: recurring.action || "settings",
				recurringInfo: {
					period : recurring.period || null,
					days: JSON.stringify(recurring.days || null),
					startDate: recurring.startDate,
					endDate: recurring.endDate,
					relatedParticipants: JSON.stringify(recurring.relatedParticipants || null)
				}
			}
		});
	},
	/**
	 * Get recurring category stream
	 * @method getRecurringCategory
	 * @static
	 * @param {Streams.Stream} stream
	 * @param {Function} callback
	 */
	getRecurringCategory: function (stream, callback) {
		if(!stream) {
			return;
		}

		Q.Streams.related.force(stream.fields.publisherId, stream.fields.name, "Calendars/recurring", false, {
			withParticipant: false,
			limit: 1
		}, function (err, response) {
			var msg = Q.firstErrorMessage(err, response && response.errors, this && this.errors);
			if (msg) {
				console.warn("Calendars.getRecurringData: " + msg);
				return false;
			}

			var related = this;

			// get first related stream
			for (var first in related.relatedStreams) {  break; }
			var recurringStream = first && related.relatedStreams[first];

			// execute callback with stream as context
			Q.handle(callback, recurringStream);
		});
	},
	/**
	 * Get availability category stream
	 * @method getAvailabilityCategory
	 * @static
	 * @param {Streams.Stream} stream
	 * @param {Function} callback
	 */
	getAvailabilityCategory: function (stream, callback) {
		if(!stream) {
			return;
		}

		Q.Streams.related.force(stream.fields.publisherId, stream.fields.name, "Calendars/event", false, {
			prefix: "Calendars/availability/",
			withParticipant: false,
			limit: 1
		}, function (err, response) {
			var msg = Q.firstErrorMessage(err, response && response.errors, this && this.errors);
			if (msg) {
				console.warn("Calendars.getRecurringData: " + msg);
				return false;
			}

			var related = this;

			// get first related stream
			for (var first in related.relatedStreams) {  break; }
			var availabilityStream = first && related.relatedStreams[first];

			// execute callback with stream as context
			Q.handle(callback, availabilityStream);
		});
	},
	/**
	 * Get participant extra of current user
	 * @method getRecurringData
	 * @static
	 * @param {Streams.Stream} stream
	 * @param {Function} callback
	 */
	getRecurringData: function (stream, callback) {
		Calendars.Recurring.getRecurringCategory(stream, function(){
			if (!Q.Streams.isStream(this)) {
				return;
			}

			var recurringStream = this;
			var data = {};
			data.eventRecurring = recurringStream.getAllAttributes();

			Q.Streams.Participant.get.force(
				recurringStream.fields.publisherId,
				recurringStream.fields.name,
				Q.Users.loggedInUser.id,
				function (err, participant) {
					var msg = Q.firstErrorMessage(err);
					if (msg) {
						console.warn("Calendars.getRecurringData: " + msg);
						return;
					}

					data.userRecurring = participant && participant.getAllExtras() || {};

					Q.handle(callback, recurringStream, [data]);
				}
			);
		});
	},
	/**
	 * Open dialog with calendar to select days.
	 * @method dialog
	 * @static
	 * @param {String} options.period "weekly" or "monthly"
	 * @param {Array} options.days Array of days (['Sun', 'Mon', ...] or [1, 2, ...])
	 * @param {String} options.action Can be "settings" (edit mode) or "view".
	 * @param {Function} options.callback Callback execute after dialog close
	 * @param {Array} options.possibleDays Array with possible to select days. If empty - all days possible.
	 * @param {boolean} options.justonce Whether to show the "just once" option
	 * @param {Array} options.possibleTimeSlots Array with possible time slots. If empty - whole day selected.
	 * @param {Array} options.timeSlots Array with time slots selected by default.
	 */
	dialog: function (options) {
		var fields = Q.extend({}, Calendars.Recurring.dialog.options, options);
		var action = options.action || 'settings';
		var recurringState = fields.justonce ? "justonce" : "recurring";
		var searchForArray = function (haystack, needle) {
			if (!Q.isArrayLike(haystack) || !Q.isArrayLike(needle)) {
				return false;
			}

			var i, j, current;
			for(i = 0; i < haystack.length; ++i){
				if(needle.length === haystack[i].length){
					current = haystack[i];
					for(j = 0; j < needle.length && needle[j] === current[j]; ++j);
					if(j === needle.length)
						return i;
				}
			}
			return false;
		}

		var pipe = new Q.Pipe(["pickadateStyle", "pickadateScripts", "text"], function (params) {
			var text = params.text[0];
			var dialogText = text.recurring.dialog;
			var $dialog = null;
			var $startDate = $("<input placeholder='" + dialogText.startDate + "' value='" + (options.startDate || "") + "'>");
			var $endDate = $("<input placeholder='" + dialogText.endDate + "' value='" + (options.endDate || "") + "'>");

			Q.Dialogs.push({
				title: text.event.composer.RecurringTitle,
				className: 'Calendars_recurring_dialog Calendars_recurring_dialog_' + action,
				apply: action !== 'view',
				content: (function(){
					$startDate.add($endDate).pickadate({
						showMonthsShort: true,
						format: 'mmm d, yyyy',
						formatSubmit: 'yyyy/mm/dd',
						hiddenName: true,
						min: new Date(),
						container: 'body',
						onOpen: function () {
							this.$root.css("z-index", parseInt($dialog.css("z-index") || 1) + 1);
						}
					});

					var $controls = $("<div class='Calendars_recurring_dialog_controls'>");
					var $justonce = $("<div data-value='justonce'>")
						.html(dialogText.justOnce)
						.appendTo($controls);
					var	$recurring = $("<div data-value='recurring'>")
						.html(dialogText.recurring)
						.appendTo($controls);

					if (!Q.isEmpty(fields.possibleDays) && !Q.isEmpty(fields.days)) {
						recurringState = "recurring";
						$recurring.addClass("Q_selected");
					} else {
						recurringState = "justonce";
						$justonce.addClass("Q_selected");
					}

					var $daysBox = $("<div class='Calendars_recurring_dialog_days'>");
					if (fields.period === "weekly") {
						Q.each(text.weekdaysLong, function (weekDay, weekDayLong) {
							var $day = $("<div>").attr("data-day", weekDay).html("<div class='Calendars_recurring_dialog_dayName'>" + weekDayLong + "</div>");
							$day.on(Q.Pointer.fastclick, function () {
								if (!$day.hasClass("Q_disabled")) {
									$day.toggleClass('Q_selected');
								}

								return false;
							});

							var classes = [];
							if(fields.possibleDays && !fields.possibleDays[weekDay]){
								classes.push('Q_disabled');
							} else if(fields.days && fields.days[weekDay]) {
								classes.push('Q_selected');
							}

							// for enabled days collect time slots (if exists)
							if (!classes.includes("Q_disabled")) {
								Q.each(fields.possibleDays[weekDay], function (i, possibleTimeSlot) {
									// disable $day click event because now it controls from timeSlots
									$day.off(Q.Pointer.fastclick);

									var $timeSlot = $("<div>").attr("data-timeSlot", possibleTimeSlot).html(possibleTimeSlot.join(" - "));
									$timeSlot.on(Q.Pointer.fastclick, function () {
										if ($timeSlot.hasClass("Q_selected")) {
											$timeSlot.removeClass("Q_selected");
											if (!$("[data-timeSlot].Q_selected", $day).length) {
												$day.removeClass("Q_selected");
											}
										} else {
											$timeSlot.addClass("Q_selected");
											$day.addClass("Q_selected");
										}
									});

									var classes = [];
									if (searchForArray(fields.days[weekDay], possibleTimeSlot) !== false) {
										classes.push('Q_selected');
									}

									$timeSlot.attr("class", classes.join(' '));
									$day.append($timeSlot);
								});
							}

							$day.attr("class", classes.join(' '));

							$daysBox.append($day);

						});
					}

					return $controls.add($startDate).add($endDate).add($daysBox);
				})(),
				destroyOnClose: true,
				onActivate: function (dialog) {
					$dialog = $(dialog);
					$dialog.attr("data-recurringState", recurringState);

					// controls click event
					$(".Calendars_recurring_dialog_controls > div", dialog).on(Q.Pointer.fastclick, function () {
						var $this = $(this);
						var value = $this.attr("data-value");

						$this.addClass("Q_selected").siblings().removeClass("Q_selected");

						if (value === "justonce") {
							recurringState = "justonce";
						} else {
							recurringState = "recurring";
						}
						$dialog.attr("data-recurringState", recurringState);
					});
				},
				onClose: function (dialog) {
					if (action === "view") {
						return;
					}

					var days = {};

					if (recurringState === "recurring") {
						$(".Q_selected[data-day]", dialog).each(function () {
							var $day = $(this);
							var day = $day.attr('data-day');
							days[day] = [];

							$(".Q_selected[data-timeSlot]", $day).each(function () {
								days[day].push($(this).attr('data-timeslot').split(","));
							});
						});
					}

					var startDate = $startDate.pickadate().pickadate("picker").get();
					var endDate = $endDate.pickadate().pickadate("picker").get();
					Q.handle(options.callback, days, [days, startDate, endDate]);
				}
			});
		});

		Q.addStylesheet([
			'{{Q}}/pickadate/themes/default.css',
			'{{Q}}/pickadate/themes/default.date.css'
		], pipe.fill("pickadateStyle"));
		Q.addScript([
			'{{Q}}/pickadate/picker.js',
			'{{Q}}/pickadate/picker.date.js'
		], pipe.fill("pickadateScripts"));
		Q.Text.get('Calendars/content', function (err, text) {
			pipe.fill("text")(text);
		});
	}
};

Q.Text.get('Calendars/content', function (err, text) {
	Q.text.Calendars = text;
});

Calendars.Recurring.dialog.options = {
	period: "weekly",
	days: [],
	possibleDays: [],
	possibleTimeSlots: [],
	timeSlots: [],
	justonce: true
};

Calendars.Payment = {

};

Q.Streams.Tool.highlightPreviews('Calendars/event');

// listen for Calendars/payment/skip message to show notice that user no need to pay
Q.Streams.onMessage('', 'Calendars/payment/skip')
.set(function (message) {
	// skip messages older than 24 hours
	var timeDiff = Math.abs((new Date(message.sentTime).getTime() - new Date().getTime()))/1000;
	if (timeDiff >= parseInt(Q.Streams.notifications.notices.expired)) {
		return;
	}

	var reason = message.getInstruction('reason');

	Q.Text.get('Calendars/content', function (err, text) {
		var content = text.event.tool[reason === "publisher" ? "PublisherDontPay" : "AdminDontPay"];
		Q.Notices.add({
			content: content,
			timeout: 5
		});
	});
}, 'Calendars.notifications.notice');

Q.Text.addFor(
	['Q.Tool.define', 'Q.Template.set'],
	'Calendars/', ["Calendars/content"]
);
Q.Tool.define({
	"Calendars/event": {
		js: "{{Calendars}}/js/tools/event.js",
		css: "{{Calendars}}/css/event.css"
	},
	"Calendars/event/preview": {
		js: "{{Calendars}}/js/tools/event/preview.js",
		css: "{{Calendars}}/css/eventPreview.css",
		placeholder: {
			html: "<div style='position: relative; height: 200px' class='Q_placeholder_shimmer'><div style='position: absolute; top: 10px; left: 10px; width: 70%; height: 20px;'></div><div style='position: absolute; top: 50px; left: 10px; width: 50%; height: 20px;'></div></div>"
		}
	},
	"Calendars/event/composer": {
		js: "{{Calendars}}/js/tools/event/composer.js",
		css: [
			'{{Calendars}}/css/composer.css',
			'{{Q}}/pickadate/themes/default.css',
			'{{Q}}/pickadate/themes/default.date.css'
		]
	},
	"Calendars/recurring": "{{Calendars}}/js/tools/recurring.js",
	"Calendars/payment": "{{Calendars}}/js/tools/payment.js",
	"Calendars/timeslots": "{{Calendars}}/js/tools/timeslots.js",
	"Calendars/import": {
		js: "{{Calendars}}/js/tools/import.js",
		css: "{{Calendars}}/css/import.css"
	},
	"Calendars/availabilities": "{{Calendars}}/js/tools/availabilities.js",
	"Calendars/service/browser": "{{Calendars}}/js/tools/service/browser.js",
	"Calendars/availability/preview": "{{Calendars}}/js/tools/availability/preview.js",
	"Calendars/ics/subscribe": "{{Calendars}}/js/tools/ics/subscribe.js"
});

Q.Template.set('Calendars/templates/event/tool', undefined, {
	type: 'handlebars',
	text: ['Calendars/content']
});

// NOTE: We are inserting arbitrary HTML from user names,
// but it's escaped by avatar.prototype.displayName()
Q.Template.set('Calendars/event/hosts/avatar/contents', 
	'<{{tag}} class="Users_avatar_name Calendars_event_hosted">'
		+ '<span class="Calendars_event_hostedBy">'
			+ '{{{interpolate event.tool.HostedBy name=name}}}'
		+ '</span>'
	+ '</{{tag}}>',
	{
		type: 'handlebars',
		text: ['Calendars/content']
	}
);

})(Q, Q.jQuery);
