/**
 * Calendars/event tool.
 * Renders interface for an event — going, participants, payment,
 * time, location, interests, and admin controls.
 *
 * Media concerns (teleconference, livestream) are delegated to
 * child tools in the Media plugin: Media/webrtc/event and
 * Media/livestream/event.
 *
 * @module Calendars-event
 * @class Calendars/event
 */
(function (Q, $, window, undefined) {

var Users = Q.Users;
var Streams = Q.Streams;
var Calendars = Q.Calendars;
var Places = Q.Places;

Q.Tool.define("Calendars/event", function (options) {
	var tool = this;
	var state = tool.state;
	var userId = Users.loggedInUserId();

	tool.modePrepayment = Q.getObject("Event.mode.prepayment", Calendars);

	state.publisherId = state.publisherId
		|| Q.getObject("stream.publisherId", state)
		|| Q.getObject("stream.fields.publisherId", state);
	state.streamName = state.streamName
		|| Q.getObject("stream.name", state)
		|| Q.getObject("stream.fields.name", state);

	Q.Assets.Payments.load();

	if (tool.modePrepayment) {
		tool.element.setAttribute("data-modePrepayment", tool.modePrepayment);
	}
	tool.element.setAttribute("data-mode", state.mode);

	tool.avatarsToRefresh = [];
	tool.closeEventConfirm = tool.text.event.tool.CloseEvent.confirm;

	var pipe = new Q.Pipe(['appTexts'], tool.refresh.bind(tool));

	Q.Text.get(Users.communityId + '/content', function (err, content) {
		var msg = Q.firstErrorMessage(err, content);
		if (msg) {
			return console.error(msg);
		}
		tool.appText = content;
		tool.appTextRelatedParticipants = Q.getObject(
			"assets.service.relatedParticipants", tool.appText
		);
		pipe.fill('appTexts')();
	});

	Streams.Stream.onMessage(
		state.publisherId, state.streamName, 'Streams/changed'
	).set(function (message) {
		var instructions = JSON.parse(message.instructions);
		var newTitle = Q.getObject(["changes", "title"], instructions);
		if (newTitle) {
			Q.handle(state.onTitleChanged, tool, [newTitle]);
		}
	}, tool);

	Q.each(['yes', 'no', 'maybe'], function (i, going) {
		Streams.Stream.onMessage(
			state.publisherId, state.streamName, 'Calendars/going/' + going
		).set(function (message) {
			if (message.byUserId !== userId) {
				return;
			}
			var instructions = JSON.parse(message.instructions);
			tool.stream.participant = new Streams.Participant(instructions.participant);
			tool.refreshParticipants({ participant: instructions.participant });
			tool.updateInterface(going);
		}, tool);
	});

	Streams.Stream.onMessage(
		state.publisherId, state.streamName, 'Calendars/event/webrtc/started'
	).set(function (message) {
		tool._setWebrtcActive(true);
	}, tool);

	Streams.Stream.onMessage(
		state.publisherId, state.streamName, 'Calendars/event/webrtc/ended'
	).set(function (message) {
		tool._setWebrtcActive(false);
	}, tool);

	Streams.Stream.onMessage(
		state.publisherId, state.streamName, 'Streams/participant/extraUpdated'
	).set(function (message) {
		var instructions = JSON.parse(message.instructions);
		tool.refreshParticipants({ participant: instructions.participant });
	}, tool);
},

{
	publisherId: null,
	streamName: null,
	show: {
		hosts: true,
		going: true,
		participants: false,
		promote: false,
		moreInfo: false,
		registration: false,
		checkin: false,
		myqr: false,
		closeEvent: false,
		adminRecurring: false,
		trips: false,
		presentation: false,
		chat: false,
		time: true,
		reminders: false,
		location: true,
		interests: true,
		eventType: false,
		openTo: true,
		teleconference: false,
		webrtc: false,
		livestream: false
	},
	mode: Q.getObject("Communities.event.mode", Q) || "classic",
	autoStartWebrtc: true,
	eventRecurring: null,
	hideParticipants: false,
	relatedParticipants: {
		currency: 'credits',
		showMath: true
	},
	skipClickable: [
		".Travel_aspect_trips",
		".Streams_aspect_relatedParticipants",
		".Q_aspect_when",
		".Streams_aspect_interests"
	],
	onRefresh: new Q.Event(),
	onGoing: new Q.Event(),
	onTitleChanged: new Q.Event(),
	onInvoke: Q.Event.factory(),
	onPaid: new Q.Event()
},

{
	refresh: function () {
		var tool = this;
		var $te = $(tool.element);
		var state = tool.state;
		var userId = Users.loggedInUserId();

		Streams.retainWith(tool).get(
			state.publisherId, state.streamName,
			function (err, eventStream, extra) {
				var stream = tool.stream = this;

				var paymentType = Q.getObject("type", stream.getAttribute('payment'));
				var startTime = parseInt(stream.getAttribute('startTime'));
				var endTime = parseInt(stream.getAttribute('endTime'));

				stream.onStarted.add(function () {
					$te.addClass("Calendars_event_started Calendars_event_happening");
				}, tool);
				stream.onEnded.add(function () {
					$te.removeClass("Calendars_event_happening")
						.addClass("Calendars_event_ended");
				}, tool);

				tool.participants = Q.getObject("participants", extra) || [];

				var participantsOrdering = [];
				Q.each(tool.participants, function (userId, participant) {
					if (participant.testRoles(['leader', 'speaker', 'host', 'staff'])) {
						participantsOrdering.push(userId);
					}
				});

				$te.attr('data-payment', paymentType || '');

				if (!Streams.isStream(stream)
				|| !!Q.getObject(["fields", "closedTime"], stream)) {
					Q.alert(tool.text.event.EventAlreadyClosed);
					tool.remove();
					return;
				}

				var isAdmin = state.isAdmin = stream.testWriteLevel('close');
				var isScreener = state.isScreener = stream.participant
					&& stream.participant.testRoles('screener');
				if (isAdmin) {
					$te.attr("data-admin", true).attr("data-screener", true);
				}
				if (isScreener) {
					$te.attr("data-screener", true);
				}

				stream.onAttribute('state').set(function (attributes, k) {
					if (attributes[k] !== "closed") {
						return;
					}
					Q.handle(state.onInvoke("close"), tool, [stream]);
					if (tool && !tool.removed) {
						Q.Tool.remove(tool.element);
					}
				}, tool);

				tool.setShow();

				state.relatedParticipants.participants = Q.extend(
					{}, Q.getObject("Assets.service.relatedParticipants", Q)
				);

				var location = JSON.parse(stream.fields.location || null)
					|| Places.Location.fromStream(stream);
				var venue = location.venue;
				var address = location.address;
				if (Q.typeOf(venue) === 'string'
				&& Q.typeOf(address) === 'string'
				&& venue.length > 0 && address.includes(venue)) {
					state.venueRedundant = true;
				}

				var interests = Calendars.Event.getInterests(stream);
				var interestTitle = [];
				for (var i in interests) {
					interestTitle.push(interests[i].title);
				}

				var labelTitles = stream.getAttribute('labelTitles');
				labelTitles = labelTitles && labelTitles.join(', ');

				var fields = Q.extend({}, state, {
					interestTitles: interestTitle,
					location: location,
					stream: stream,
					startTime: startTime,
					endTime: endTime,
					icon: state.icon || stream.iconUrl('1000x'),
					peopleMin: stream.getAttribute('peopleMin')
						|| Q.getObject("Event.defaults.peopleMin", Calendars) || 0,
					peopleMax: stream.getAttribute('peopleMax')
						|| Q.getObject("Event.defaults.peopleMax", Calendars) || 100,
					labelTitles: labelTitles,
					relatedParticipants: state.relatedParticipants.participants,
					authorizedToEdit: stream.testWriteLevel('edit'),
					text: tool.text,
					icons: tool.icons,
					hasTeleconference: !!state.teleconference,
					hasLivestream: !!stream.getAttribute('livestream')
				});

				Q.Template.render('Calendars/event/tool', fields, function (err, html) {
					if (err) {
						return;
					}
					Q.replace(tool.element, html);

					tool._setupParticipants(fields, participantsOrdering);
					tool._setupEndTime(startTime, endTime);
					tool.getPaymentInfo();
					tool.$goingElement = tool.$(".Calendars_going_prompt .Calendars_going");

					setTimeout(function () {
						Q.activate(tool.element, function () {
							tool._afterActivate(stream, eventStream);
						});
					}, 0);
				}, { tool: tool });
			},
			{
				withParticipant: true,
				fields: ['subscriptionRules', 'subscriptionRules'],
				participants: 100,
				withRelatedFromTotals: ['Calendars/recurring']
			}
		);
	},

	_afterActivate: function (stream, eventStream) {
		var tool = this;
		var state = tool.state;
		var userId = Users.loggedInUserId();

		tool.participantsTool = tool.child('Streams_participants');
		if (tool.participantsTool) {
			tool.participantsTool.Q.onStateChanged('count').add(function () {
				var el = tool.participantsTool.element;
				if (state.hideParticipants === false
				|| this.state.count > (parseInt(state.hideParticipants) || 0)
				|| stream.getAttribute("userId") === userId) {
					el.style.display = 'flex';
				} else {
					el.style.display = 'none';
				}
			});
		}

		tool.$('.Calendars_going span').on(Q.Pointer.end, function () {
			var $this = $(this);
			if (Q.Pointer.canceledClick || $this.hasClass('Q_selected')) {
				return;
			}
			tool.going($this.attr('data-going'));
		});

		var $unseen = tool.$('.Streams_aspect_chats .Calendars_info_unseen');
		if ($unseen.length) {
			Q.Streams.Message.Total.setUpElement(
				$unseen[0],
				state.publisherId, state.streamName,
				'Streams/chat/message', tool
			);
			setTimeout(function () {
				$unseen.removeAttr('data-state');
			}, 1000);
		}

		if (userId) {
			stream.getParticipant(userId, function (err, participant) {
				var msg = Q.firstErrorMessage(err);
				if (msg) {
					console.warn(msg);
					tool.updateInterface('no', true);
				} else {
					tool.updateInterface(
						participant && participant.getExtra('going'), true
					);
				}
			});
		} else {
			tool.updateInterface('no', true);
		}

		tool.$('.Calendars_info .Q_button').on('click.Calendars_event', function () {
			var $this = $(this);
			var aspect = $this.attr('data-invoke');

			if (aspect === 'checkin') {
				return tool._handleCheckin();
			}

			Q.handle(state.onInvoke(aspect), tool, [stream, $this]);
		});

		if (state.show.eventType) {
			var eventType = stream.getAttribute("eventType");
			eventType = Q.getObject(
				['communities', 'events', 'types', eventType], tool.text
			) || eventType;
			tool.$(".Calendars_aspect_eventType .Calendars_info_content")
				.html(eventType);
		}

		tool._setupRecurring(eventStream);
		tool._setupCloseEvent();
		tool._setupRelatedParticipants(stream);
		tool._setupReminders();

		var going = new URLSearchParams(window.location.search).get('going');
		if (going) {
			tool.updateInterface(going);
		}

		Q.handle(state.onRefresh, tool);
	},

	_setupParticipants: function (fields, ordering) {
		var tool = this;
		var state = tool.state;
		var $participants = tool.$(".Calendars_event_participants");

		if (!$participants.length || !tool.stream
		|| tool.stream.fields.participatingCount < fields.peopleMin) {
			return;
		}

		$participants[0].forEachTool("Users/avatar", function () {
			if (this.state.userId) {
				tool.refreshParticipants({ avatar: this });
			}
		});

		$participants.tool("Streams/participants", {
			max: state.peopleMax,
			maxShow: Q.getObject("Event.defaults.participants.maxShow", Calendars),
			showSummary: false,
			showControls: true,
			showBlanks: Q.getObject("Event.defaults.participants.showBlanks", Calendars),
			publisherId: state.publisherId,
			streamName: state.streamName,
			ordering: ordering,
			invite: { readLevel: 25 },
			avatar: { icon: '40' }
		});
	},

	refreshParticipants: function (params) {
		var tool = this;
		var state = tool.state;

		var definedAvatar = Q.getObject("avatar", params);
		if (Q.typeOf(definedAvatar) === 'Q.Tool'
		&& definedAvatar.name === "users_avatar"
		&& definedAvatar.state.userId) {
			tool.avatarsToRefresh.push(definedAvatar);
		} else {
			definedAvatar = null;
		}

		var definedParticipant = Q.getObject("participant", params);
		if (definedParticipant) {
			definedParticipant = new Streams.Participant(definedParticipant);
			Q.setObject(
				"participants." + definedParticipant.userId,
				definedParticipant, tool
			);
		} else {
			definedParticipant = null;
		}

		Streams.get(state.publisherId, state.streamName, function (err) {
			if (Q.firstErrorMessage(err)) {
				return;
			}
			Q.handle(state.onRefresh, tool);
		});

		Q.each(tool.participants, function (i, participant) {
			if (participant.state !== 'participating') {
				return;
			}
			if (definedParticipant && definedParticipant.userId !== participant.userId) {
				return;
			}

			Q.each(tool.avatarsToRefresh, function (j, avatar) {
				if (definedAvatar && definedAvatar.id !== avatar.id) {
					return;
				}
				if (avatar.state.userId !== participant.userId) {
					return;
				}
				if (avatar.removed || !avatar.element.isConnected) {
					tool.avatarsToRefresh.splice(j, 1);
					return;
				}

				Calendars.Event.updateParticipants({
					participant: participant,
					avatar: avatar,
					type: tool._getParticipantType(participant)
				});
			});
		});
	},

	_getParticipantType: function (participant) {
		var tool = this;
		var type = [];
		var userId = Users.loggedInUserId();

		var leaderRoles = ['leader', 'host', 'speaker', 'staff'];
		for (var k = 0; k < leaderRoles.length; k++) {
			if (participant.testRoles(leaderRoles[k])) {
				type.push(leaderRoles[k]);
				if (userId && participant.userId === userId) {
					$(tool.element).attr("data-" + leaderRoles[k], true);
				}
				break;
			}
		}

		var attendeeRoles = ['attendee', 'arrived'];
		for (k = 0; k < attendeeRoles.length; k++) {
			if (participant.testRoles(attendeeRoles[k])) {
				type.push(attendeeRoles[k]);
				break;
			}
		}

		var statusRoles = ['rejected', 'requested', 'registered'];
		for (k = 0; k < statusRoles.length; k++) {
			if (participant.testRoles(statusRoles[k])) {
				type.push(statusRoles[k]);
				break;
			}
		}

		if (Q.getObject("type", tool.stream.getAttribute('payment')) === 'required') {
			switch (participant.getExtra('paid')) {
				case 'reserved': type.push('paid-reserved'); break;
				case 'fully':    type.push('paid-fully');    break;
				default:         type.push('paid-no');
			}
		}

		return type;
	},

	_setWebrtcActive: function (active) {
		$(this.element).attr("data-webrtc", active ? "true" : "false");
	},

	eventIsHappening: function () {
		var stream = this.stream;
		var now = Date.now();
		var start = stream.getAttribute('startTime') * 1000;
		var end = stream.getAttribute('endTime') * 1000;
		return start < now && end > now;
	},

	eventEnded: function () {
		return this.stream.getAttribute('endTime') * 1000 < Date.now();
	},

	getGoing: function (userId, callback) {
		Streams.get(this.state.publisherId, this.state.streamName, function (err, stream) {
			if (Q.firstErrorMessage(err)) {
				return;
			}
			stream.getParticipant(userId, function (err, participant) {
				if (Q.firstErrorMessage(err)) {
					return;
				}
				Q.handle(callback, stream, [
					participant && participant.getExtra('going')
				]);
			});
		});
	},

	_setupEndTime: function (startTime, endTime) {
		if (!endTime) {
			return;
		}
		var options = {
			relative: false,
			time: endTime * 1000,
			capitalized: true
		};
		var sameDay = new Date(startTime * 1000).setHours(0, 0, 0, 0)
			=== new Date(endTime * 1000).setHours(0, 0, 0, 0);
		if (sameDay) {
			options.format = "%l:%M %P";
		}
		this.$(".Calendars_event_endTime").tool("Q/timestamp", options);
	},

	teleconferenceState: function () {
		if (this.eventEnded()) {
			return 'ended';
		}
		if (this.eventIsHappening()) {
			return 'happening';
		}
		return 'waiting';
	},

	getPaymentStatus: function () {
		var state = this.state;
		return new Q.Promise(function (resolve, reject) {
			Q.req('Calendars/payment', ['status', 'info'], function (err, response) {
				var msg = Q.firstErrorMessage(err, response && response.errors);
				if (msg) {
					return reject(msg);
				}
				resolve(response);
			}, {
				fields: {
					publisherId: state.publisherId,
					eventId: state.streamName.split('/').pop(),
					clientId: Q.clientId()
				}
			});
		});
	},

	getPaymentInfo: function () {
		var tool = this;
		var state = tool.state;
		var $el = tool.$('.Calendars_payment');
		var payment = tool.stream && tool.stream.getAttribute('payment');
		if (!payment) {
			return Q.Promise.resolve();
		}

		state.payment = {};
		state.payment.content = tool.text.payment.info[payment.type]
			.interpolate(payment);
		state.payment.description = tool.stream.fields.title;

		Q.each(['amount', 'currency', 'type'], function (i, key) {
			state.payment[key] = payment[key];
		});
		state.payment.credits = Q.Assets.Credits.convertToCredits(
			payment.amount, payment.currency
		);

		$el.html(state.payment.content).show();

		if (!Users.loggedInUserId()) {
			return;
		}

		tool.getPaymentStatus().then(function (data) {
			if (!state.payment) {
				return;
			}
			state.payment.isAssetsCustomer = Q.getObject(
				"slots.info.isAssetsCustomer", data
			);
			var status = Q.getObject("slots.status", data);
			if (status) {
				state.payment.content += ' (' + tool.text.payment.info.paid + ')';
				state.payment.date = status.insertedTime;
			}
		}).catch(function (err) {
			console.warn(err);
		}).then(function () {
			$el.html(state.payment.content);
		});
	},

	going: function (going, callback, options) {
		var tool = this;
		var $te = $(tool.element);
		var state = tool.state;
		var userId = Users.loggedInUserId();

		var paymentType = Q.getObject("payment.type", state);
		var paymentAmount = Q.getObject("payment.amount", state);
		var paymentCurrency = Q.getObject("payment.currency", state);


		function revertUI () {
			Q.handle(callback, tool, [false]);
			if (tool.$goingElement) {
				tool.$goingElement.removeClass("Q_working");
			}
		}
		function finalizeUI () {
			tool.updateInterface(going);
			Q.handle(callback, tool, [true]);
		};

		if (!userId) {
			Users.login({
				onSuccess: {
					"Users": function () {
						tool.going(going, callback, options);
					}
				},
				onCancel: function () {
					revertUI();
				}
			});
			return false;
		}

		if ($te.attr("data-going") === going) {
			Q.handle(callback, tool, [false]);
			return false;
		}

		if (tool.$goingElement) {
			tool.$goingElement.addClass("Q_working");
		}

		var isPublisher = (userId === state.publisherId);

		if (going === "no") {
			return tool._saveGoing("no")
				.then(finalizeUI)
				.catch(revertUI);
		}

		if (going === "yes" && tool.modePrepayment
		&& !Q.getObject("payToAttend", options)) {
			if (!tool.stream.getAttribute('payment')
			|| Q.getObject("payment.isAssetsCustomer", state)) {
				return tool.going("maybe", callback, options);
			}
			Q.Assets.Credits.buy({
				amount: 1,
				currency: "USD",
				skipDialog: true,
				reason: 'EventParticipation',
				explanation: "Payment to attend {{title}}".interpolate(tool.stream.fields),
				onSuccess: function () {
					state.payment.isAssetsCustomer = true;
					tool.going("maybe", callback, options);
				},
				onFailure: function () {
					revertUI();
				}
			});
			return;
		}

		if (!tool.checkRelatedParticipants()) {
			tool.addRelatedParticipants({
				callback: function (ok) {
					if (ok) {
						tool.going(going, callback, options);
					} else {
						revertUI();
					}
				}
			});
			return false;
		}

		if (isPublisher || state.isAdmin || !state.payment || going === "maybe") {
			return tool._saveGoing(going)
				.then(finalizeUI)
				.catch(revertUI);
		}

		tool._saveGoing(going)
			.then(finalizeUI)
			.catch(revertUI);

		if (paymentType === "optional") {
			tool._showDonationDialog(paymentAmount, paymentCurrency);
			return;
		}
	},

	_saveGoing: function (targetGoing) {
		var tool = this;
		var state = tool.state;

		return new Q.Promise(function (resolve, reject) {
			Q.req(
				"Calendars/going",
				["stream", "participant", "payment", "paid"],
				function (err, response) {
					var msg = Q.firstErrorMessage(err, response);
					if (msg) {
						Q.alert(msg, { title: "Sorry" });
						return reject(msg);
					}

					Streams.Stream.retainWith(tool).refresh(
						state.publisherId, state.streamName,
						function (err) {
							if (err !== undefined) {
								return;
							}

							var slots = response.slots || {};
							tool.stream = this;

							if (slots.participant) {
								tool.participant = new Streams.Participant(slots.participant);
							}

							var details = slots.payment && slots.payment.details;
							if (details && details.intent && details.intent.instructions) {
								tool._handleStripeIntent(details, targetGoing, resolve, reject);
								return;
							}

							if (slots.paid) {
								Q.handle(state.onPaid, tool, [slots.payment]);
							}

							resolve(response);
						},
						{
							getOptions: {
								withParticipant: true
							},
							messages: true,
							unlessSocket: true
						}
					);
				},
				{
					method: "post",
					fields: {
						publisherId: state.publisherId,
						eventId: state.streamName.split("/").pop(),
						going: targetGoing,
						clientId: Q.clientId()
					}
				}
			);
		});
	},

	_handleStripeIntent: function (details, targetGoing, resolve, reject) {
		var tool = this;
		var state = tool.state;
		var instructions = details.intent.instructions;

		Q.Assets.Credits.buy({
			intentToken: details.intentToken,
			amount: instructions.amount,
			currency: instructions.currency,
			skipDialog: true,
			reason: 'EventParticipation',
			metadata: {
				toPublisherId: instructions.toPublisherId || '',
				toStreamName: instructions.toStreamName || ''
			},
			onSuccess: function () {
				Q.handle(state.onPaid, tool);
				state.payment.isAssetsCustomer = true;
				// tool.going(targetGoing);
				resolve(targetGoing);
			},
			onFailure: function (err) {
				if (tool.$goingElement) {
					tool.$goingElement.removeClass("Q_working");
				}
				reject(err || "payment_failed");
			}
		});
	},

	_showDonationDialog: function (amount, currency) {
		var tool = this;
		var state = tool.state;
		var cacheKey = Q.Cache.key([
			state.publisherId, state.streamName, "donation"
		].join("."));
		var cache = Q.Cache.session(cacheKey);

		if (cache.get(cacheKey)) {
			return;
		}

		Q.Template.render("Calendars/event/payment", {
			content: tool.text.payment.confirmationDialog.content.interpolate({
				amount: amount + " " + currency
			}),
			button: tool.text.payment.confirmationDialog.button + " "
		}, function (err, html) {
			if (err) {
				return;
			}
			Q.Dialogs.push({
				className: "Q_dialog_audio",
				title: tool.text.payment.confirmationDialog.title,
				content: html,
				destroyOnClose: true,
				onActivate: function (dialog) {
					$(".Payment-confirmation-button", dialog)
						.on(Q.Pointer.fastclick, function () {
							Q.Dialogs.pop();
							state.payment.isAssetsCustomer = true;
							Q.handle(state.onPaid, tool);
							return false;
						});
				},
				onClose: function () {
					cache.set(cacheKey, 1, true);
				}
			});
		});
	},

	setShow: function () {
		var tool = this;
		var state = tool.state;
		var stream = tool.stream;

		state.show.eventType = !!stream.getAttribute("eventType");
		state.show.going = parseInt(stream.getAttribute('startTime')) * 1000 > Date.now();

		if (state.isAdmin || state.isScreener) {
			state.show.checkin = true;
		}
		if (state.isAdmin) {
			state.show.editWebrtc = true;
			state.show.closeEvent = true;
			if (Q.getObject(["relatedFromTotals", 'Calendars/recurring'], stream)) {
				state.show.adminRecurring = true;
			}
		} else {
			state.show.myqr = !!(stream.participant
				&& stream.participant.getExtra('going') !== 'no');
		}

		state.show.moreInfo = !!stream.getAttribute('eventUrl');
		state.show.registration = !!stream.getAttribute('ticketsUrl');

		if (state.show.participants === false && stream.testReadLevel('participants')) {
			state.show.participants = true;
		} else if (state.show.participants === 'publishers') {
			state.show.participants = state.isAdmin;
		} else {
			state.show.participants = false;
		}

		state.show.chat = stream.testReadLevel('messages');

		if (Q.plugins.Travel
		&& Q.getObject("fields.location", stream)
		&& (stream.testWriteLevel(40) || stream.testPermission('Places/location'))) {
			state.show.location = true;
			state.show.trips = true;
		} else if (!Q.getObject("fields.location", stream)
		|| Q.getObject("event.hideLocationIfNotPaid", Calendars) === true) {
			state.show.location = false;
			state.show.trips = false;
		}

		state.teleconference = stream.getAttribute('teleconference')
			|| stream.getAttribute('livestream');
		if (state.teleconference
		&& (stream.testWriteLevel(40) || stream.testPermission('Media/livestream'))) {
			state.show.teleconference = {
				state: tool.teleconferenceState(),
				remote: !!state.teleconference.matchTypes('url').length
			};
		} else {
			state.show.teleconference = false;
		}

		// webrtc join button — visible to all when event has a teleconference
		state.show.webrtc = !!stream.getAttribute('teleconference');

		// livestream toggle — visible to all when event has a livestream
		state.show.livestream = !!stream.getAttribute('livestream');

		if (stream.participant && stream.participant.testRoles('registered')) {
			state.show.reminders = !Q.isEmpty(Q.getObject("Event.reminders", Calendars));
		} else {
			state.show.reminders = false;
		}

		state.show.presentation = stream.testWriteLevel(40)
			|| stream.testPermission('Media/presentation');

		if (Q.isEmpty(Calendars.Event.getInterests(stream))) {
			state.show.interests = false;
		}
	},

	updateInterface: function (going, duringRefresh) {
		going = going || "no";
		var tool = this;
		var $te = $(tool.element);

		var previousGoing = $te.attr('data-going');
		if (previousGoing === going) {
			return;
		}

		$te.attr('data-going', going);

		tool.$('.Calendars_going [data-going=' + going + ']')
			.addClass('Q_selected')
			.siblings().removeClass('Q_selected');

		if (tool.$goingElement) {
			tool.$goingElement.removeClass("Q_working");
		}

		Q.handle(tool.state.onGoing, tool, [going, tool.stream, tool.participant]);

		if (going === 'no' && !duringRefresh) {
			tool._checkTrips();
		}

		// going changed — show flags may have changed — re-render
		if (!duringRefresh && previousGoing !== undefined) {
			tool.refresh();
		}
	},

	_handleCheckin: function () {
		var tool = this;
		var state = tool.state;

		Calendars.Event.scanEventCheckinQRCodes(tool.stream, function () {
			tool.refreshParticipants({ avatar: this });

			if (!state.isAdmin) {
				return;
			}

			var userId = this.state.userId;
			var className = "Calendars_event_avatar_contextual";

			$(this.element).plugin('Q/contextual', {
				className: className,
				elements: $('<li>'),
				onConstruct: function (contextual) {
					contextual.setAttribute("data-userId", userId);
					Q.Contextual.onShow.set(function ($contextual) {
						if (!$contextual.hasClass(className)
						|| $contextual.attr("data-userId") !== userId) {
							return;
						}
						var $li = $("li", $contextual);
						$li.html('<div class="loading_handleRoles">');
						tool.handleRoles(userId, $li, true);
					});
				}
			});

			this.Q.beforeRemove.set(function () {
				$(this.element).plugin('Q/contextual', 'remove');
			}, 'Calendars_event_avatar_contextual');
		});
	},

	_setupReminders: function () {
		var tool = this;
		var state = tool.state;
		var userId = Users.loggedInUserId();

		tool.$(".Q_aspect_reminders").on(Q.Pointer.fastclick, function () {
			var $this = $(this);
			$this.addClass("Q_working");

			Streams.Participant.get.force(
				state.publisherId, state.streamName, userId,
				function (err, participant) {
					$this.removeClass("Q_working");
					if (Q.firstErrorMessage(err)) {
						return;
					}

					tool.participant = participant;

					var remindersSaved = participant.getExtra('reminders') || null;
					var remindersConfig = {};

					Q.each(Q.getObject("Event.reminders", Calendars), function (key, value) {
						remindersConfig[key] = value;
						var parts = Q.displayDuration(key * 1000, { hours: true })
							.split(":").map(function (n) { return parseInt(n, 10); });

						if (parts[0] === 0) {
							remindersConfig[key].name = parts[1] + " "
								+ tool.text.event.composer.Minutes;
						} else if (parts[1] === 0) {
							remindersConfig[key].name = parts[0] + " "
								+ (parts[0] === 1
									? tool.text.event.composer.Hour
									: tool.text.event.composer.Hours);
						} else {
							remindersConfig[key].name = parts[0] + " "
								+ tool.text.event.composer.Hours + " "
								+ parts[1] + " " + tool.text.event.composer.Minutes;
						}

						if (remindersSaved === null) {
							remindersConfig[key].checked = value.selected ? "checked" : "";
						} else {
							remindersConfig[key].checked =
								(remindersSaved.includes(parseInt(key))
								|| remindersSaved.includes(key.toString()))
									? "checked" : "";
						}
					});

					Q.Dialogs.push({
						title: tool.text.event.tool.SetReminders,
						className: "Calendars_event_reminders",
						template: {
							name: "Calendars/event/reminders",
							fields: {
								text: tool.text.event.tool,
								remindersConfig: remindersConfig
							}
						},
						apply: true,
						onClose: function (dialog) {
							var reminders = [];
							$("input[type=checkbox]", dialog).each(function () {
								if (this.checked) {
									reminders.push($(this).val());
								}
							});
							Q.req("Calendars/reminders", function () {}, {
								method: "post",
								fields: {
									publisherId: state.publisherId,
									eventId: state.streamName.split('/').pop(),
									reminders: reminders
								}
							});
						}
					});
				}
			);
		});
	},

	_setupRecurring: function (eventStream) {
		var tool = this;
		var state = tool.state;

		if (!Q.getObject(["relatedFromTotals", 'Calendars/recurring'], eventStream)) {
			return;
		}

		tool.$(".Calendars_recurring_setting").tool("Calendars/recurring", {
			publisherId: state.publisherId,
			streamName: state.streamName,
			action: "settings",
			onBeforeDialog: function (callback) {
				var recurringTool = this;
				var recurringToolState = this.state;

				Calendars.Recurring.getRecurringData(eventStream, function (data) {
					var userRecurring = Q.getObject("userRecurring", data);
					recurringToolState.period = Q.getObject("eventRecurring.period", data) || [];
					recurringToolState.days = Q.getObject("userRecurring.days", data) || [];
					recurringToolState.startDate = Q.getObject("userRecurring.startDate", data) || [];
					recurringToolState.endDate = Q.getObject("userRecurring.endDate", data) || [];
					recurringToolState.possibleDays = Q.getObject("eventRecurring.days", data) || [];

					state.onGoing.add(function (going) {
						if (going === 'yes' && !userRecurring) {
							Q.handle(recurringTool.openDialog, recurringTool);
						}
					}, tool);

					Q.handle(callback);
				});
			}
		}).activate();

		tool.$(".Calendars_aspect_recurring").tool("Calendars/recurring", {
			publisherId: state.publisherId,
			streamName: state.streamName,
			modToolElement: false,
			action: "admin",
			onBeforeDialog: function (callback) {
				var recurringToolState = this.state;

				Calendars.Recurring.getAvailabilityCategory(eventStream, function (data) {
					if (Streams.isStream(this)) {
						Q.handle(callback, null, [false]);
						return Q.alert(tool.text.event.tool.AvailabilityWarning
							.interpolate({ title: this.fields.title }));
					}

					Calendars.Recurring.getRecurringCategory(eventStream, function (data) {
						if (!Streams.isStream(this)) {
							return;
						}
						var eventRecurring = this.getAllAttributes();
						recurringToolState.period = Q.getObject("period", eventRecurring) || 'weekly';
						recurringToolState.days = Q.getObject("days", eventRecurring) || [];
						recurringToolState.startDate = Q.getObject("startDate", eventRecurring) || [];
						recurringToolState.endDate = Q.getObject("endDate", eventRecurring) || [];
						Q.handle(callback);
					});
				});
			}
		}).activate();
	},

	_setupCloseEvent: function () {
		var tool = this;
		var state = tool.state;

		tool.$(".Calendars_aspect_close").on(Q.Pointer.fastclick, function () {
			var $this = $(this);
			$this.addClass("Q_working");

			Streams.get(
				tool.stream.fields.publisherId,
				tool.stream.fields.name,
				function (err, stream, extra) {
					$this.removeClass("Q_working");
					if (Q.firstErrorMessage(err)) {
						return;
					}

					var participants = 0;
					Q.each(extra && extra.participants, function (userId, participant) {
						if (participant.state !== 'participating'
						|| userId === tool.stream.fields.publisherId) {
							return;
						}
						++participants;
					});

					if (participants) {
						var text = tool.closeEventConfirm.text.Cancel + "<br>";
						text += participants > 1
							? tool.closeEventConfirm.text.Participants
								.interpolate({ count: participants })
							: tool.closeEventConfirm.text.Participant;

						return Q.confirm(text, function (choice) {
							if (choice) {
								tool._closeEvent();
							}
						}, { title: tool.text.event.tool.CloseEvent.button });
					}

					tool._closeEvent();
				},
				{ participants: 1000 }
			);

			return false;
		});
	},

	_closeEvent: function (stopRecurring) {
		var tool = this;
		var state = tool.state;

		Calendars.Event.removeFromCalendar(
			state.publisherId, state.streamName.split('/').pop()
		);

		if (stopRecurring === undefined && !Q.isEmpty(state.eventRecurring)) {
			return Q.confirm(
				tool.closeEventConfirm.text.Recurring,
				function (choice) { tool._closeEvent(choice); },
				{ title: tool.text.event.tool.CloseEvent.button }
			);
		}

		Q.req('Calendars/event', '', function (err, response) {
			var msg = Q.firstErrorMessage(err, response && response.errors);
			if (msg) {
				Q.alert(msg, { title: "Sorry" });
			}
		}, {
			method: 'delete',
			fields: {
				publisherId: tool.stream.fields.publisherId,
				streamName: tool.stream.fields.name,
				stopRecurring: stopRecurring ? 1 : 0
			}
		});
	},

	_setupRelatedParticipants: function (stream) {
		var tool = this;
		var state = tool.state;
		var isAdmin = state.isAdmin;
		var userId = Users.loggedInUserId();

		tool.$(".Streams_aspect_relatedParticipants").each(function () {
			var $this = $(this);
			var streamType = $this.attr('data-streamType');

			$this.on(Q.Pointer.fastclick, tool.addRelatedParticipants.bind(tool));

			$(".Calendars_info_content", $this).tool("Streams/related", {
				stream: stream,
				relationType: streamType,
				editable: false,
				mode: "participant",
				closeable: false,
				realtime: true,
				sortable: false,
				relatedOptions: { withParticipant: false },
				beforeRenderPreview: function (data, element) {
					if (!isAdmin && data.publisherId !== userId) {
						return false;
					}
				},
				onRefresh: function () {
					var TypeDisplayPlural = Q.getObject(
						["appTextRelatedParticipants", streamType, "multiple"], tool
					);
					var className = "Calendars_event_relatedParticipants_empty";
					if ($(".Streams_preview_tool", this.element).length) {
						$("." + className, this.element).remove();
					} else {
						this.element.innerHTML = '<div class="' + className + '">'
							+ tool.text.event.tool.YouHaveNotRegisteredAnyIncluded
								.interpolate({ TypeDisplayPlural: TypeDisplayPlural })
							+ '</div>';
					}
				}
			}).activate(function () {
				state.relatedParticipants.participants[streamType]['relatedTool'] = this;
			});
		});
	},

	checkRelatedParticipants: function (checkStreamType) {
		var tool = this;
		var result = true;

		checkStreamType = checkStreamType
			|| tool.stream.getAttribute("requiredParticipants");
		if (!checkStreamType) {
			return result;
		}
		if (typeof checkStreamType === "string") {
			checkStreamType = [checkStreamType];
		}

		Q.each(tool.state.relatedParticipants.participants, function (streamType, data) {
			if (checkStreamType && !checkStreamType.includes(streamType)) {
				return;
			}
			var relatedTool = Q.getObject("relatedTool", data);
			if (!relatedTool) {
				console.warn(streamType + " relation required, but related tool empty");
				return;
			}
			if (Q.isEmpty(tool.getMyRelations(relatedTool))) {
				result = false;
			}
		});

		return result;
	},

	getMyRelations: function (relatedTool) {
		var userId = Users.loggedInUserId();
		var res = [];
		relatedTool.$(".Streams_preview_tool").each(function () {
			var preview = Q.Tool.from(this, "Streams/preview");
			if (Q.getObject("state.publisherId", preview) === userId) {
				res.push(preview.state);
			}
		});
		return res;
	},

	alreadyRelated: function (relatedTool, publisherId, streamName) {
		var found = false;
		Q.each(this.getMyRelations(relatedTool), function (i, s) {
			if (s.publisherId === publisherId && s.streamName === streamName) {
				found = true;
			}
		});
		return found;
	},

	addRelatedParticipants: function (options) {
		var tool = this;
		var state = tool.state;
		var going = $(tool.element).attr('data-going');
		var toolText = tool.text.event.tool;
		var creditsAmount = Q.getObject("payment.credits", state) || 0;
		var requiredParticipantsList = tool.stream.getAttribute("requiredParticipants");

		Q.each(state.relatedParticipants.participants, function (streamType, data) {
			var relatedTool = Q.getObject("relatedTool", data);
			if (!relatedTool) {
				return console.warn(streamType + " relation required, but related tool empty");
			}

			var categoryPublisherId = data.publisherId || Users.loggedInUserId();
			var categoryStreamName = data.streamName;
			var categoryRelationType = data.relationType;
			var TypeDisplayPlural = Q.getObject(
				[streamType, "multiple"], tool.appTextRelatedParticipants
			);
			var SelectIncludesToAdd = toolText.SelectIncludesToAdd
				.interpolate({ TypeDisplayPlural: TypeDisplayPlural });
			var AddParticipants = Q.getObject(
				[streamType, "add"], tool.appTextRelatedParticipants
			) || toolText.AddParticipants;
			var warning = null;
			if (requiredParticipantsList) {
				warning = toolText.RequiredRelatedParticipants
					.interpolate({ requiredParticipantsList: requiredParticipantsList.join(", ") });
			}

			Q.Dialogs.push({
				title: going === 'yes' ? toolText.ManageReservation : toolText.MakeReservation,
				className: "Calendars_event_relatedParticipants",
				template: {
					name: "Calendars/event/AddParticipants",
					fields: {
						text: tool.text,
						AddParticipants: AddParticipants,
						SelectIncludesToAdd: SelectIncludesToAdd,
						Proceed: going === 'yes' ? toolText.MakeChanges : toolText.Proceed,
						showMath: state.relatedParticipants.showMath,
						warning: warning
					}
				},
				onActivate: function (dialog) {
					tool._activateRelatedParticipantsDialog(
						dialog, going, streamType, relatedTool,
						categoryPublisherId, categoryStreamName,
						categoryRelationType, creditsAmount,
						requiredParticipantsList, options
					);
				},
				onClose: function () {
					Q.handle(options.callback, null, [false]);
				}
			});
		});
	},

	_activateRelatedParticipantsDialog: function (
		dialog, going, streamType, relatedTool,
		categoryPublisherId, categoryStreamName,
		categoryRelationType, creditsAmount,
		requiredParticipantsList, options
	) {
		// Dialog body logic — port from original addRelatedParticipants
		// onActivate callback for full implementation.
	},

	_checkTrips: function () {
		var tool = this;
		var $tripsDiv = tool.$('.Calendars_info > .Travel_aspect_trips');
		var $tripsTool = $tripsDiv.length
			? $(".Travel_trips_tool", $tripsDiv) : null;

		if (!$tripsTool || !$tripsTool.length) {
			return;
		}

		var tripsTool = Q.Tool.from($tripsTool, "Travel/trips");
		if (!tripsTool) {
			return;
		}
		var tripsState = tripsTool.state;
		if (!tripsState.driverTripTo && !tripsState.driverTripFrom) {
			return;
		}

		Q.each([tripsState.driverTripTo, tripsState.driverTripFrom], function (i, tripInfo) {
			if (typeof tripInfo !== 'object' || !tripInfo.publisherId) {
				return;
			}

			var confirmText = tool.closeEventConfirm.trip.Cancel.interpolate({
				tripDirection: tripInfo.type === "Travel/to"
					? tool.closeEventConfirm.directions.TO
					: tool.closeEventConfirm.directions.FROM
			});

			var participants = tripInfo.participants
				? Object.keys(tripInfo.participants) : [];
			var driverIndex = participants.indexOf(tripInfo.publisherId);
			if (driverIndex >= 0) {
				participants.splice(driverIndex, 1);
			}

			if (participants.length) {
				confirmText += " " + tool.closeEventConfirm.trip.Passengers
					.interpolate({ passengerCount: participants.length });
			}

			Q.confirm(confirmText, function (choice) {
				if (choice) {
					Q.plugins.Travel.Trip.discontinue(
						tripInfo.publisherId, tripInfo.streamName
					);
				}
			}, { title: tool.closeEventConfirm.trip.Title });
		});
	},

	handleRoles: function (userId, element, replace) {
		var state = this.state;
		if (!state.isAdmin) {
			return;
		}

		Q.req("Calendars/event", ["roles", "paid"], function (err, response) {
			if (Q.firstErrorMessage(err, response && response.errors)) {
				return;
			}

			var options = {
				roles: ['rejected', 'requested', 'registered']
			};
			if (Q.getObject("payment.type", state) === 'required') {
				options.paymentRequired = true;
				options.paid = ['no', 'refunded', 'reserved', 'fully'];
			}

			Q.Template.render('Calendars/event/roles', options, function (err, html) {
				if (err) {
					return;
				}

				var $html = $(html);

				Q.each(response.slots.roles, function () {
					$("[data-role=" + this + "]", $html).addClass('Q_selected');
				});

				$("[data-role]", $html).on(Q.Pointer.fastclick, function () {
					var $this = $(this);
					$this.addClass('Q_working');
					Q.req("Calendars/event", ["roles"], function (err, response) {
						$this.removeClass('Q_working');
						if (Q.firstErrorMessage(err, response && response.errors)) {
							return;
						}
						if (response.slots.roles) {
							$this.addClass('Q_selected')
								.siblings().removeClass('Q_selected');
						}
					}, {
						method: "PUT",
						fields: {
							publisherId: state.publisherId,
							streamName: state.streamName,
							userId: userId,
							role: $this.attr("data-role")
						}
					});
				});

				$("[data-paid=" + response.slots.paid + "]", $html)
					.addClass('Q_selected');

				$("[data-paid]", $html).on(Q.Pointer.fastclick, function () {
					var $this = $(this);
					$this.addClass('Q_working');
					Q.req("Calendars/event", ["paid"], function (err, response) {
						$this.removeClass('Q_working');
						if (Q.firstErrorMessage(err, response && response.errors)) {
							return;
						}
						if (response.slots.paid) {
							$this.addClass('Q_selected')
								.siblings().removeClass('Q_selected');
						}
					}, {
						method: "PUT",
						fields: {
							publisherId: state.publisherId,
							streamName: state.streamName,
							userId: userId,
							paid: $this.attr("data-paid")
						}
					});
				});

				if (replace) {
					$(element).html($html);
				} else {
					$(element).append($html);
				}
			});
		}, {
			fields: {
				publisherId: state.publisherId,
				streamName: state.streamName,
				userId: userId
			}
		});
	},

	Q: {
		beforeRemove: function () {
			$(this.element).off('.Calendars_event');
		}
	}
});

Q.Template.set('Calendars/event/tool',
	'<div class="Calendars_event_curtain">' +
	'  <div class="Q_tool Streams_preview_tool Streams_image_preview_tool Streams_internal_preview"' +
	'    {{#if icon}} data-icon-src="{{icon}}"{{/if}}' +
	'    data-streams-preview=\'{"publisherId":"{{stream.fields.publisherId}}","streamName":"{{stream.fields.name}}", "cacheBust": false, "closeable": false, "imagepicker": {"cacheBust": false, "showSize": "1000x", "save": "Calendars/event", "saveSizeName": "Calendars/event"}}\'>' +
	'  </div>' +
	'</div>' +
	'{{#if show.hosts}}' +
	'  <div class="Calendars_event_hosts">' +
	'    {{{tool "Users/avatar" icon=1000 userId=stream.fields.publisherId className="Calendars_event_publisher" templates-contents-name="Calendars/event/hosts/avatar/contents"}}}' +
	'  </div>' +
	'{{/if}}' +
	'{{#if show.participants}}' +
	'  <div class="Calendars_event_participants"></div>' +
	'{{/if}}' +
	'{{#if show.going}}' +
	'  <div class="Q_big_prompt Calendars_going_prompt">' +
	'    {{text.event.tool.AreYouIn}}' +
	'    <span class="Calendars_going">' +
	'      <span data-going="no" class="Calendars_no">{{text.event.tool.No}}</span>' +
	'      <span data-going="maybe" class="Calendars_maybe">{{text.event.tool.Maybe}}</span>' +
	'      <span data-going="yes" class="Calendars_yes">{{text.event.tool.Yes}}</span>' +
	'    </span>' +
	'  </div>' +
	'{{/if}}' +
	'<div class="Calendars_info">' +
	'{{#if show.presentation}}' +
	'  <div class="Q_button Streams_aspect_presentation" data-invoke="presentation">' +
	'    <div class="Calendars_info_icon"><i class="qp-calendars-teleconference"></i></div>' +
	'    <div class="Calendars_info_content">{{text.event.tool.Presentation}}</div>' +
	'    <div class="Calendars_info_unseen" data-state="waiting"></div>' +
	'  </div>' +
	'{{/if}}' +
	'{{> Media/event/webrtc}}' +
	'{{#if show.chat}}' +
	'  <div class="Q_button Streams_aspect_chats" data-invoke="chat">' +
	'    <div class="Calendars_info_icon"><i class="qp-calendars-conversations"></i></div>' +
	'    <div class="Calendars_info_content">{{text.event.tool.Conversation}}</div>' +
	'    <div class="Calendars_info_unseen" data-state="waiting"></div>' +
	'  </div>' +
	'{{/if}}' +
	'{{#if show.moreInfo}}' +
	'  <div class="Q_button Streams_aspect_info" data-invoke="moreInfo">' +
	'    <div class="Calendars_info_icon"><i class="qp-calendars-about"></i></div>' +
	'    <div class="Calendars_info_content">{{text.event.tool.MoreInfo}}</div>' +
	'  </div>' +
	'{{/if}}' +
	'{{#if show.registration}}' +
	'  <div class="Q_button Streams_aspect_registration" data-invoke="registration">' +
	'    <div class="Calendars_info_icon"><i class="qp-calendars-events"></i></div>' +
	'    <div class="Calendars_info_content">{{text.event.tool.Registration}}</div>' +
	'  </div>' +
	'{{/if}}' +
	'{{#if show.promote}}' +
	'  <div class="Q_button Streams_aspect_promote" data-invoke="promote">' +
	'    <div class="Calendars_info_icon"><i class="qp-calendars-promote"></i></div>' +
	'    <div class="Calendars_info_content">{{text.event.tool.Promote}}</div>' +
	'  </div>' +
	'{{/if}}' +
	'{{#if show.myqr}}' +
	'  <div class="Q_button Calendars_aspect_myqr" data-invoke="myqr">' +
	'    <div class="Calendars_info_icon"><i class="qp-communities-qrcode"></i></div>' +
	'    <div class="Calendars_info_content">{{text.event.tool.Myqr}}</div>' +
	'  </div>' +
	'{{/if}}' +
	'{{#if show.trips}}' +
	'  <div class="Q_button Travel_aspect_trips">' +
	'    <div class="Calendars_info_buttons">{{{tool "Travel/trips" publisherId=stream.fields.publisherId streamName=stream.fields.name}}}</div>' +
	'  </div>' +
	'{{/if}}' +
	'{{#if show.time}}' +
	'  <div class="Q_button Q_aspect_when" data-invoke="time">' +
	'    <div class="Calendars_info_icon"><i class="qp-calendars-time"></i></div>' +
	'    <div class="Calendars_info_content">' +
	'      {{{tool "Q/timestamp" "start" capitalized=true relative=false time=startTime}}}' +
	'      {{#if endTime}}, {{text.event.composer.Ending}} <div class="Calendars_event_endTime"></div>{{/if}}' +
	'    </div>' +
	'    <div class="Calendars_recurring_setting"></div>' +
	'  </div>' +
	'{{/if}}' +
	'{{#if show.reminders}}' +
	'  <div class="Q_button Q_aspect_reminders" data-invoke="reminders">' +
	'    <div class="Calendars_info_icon"><i class="qp-calendars-alarm"></i></div>' +
	'    <div class="Calendars_info_content">{{text.event.tool.Reminders}}</div>' +
	'  </div>' +
	'{{/if}}' +
	'{{#if show.location}}' +
	'  <div class="Q_button Q_aspect_where" data-invoke="local">' +
	'    <div class="Calendars_info_icon"><i class="qp-calendars-locations"></i></div>' +
	'    <div class="Calendars_info_content">' +
	'      <div class="Calendars_location_venue" data-redundant={{venueRedundant}}>{{location.venue}}</div>' +
	'      <div class="Calendars_location_address">{{location.address}}</div>' +
	'      <div class="Calendars_location_area">{{location.area.title}}</div>' +
	'    </div>' +
	'  </div>' +
	'{{/if}}' +
	'{{> Media/event/livestream}}' +
	'{{#if show.interests}}' +
	'  <div class="Q_button Streams_aspect_interests" data-invoke="interests">' +
	'    <div class="Calendars_info_icon"><i class="qp-calendars-interests"></i></div>' +
	'    <div class="Calendars_info_content">' +
	'      {{#each interestTitles}}{{this}}<br />{{/each}}' +
	'    </div>' +
	'  </div>' +
	'{{/if}}' +
	'{{#if relatedParticipants}}' +
	'  {{#each relatedParticipants}}' +
	'  <div class="Q_button Streams_aspect_relatedParticipants" data-streamType="{{@key}}" data-categoryInfo="{{{json this}}}">' +
	'    <div class="Calendars_info_icon"><i class="qp-calendars-{{#replace "/" "-"}}{{@key}}{{/replace}}"></i></div>' +
	'    <div class="Calendars_info_content"></div>' +
	'  </div>' +
	'  {{/each}}' +
	'{{/if}}' +
	'{{#if show.eventType}}' +
	'  <div class="Q_button Calendars_aspect_eventType" data-invoke="eventType">' +
	'    <div class="Calendars_info_icon"><i class="qp-calendars-events"></i></div>' +
	'    <div class="Calendars_info_content"></div>' +
	'  </div>' +
	'{{/if}}' +
	'{{#if show.adminRecurring}}' +
	'  <div class="Q_button Calendars_aspect_recurring Calendars_aspect_admin">' +
	'    <div class="Calendars_info_icon"><i class="Calendars_composer_recurring_admin"></i></div>' +
	'    <div class="Calendars_info_content">{{text.event.tool.RecurringAdmin}}</div>' +
	'  </div>' +
	'{{/if}}' +
	'{{#if show.checkin}}' +
	'  <div class="Q_button Calendars_aspect_checkin Calendars_aspect_admin" data-invoke="checkin">' +
	'    <div class="Calendars_info_icon"><i class="qp-communities-qrcode"></i></div>' +
	'    <div class="Calendars_info_content">{{text.event.tool.Checkin}}</div>' +
	'  </div>' +
	'{{/if}}' +
	'{{#if show.closeEvent}}' +
	'  <div class="Q_button Calendars_aspect_close Calendars_aspect_admin" data-invoke="close">' +
	'    <div class="Calendars_info_icon"><img alt="Close Event" src=\'{{toUrl "Q/plugins/Calendars/img/white/close.png"}}\'></div>' +
	'    <div class="Calendars_info_content">{{text.event.tool.CloseEvent.button}}</div>' +
	'  </div>' +
	'{{/if}}' +
	'{{#if show.openTo}}' +
	'  <div class="Calendars_participants_info">{{text.event.tool.OpenTo}} {{peopleMin}} - {{peopleMax}} {{labelTitles}}</div>' +
	'{{/if}}' +
	'  <div class="Calendars_participants_info Calendars_payment" style="display: none">' +
	'    <div class="Calendars_info_content Calendars_payment_info">{{payment.content}}</div>' +
	'  </div>' +
	'  <div class="Calendars_event_title">' +
	'    <div class="Calendars_event_title_label">{{text.event.tool.TitleOfEvent}}</div>' +
	'    {{{tool "Streams/inplace" "title" field="title" inplaceType="text" inplace-placeholder="Title of event or activity" inplace-selectOnEdit=true publisherId=stream.fields.publisherId streamName=stream.fields.name}}}' +
	'  </div>' +
	'  <div class="Calendars_variable_height Calendars_event_description">' +
	'    {{{tool "Streams/inplace" "content" inplaceType="textarea" inplace-placeholder="Enter a description of this event or activity" inplace-selectOnEdit=false publisherId=stream.fields.publisherId streamName=stream.fields.name}}}' +
	'  </div>' +
	'</div>',
	{ partials: ['Media/event/webrtc', 'Media/event/livestream'] }
);

Q.Template.set('Calendars/event/AddParticipants',
	'<h3>{{text.event.tool.YouReservingPlace}}</h3>' +
	'<h3>{{SelectIncludesToAdd}}</h3>' +
	'{{#if warning}}<div class="Streams_related_participant_warning">{{warning}}</div>{{/if}}' +
	'<div class="Streams_related_participant"></div>' +
	'<table class="Streams_related_participant_summary" data-showMath="{{showMath}}">' +
	'  <thead><tr><th>{{text.event.tool.Name}}</th><th class="currency">{{currency}}</th></tr></thead>' +
	'  <tbody></tbody>' +
	'  <tfoot><tr><td>{{text.event.tool.Total}}</td><td class="summary"></td></tr></tfoot>' +
	'</table>' +
	'<button class="Q_button" name="AddParticipants">{{AddParticipants}}</button>' +
	'<button class="Q_button" name="proceed">{{Proceed}}</button>' +
	'<button class="Q_button" name="cancel">{{text.event.tool.CancelReservation}}</button>'
);

Q.Template.set('Calendars/event/payment',
	'<div class="Q_big_prompt" style="text-align: center">' +
	'  <div class="Payment-confirmation-content">{{content}}</div><br>' +
	'  <div class="Q_clickable_stretcher Q_clickable_sized">' +
	'    <a class="Q_button Payment-confirmation-button">{{button}}</a>' +
	'  </div>' +
	'</div>'
);

Q.Template.set('Calendars/event/reminders',
	'<h2>{{text.RemindersLabel}}</h2>' +
	'{{#each remindersConfig}}' +
	'  <label><input type="checkbox" {{this.checked}} value="{{@key}}">{{this.name}}</label>' +
	'{{/each}}'
);

Q.Template.set('Calendars/event/roles',
	'<div class="Calendars_event_roles">' +
	'  <h2>Roles management</h2>' +
	'  {{#each roles}}<div data-role="{{this}}">{{this}}</div>{{/each}}' +
	'</div>' +
	'{{#if paymentRequired}}' +
	'<div class="Calendars_event_paid">' +
	'  <h2>Paid management</h2>' +
	'  {{#each paid}}<div data-paid="{{this}}">{{this}}</div>{{/each}}' +
	'</div>' +
	'{{/if}}'
);

// Empty fallbacks for Media partials used by Calendars/event/tool.
// If Media plugin is loaded, its Q.Template.set calls will have
// already placed the real content and these are no-ops.
// If Media isn't loaded, empty strings prevent Q.Template.load
// from trying to fetch from the server, and the {{#if show.*}}
// guards inside the partials would render nothing anyway.
Q.each(['Media/event/webrtc', 'Media/event/livestream'], function (i, name) {
	var n = Q.normalize.memoized(name);
	if (!(n in Q.Template.collection)) {
		Q.Template.collection[n] = '';
	}
});

})(Q, Q.jQuery, window);