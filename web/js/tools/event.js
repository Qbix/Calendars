(function (Q, $, window, undefined) {

var Users = Q.Users;
var Streams = Q.Streams;
var Calendars = Q.Calendars;
var Travel = Q.Travel;
var Places = Q.Places;

/**
 * Calendars/event tool.
 * Renders interface for an event
 * @method Calendars/event
 * @param {Object} [options] this is an object that contains parameters for this function
 *   @param {String} options.publisherId The publisher id
 *   @param {String} options.streamName The name of the stream
 *   @param {Object} options.show
 *   @param {Boolean} [options.show.checkin]
 *   @param {String|Array} [options.show.promote='Streams/experience']
 *   @param {Boolean} [options.show.hosts=true]
 *   @param {Boolean|String} [options.show.participants=true] Can be true, false and 'publishers' - which means display only to event publisher or admin.
 *   @param {Boolean} [options.show.trips=false]
 *   @param {Boolean} [options.show.chat=false]
 *   @param {Boolean} [options.show.time=true]
 *   @param {Boolean} [options.show.location=false]
 *   @param {Boolean} [options.show.interests=true]
 *   @param {Boolean} [options.show.openTo=true]
 *   @param {Boolean} [options.autoStartWebrtc=false] - If event is online, automatically start teleconference on event started.
 *   @param {Boolean|Integer} [options.hideParticipants=false] If integer, hide participants tool if participants less or equal to this number. If false, never hide participants tool.
 *   @param {Object} [relatedParticipants] Object with settings for related participants
 *   @param {String} [relatedParticipants.currency='credits'] Currency to show
 *   @param {Boolean} [relatedParticipants.showMath=true] Whether to show summary credits calculation
 *   @param {Array} [options.skipClickable] List of selectors for which we should not apply Q/clickable plugin.
 *   @param {Q.Event} [options.onRefresh] Occurs when the tool is refreshed
 *   @param {Q.Event} [options.onGoing] Occurs right after tool is refreshed or when someone clicks on on of the "going" buttons
 *   @param {Q.Event} [options.onTitleChanged] Occurs when event title changed
 *   @param {Q.Event} [options.onInvoke(button)] Occurs when the user clicks one of the buttons.
 *   @param {Q.Event} [options.onPaid] Occurs when the payment process successfully.
 *
 *     The value of "button" depends on what is shown, see the "show" option.
 */
Q.Tool.define("Calendars/event", function(options) {
	var tool = this;
	var state = tool.state;
	var userId = Users.loggedInUserId();
	var $toolElement = $(this.element);

	tool.modePrepayment = Q.getObject("Event.mode.prepayment", Calendars);

	state.publisherId = state.publisherId || Q.getObject("stream.publisherId", state) || Q.getObject("stream.fields.publisherId", state);
	state.streamName = state.streamName || Q.getObject("stream.name", state) || Q.getObject("stream.fields.name", state);

	Q.Assets.Payments.load();

	$toolElement.attr("data-mode", this.state.mode);
	$toolElement.attr("data-admin", Q.getObject("Event.isAdmin", Calendars));

	var pipe = new Q.Pipe(['appTexts', 'calendarsTexts', 'style'], tool.refresh.bind(tool));

	// get app texts
	Q.Text.get(Users.communityId + '/content', function (err, content) {
		var msg = Q.firstErrorMessage(err, content);
		if (msg) {
			console.error(msg);
			return;
		}

		tool.appText = content;
		tool.appTextRelatedParticipants = Q.getObject("assets.service.relatedParticipants", tool.appText);
		pipe.fill('appTexts')();
	});

	// get Calendars texts
	Q.Text.get('Calendars/content', function (err, content) {
		var msg = Q.firstErrorMessage(err, content);
		if (msg) {
			console.error(msg);
			return;
		}

		tool.text = content;
		tool.closeEventConfirm = content.event.tool.CloseEvent.confirm;
		pipe.fill('calendarsTexts')();
	});

	Q.addStylesheet('{{Calendars}}/css/event.css', { slotName: 'Calendars' }, pipe.fill('style'));

	// listen for Calendars/checkin message and change participants tool
	Streams.Stream.onMessage(state.publisherId, state.streamName, 'Calendars/checkin')
	.set(function(message) {
		var instructions = JSON.parse(message.instructions);

		if (!instructions.checkin) {
			return;
		}

		// update Streams/participants tool
		Calendars.Event.updateParticipants({
			tool: tool,
			userId: instructions.userId,
			type: 'checkin'
		});
	}, tool);

	// Listen for Streams/changed message, and if title modified, change event title.
	Streams.Stream.onMessage(state.publisherId, state.streamName, 'Streams/changed')
	.set(function(message) {
		var instructions = JSON.parse(message.instructions);
		var newTitle = Q.getObject(["changes", "title"], instructions);

		if (newTitle) {
			Q.handle(state.onTitleChanged, tool, [newTitle])
		}
	}, tool);

	Streams.Stream.onMessage(state.publisherId, state.streamName, 'Calendars/going')
	.set(function(message) {
		if (message.byUserId === userId) {
			tool.rsvp(message.getInstruction('going'));
		}
	}, tool);

	Streams.Stream.onMessage(state.publisherId, state.streamName, 'Calendars/event/webrtc/started')
	.set(function(message) {
		tool.switchChatWebrtc({
			publisherId: message.getInstruction("publisherId"),
			streamName: message.getInstruction("streamName")
		});
	}, tool);

	Streams.Stream.onMessage(state.publisherId, state.streamName, 'Calendars/event/webrtc/ended')
	.set(function(message) {
		tool.switchChatWebrtc(false);
	}, tool);

	Streams.Stream.onMessage(state.publisherId, state.streamName, 'Streams/participant/save')
	.set(function(message) {
		Streams.get.force(state.publisherId, state.streamName, function (err, eventStream, extra) {
			tool.participants = extra.participants || [];
			var participantsTool = Q.Tool.from($(".Calendars_event_participants", tool.element)[0], "Streams/participants");
			if (!participantsTool) {
				return console.warn("Calendars/event: participants tool not found");
			}

			Q.handle(participantsTool.state.onRefresh, participantsTool);
		}, {
			withParticipant: true,
			participants: 100
		});
	}, tool);

	state.onInvoke('livestream').set(function (stream) {
		state.webrtc = null;
		tool.getGoing(userId, function (going) {
			if (going !== 'yes') {
				return Q.alert(tool.text.event.tool.YouAreNotParticipated);
			}

			tool.startWebRTC && tool.startWebRTC();
		});
	}, tool);
},

{
	publisherId: null,
	streamName: null,
	show: {
		hosts: true,
		rsvp: true,
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
		location: false,
		interests: true,
		eventType: false,
		openTo: true,
		livestream: false,
		webrtc: false
	},
	mode: Q.getObject("Communities.event.mode", Q) || "classic",
	autoStartWebrtc: true,
	eventRecurring: null,
	hideParticipants: false,
	relatedParticipants: {
		currency: 'credits',
		showMath: true
	},
	skipClickable: [".Travel_aspect_trips", ".Streams_aspect_relatedParticipants", ".Q_aspect_when", ".Streams_aspect_interests"],
	onRefresh: new Q.Event(),
	onGoing: new Q.Event(),
	onTitleChanged: new Q.Event(),
	onInvoke: Q.Event.factory(),
	onPaid: new Q.Event()
},

{
	/**
	 * Refresh the HTML of the tool
	 * @method refresh
	 */
	refresh: function () {
		var tool = this;
		var $te = $(this.element);
		var state = tool.state;
		var isAdmin = false;
		var userId = Users.loggedInUserId();

		Streams.retainWith(tool).get(state.publisherId, state.streamName, function (err, eventStream, extra) {
			var stream = tool.stream = this;
			var paymentType = Q.getObject("type", stream.getAttribute('payment'));
			var startTime = parseInt(stream.getAttribute('startTime'));
			var endTime = parseInt(stream.getAttribute('endTime'));

			// listen for event started, ended, happening
			stream.onStarted.add(function () {
				$te.addClass("Calendars_event_started");
				$te.addClass("Calendars_event_happening");
			}, tool);
			stream.onEnded.add(function () {
				$te.removeClass("Calendars_event_happening");
				$te.addClass("Calendars_event_ended");
			}, tool);

			// create ordering for participants tool
			var participantsOrdering = [];
			Q.each(Q.getObject("participants", extra), function (userId, streamsParticipant) {
				if (streamsParticipant.testRoles(['leader', 'speaker', 'host', 'staff'])) {
					participantsOrdering.push(userId);
				}
			});

			$te.attr('data-payment', paymentType || '');

			// if event stream invalid or closed - exit
			if (!Streams.isStream(stream) || !!Q.getObject(["fields", "closedTime"], stream)) {
				Q.alert(tool.text.event.EventAlreadyClosed);
				tool.remove();
				return;
			}

			// whether user have permissions to edit event
			isAdmin = state.isAdmin = stream.testWriteLevel('close');

			// on event state changed event
			stream.onAttribute('state').set(function (attributes, k) {
				// if event stream closed - remove tool
				if(attributes[k] === "closed"){

					// execute delete event
					Q.handle(state.onInvoke("close"), tool, [stream]);

					// remove tool if it didn't removed yet
					if (tool && !tool.removed) {
						Q.Tool.remove(tool.element);
					}
				}
			}, tool);

			// set elements visibility
			tool.setShow();

			// set includeParticipants
			state.relatedParticipants.participants = Q.extend({}, Q.getObject("Assets.service.relatedParticipants", Q));

			// check if venue is a part of address
			var location = JSON.parse(stream.fields.location || null) || Places.Location.fromStream(stream);
			var venue = location.venue;
			var address = location.address;
			if (Q.typeOf(venue) === 'string' && Q.typeOf(address) === 'string' && venue.length > 0 && address.includes(venue)) {
				state.venueRedundant = true;
			}

			tool.participants = extra.participants || [];
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
				icon: state.icon || tool.stream.iconUrl('500x'),
				peopleMin: tool.stream.getAttribute('peopleMin', Q.getObject("Event.defaults.peopleMin", Calendars)),
				peopleMax: tool.stream.getAttribute('peopleMax', Q.getObject("Event.defaults.peopleMax", Calendars)),
				labelTitles: labelTitles,
				relatedParticipants: state.relatedParticipants.participants,
				authorizedToEdit: stream.testWriteLevel('edit'),
				text: tool.text
			});

			Q.Template.render('Calendars/event/tool', fields, function (err, html) {
				if (err) {
					return;
				}
				Q.replace(tool.element, html);

				var $participants = $(".Calendars_event_participants", tool.element);
				if ($participants.length) {
					$participants.tool("Streams/participants", {
						max: state.peopleMax,
						maxShow: Q.getObject("Event.defaults.participants.maxShow", Calendars),
						showSummary: false,
						showControls: true,
						showBlanks: Q.getObject("Event.defaults.participants.showBlanks", Calendars),
						publisherId: state.publisherId,
						streamName: state.streamName,
						ordering: participantsOrdering,
						invite: {
							readLevel: 25
						}
					});
				}

				Q.req("Calendars/event", "data", function (err, response) {
					if (err) {
						return;
					}

					var data = response.slots.data;
					var liveWebrtc = Q.getObject("liveWebrtc", data);
					tool.switchChatWebrtc(liveWebrtc);
				}, {
					fields: {
						publisherId: state.publisherId,
						streamName: state.streamName
					}
				});


				$(".Q_aspect_reminders", tool.element).on(Q.Pointer.fastclick, function () {
					var $this = $(this);

					$this.addClass("Q_working");

					Streams.Participant.get.force(state.publisherId, state.streamName, userId, function (err, participant) {
						var msg = Q.firstErrorMessage(err);
						if (msg) {
							return console.warn(msg);
						}

						var remindersSaved = participant.getExtra('reminders') || null;
						var remindersConfig = {};

						Q.each(Q.getObject("Event.reminders", Calendars), function (key, value) {
							remindersConfig[key] = value;
							var parts = Q.displayDuration(key * 1000,{hours: true}).split(":").map(function(num) { return parseInt(num, 10); });
							if (parts[0] === 0) {
								remindersConfig[key].name = parts[1] + " " + tool.text.event.composer.Minutes;
							} else if (parts[1] === 0) {
								remindersConfig[key].name = parts[0] + " " + (parts[0] === 1 ? tool.text.event.composer.Hour : tool.text.event.composer.Hours);
							} else {
								remindersConfig[key].name = parts[0] + " " + tool.text.event.composer.Hours + " " + parts[1] + " " + tool.text.event.composer.Minutes;
							}

							if (remindersSaved === null) {
								remindersConfig[key].checked = value.selected ? "checked" : "";
							} else {
								remindersConfig[key].checked = (remindersSaved.includes(parseInt(key)) || remindersSaved.includes(key.toString())) ? "checked" : "";
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
									var $this = $(this);
									if ($this[0].checked) {
										reminders.push($this.val());
									}
								});

								Q.req("Calendars/reminders", function () {

								}, {
									method: "post",
									fields: {
										publisherId: state.publisherId,
										eventId: state.streamName.split('/').pop(),
										reminders: reminders
									}
								});
							}
						});

						$this.removeClass("Q_working");
					});
				});

				// if end time defined, add Q/timestamp tool
				if (endTime) {
					var timeStampOptions = {
						relative: false,
						time: endTime * 1000,
						capitalized: true
					};

					// check if start and end dates are in same day
					if(new Date(startTime * 1000).setHours(0, 0, 0, 0) === new Date(endTime * 1000).setHours(0, 0, 0, 0)){
						timeStampOptions.format = "%l:%M %P";
					}

					$(".Calendars_event_endTime", tool.element).tool("Q/timestamp", timeStampOptions);
				}

				tool.$rsvpElement = $(".Calendars_going_prompt .Calendars_going", tool.element);
				tool.getPaymentInfo();

				setTimeout(function () {
					Q.activate(tool.element, _proceed.bind(stream));
				}, 0);

				tool.$('.Calendars_info .Q_button').click(function () {
					var $this = $(this);
					var aspect = $this.attr('data-invoke');
					Q.handle(state.onInvoke(aspect), tool, [tool.stream, $this]);
				});


				// if event type defined
				if (state.show.eventType) {
					var eventType = stream.getAttribute("eventType");
					eventType = Q.getObject(['communities', 'events', 'types', eventType], tool.text) || eventType;
					$(".Calendars_aspect_eventType .Calendars_info_content", tool.element).html(eventType);
				}

				// handle recurring
				if (Q.getObject(["relatedFromTotals", 'Calendars/recurring'], eventStream)) {
					// create recurring tool for user
					$(".Calendars_recurring_setting", tool.element).tool("Calendars/recurring", {
						publisherId: state.publisherId,
						streamName: state.streamName,
						action: "settings",
						onBeforeDialog: function (callback) {
							var recurringTool = this;
							var recurringToolState = this.state;

							Calendars.Recurring.getRecurringData(eventStream, function(data){
								var userRecurring = Q.getObject(["userRecurring"], data);
								recurringToolState.period = Q.getObject("eventRecurring.period", data) || [];
								recurringToolState.days = Q.getObject("userRecurring.days", data) || [];
								recurringToolState.startDate = Q.getObject("userRecurring.startDate", data) || [];
								recurringToolState.endDate = Q.getObject("userRecurring.endDate", data) || [];
								recurringToolState.possibleDays = Q.getObject("eventRecurring.days", data) || [];

								state.onGoing.add(function(going) {
									if (going === 'yes' && !userRecurring) {
										Q.handle(recurringTool.openDialog, recurringTool);
									}
								}, tool);

								Q.handle(callback);
							});
						}
					}).activate();

					// if user have permissions to edit event - add icon to change recurring rules
					// create recurring tool for admin
					$(".Calendars_aspect_recurring", tool.element).tool("Calendars/recurring", {
						publisherId: state.publisherId,
						streamName: state.streamName,
						modToolElement: false,
						action: "admin",
						onBeforeDialog: function (callback) {
							var recurringToolState = this.state;

							// check if event elated to availability
							Calendars.Recurring.getAvailabilityCategory(eventStream, function (data) {
								if (Streams.isStream(this)) {
									Q.handle(callback, null, [false]);
									return Q.alert(tool.text.event.tool.AvailabilityWarning.interpolate({
										title: this.fields.title
									}));
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
				}

				// set Q/clickable plugin to all buttons except travel
				tool.$('.Calendars_info > div.Q_button')
				.not(state.skipClickable.join())
				/*.plugin('Q/clickable', {
					press: {size: 1.2},
					release: {size: 1.2}
				})*/;
			}, {
				tool: tool
			});
		}, {
			withParticipant: true,
			participants: 100,
			withRelatedFromTotals: ['Calendars/recurring']
		});

		function _proceed () {
			var stream = this;
			var participantsTool = tool.child('Streams_participants');
			if (participantsTool) {
				participantsTool.state.onRefresh.add(_onRefresh, tool);
				participantsTool.Q.onStateChanged('count').add(function () {
					var $participants = $(participantsTool.element);
					if (state.hideParticipants === false || this.state.count > (parseInt(state.hideParticipants) || 0) || stream.getAttribute("userId") === userId) {
						$participants.show();
					} else {
						$participants.hide();
						// TODO: close events once everyone leaves?
					}
				});
			}

			var livestreamTimestampTool = Q.Tool.from($("div[data-invoke=livestream] .Q_timestamp_tool", $te), "Q/timestamp");
			if (livestreamTimestampTool) {
				livestreamTimestampTool.state.beforeRefresh.set(function (result, diff) {
					tool.livestreamState();
				}, tool);
			}

			tool.$('.Calendars_going span').on(Q.Pointer.end, function () {
				var $this = $(this);
				if (Q.Pointer.canceledClick || $this.hasClass('Q_selected')) {
					return;
				}

				tool.rsvp($this.attr('data-going'));
			});

			var $unseen = tool.$('.Streams_aspect_chats .Calendars_info_unseen');
			Q.Streams.Message.Total.setUpElement(
				$unseen[0],
				state.publisherId,
				state.streamName,
				'Streams/chat/message',
				tool
			);
			// some time this element appear in wrong place,
			// so wait till parent rendered and remove this attr to place element to right place
			setTimeout(function () {
				$unseen.removeAttr('data-state');
			}, 1000);

			// update going
			if (userId) {
				tool.stream.getParticipant(userId, function (err, participant) {
					var msg = Q.firstErrorMessage(err);
					if (msg) {
						console.warn(msg);
						tool.going('no', true);
					} else {
						tool.going(participant && participant.getExtra('going'), true);
					}
				});
			} else {
				tool.going('no', true);
			}

			// close event button handler
			tool.$(".Calendars_aspect_close").on(Q.Pointer.fastclick, function(){
				var $this = $(this);

				$this.addClass("Q_working");

				Streams.get(
					tool.stream.fields.publisherId,
					tool.stream.fields.name,
					function (err, stream, extra) {
						$this.removeClass("Q_working");
						var msg = Q.firstErrorMessage(err);
						if (msg) {
							console.warn(msg);
							return;
						}
						var participants = 0;
						Q.each(extra && extra.participants, function (userId, participant) {
							// skip event publisher and participants with wrong state
							if (participant.state !== 'participating'
							|| userId === tool.stream.fields.publisherId) {
								return;
							}
							++participants;
						});
						if (participants) {
							var participantsConfirmText = tool.closeEventConfirm.text.Cancel + "<br>";
							if (participants > 1) {
								participantsConfirmText += tool.closeEventConfirm.text.Participants.interpolate({
									count: participants
								});
							} else {
								participantsConfirmText += tool.closeEventConfirm.text.Participant;
							}
							return Q.confirm(participantsConfirmText, function (choice) {
								if (choice) {
									_closeEvent();
								}
							},
								{ title: tool.text.event.tool.CloseEvent.button }
							);
						}
						_closeEvent();
					}, 
					{participants: 1000}
				);
				
				function _recurringConfirmation(){
					Q.confirm(tool.closeEventConfirm.text.Recurring, function (choice) {
						_closeEvent(choice);
					}, { 
						title: tool.text.event.tool.CloseEvent.button 
					});
				}
				
				function _closeEvent(stopRecurring){

					// remove event from native calendar
					Calendars.Event.removeFromCalendar(state.publisherId, state.streamName.split('/').pop());

					// if event is recurring - as about recurring
					if (stopRecurring === undefined
					&& !Q.isEmpty(state.eventRecurring)) {
						return _recurringConfirmation();
					}
					
					// send request to close event
					Q.req('Calendars/event', '', function (err, response) {
						var r = response && response.errors;
						var msg = Q.firstErrorMessage(err, r);
						if (msg) {
							return Q.alert(msg, {
								title: "Sorry"
							});
						}
					}, {
						method: 'delete',
						fields: {
							publisherId: tool.stream.fields.publisherId,
							streamName: tool.stream.fields.name,
							stopRecurring: stopRecurring ? 1 : 0
						}
					});
				}

				return false;
			});

			// process relatedParticipants
			$(".Streams_aspect_relatedParticipants", tool.element).each(function () {
				var $this = $(this);
				var streamType = $this.attr('data-streamType');

				// onclick relatedParticipants, open addRelatedParticipants dialog
				$this.on(Q.Pointer.fastclick, tool.addRelatedParticipants.bind(tool));

				$(".Calendars_info_content", $this).tool("Streams/related", {
					stream: stream,
					relationType: streamType,
					editable: false,
					mode: "participant",
					closeable: false,
					realtime: true,
					sortable: false,
					relatedOptions: {
						withParticipant: false
					},
					previewOptions: {

					},
					//creatable: creatable,
					beforeRenderPreview: function (data, element) {
						if (!isAdmin && data.publisherId !== userId) {
							return false;
						}
					},
					onRefresh: function () {
						var TypeDisplayPlural = Q.getObject(["appTextRelatedParticipants", streamType, "multiple"], tool);
						var className = "Calendars_event_relatedParticipants_empty";
						if ($(".Streams_preview_tool", this.element).length) {
							$("." + className, this.element).remove();
						} else {
							this.element.innerHTML = '<div class="' + className + '">' + tool.text.event.tool.YouHaveNotRegisteredAnyIncluded.interpolate({TypeDisplayPlural: TypeDisplayPlural}) + '</div>'
						}
					}
				}).activate(function () {
					state.relatedParticipants.participants[streamType]['relatedTool'] = this;
				});
			});

			// force rsvp if defined in GET params
			var rsvp = new URLSearchParams(window.location.search).get('rsvp');
			if (rsvp) {
				tool.rsvp(rsvp);
			}
		}

		function _onRefresh() {
			Streams.get(state.publisherId, state.streamName, function (err, stream) {
				var msg = Q.firstErrorMessage(err);
				if (msg) {
					console.warn(msg);
					return;
				}
				Q.handle(state.onRefresh, tool);
			});

			// add to participants onRefresh event handler to update avatar data-checkin
			// iterate event participants
			Q.each(tool.participants, function (index, participant) {
				if (participant.state !== 'participating') {
					return;
				}

				var extra = participant.extra ? JSON.parse(participant.extra) : null;

				if (participant.testRoles('leader')) {
					Calendars.Event.updateParticipants({
						tool: tool,
						userId: participant.userId,
						type: 'leader'
					});
				} else if (participant.testRoles('host')) {
					Calendars.Event.updateParticipants({
						tool: tool,
						userId: participant.userId,
						type: 'host'
					});
				} else if (participant.testRoles('speaker')) {
					Calendars.Event.updateParticipants({
						tool: tool,
						userId: participant.userId,
						type: 'speaker'
					});
				} else if (participant.testRoles('staff')) {
					// logged user is a staff in this event
					if (Q.Users.loggedInUserId() === participant.userId) {
						$te.attr("data-staff", true);
					}

					Calendars.Event.updateParticipants({
						tool: tool,
						userId: participant.userId,
						type: 'staff'
					});
				}

				if (Q.getObject(['checkin'], extra)) {
					Calendars.Event.updateParticipants({
						tool: tool,
						userId: participant.userId,
						type: 'checkin'
					});
				} else if (participant.testRoles('requested')) {
					Calendars.Event.updateParticipants({
						tool: tool,
						userId: participant.userId,
						type: 'requested'
					});
				} else if (participant.testRoles('attendee')) {
					Calendars.Event.updateParticipants({
						tool: tool,
						userId: participant.userId,
						type: 'attendee'
					});
				} else if (participant.testRoles('paid')) {
					Calendars.Event.updateParticipants({
						tool: tool,
						userId: participant.userId,
						type: 'paid'
					});
				}
			});
		}
	},
	/**
	 * @method startWebRTC
	 */
	startWebRTC: function () {
		var tool = this;
		var state = this.state;
		var $toolElement = $(this.element);
		var userId = Q.Users.loggedInUserId();

		if (state.webrtc) {
			return;
		}

		// if event not started or already ended
		if (!state.livestream || !tool.eventIsHappening()) {
			return;
		}

		tool.getGoing(userId, function (going) {
			if (going !== 'yes') {
				return;
			}

			state.webrtc = 'loading';
			$toolElement.attr("data-webrtc", 'loading');

			if (!Q.Media) {
				return;
			}
			Q.Media.WebRTC.start({
				publisherId: state.publisherId,
				streamName: state.streamName,
				tool: tool,
				useRelatedTo: true,
				onWebrtcControlsCreated: function () {
					$toolElement.attr("data-webrtc", true);
				},
				onStart: function () {
					state.webrtc = this;
				},
				onEnd: function () {
					state.webrtc = 'ended';
					$toolElement.attr("data-webrtc", false);
				}
			});
		});
	},
	/**
	 * Switch chat and webrtc buttons depends on webrtc currently happening
	 * @method switchChatWebrtc
	 * @param {object|boolean} liveWebrtc - if webrtc happening, contain webrtc stream data
	 */
	switchChatWebrtc: function (liveWebrtc) {
		var tool = this;
		var $toolElement = $(tool.element);

		if (liveWebrtc) {
			if ($toolElement.attr("data-webrtc") === "true") {
				return;
			}
			liveWebrtc.closeable = false;
			liveWebrtc.editable = false;
			var $aspectWebrtc = $(".Media_aspect_webrtc", tool.element);
			var $webrtcElement = $(".Calendars_info_content", $aspectWebrtc);
			Q.Tool.remove($webrtcElement[0], true, false);
			$webrtcElement[0].forEachTool("Streams/participants", function () {
				this.state.showSummary = false;
				this.stateChanged('count');
			}, tool);
			Streams.get.force(liveWebrtc.publisherId, liveWebrtc.streamName, function () {
				$webrtcElement.tool("Streams/preview", liveWebrtc);
				$webrtcElement.tool("Media/webrtc/preview").activate();
				$toolElement.attr("data-webrtc", true);
				$aspectWebrtc.addClass("Q_live");
			});
		} else {
			$toolElement.attr("data-webrtc", false);
		}
	},
	/**
	 * Detect whether event happening currently
	 * @method eventIsHappening
	 * @return boolean
	 */
	eventIsHappening: function () {
		var stream = this.stream;
		var startTime = stream.getAttribute('startTime') * 1000;
		var endTime = stream.getAttribute('endTime') * 1000;
		var currentTimestamp = new Date().getTime();

		// if event not started or already ended
		if (startTime < currentTimestamp && endTime > currentTimestamp) {
			return true;
		}

		return false;
	},
	/**
	 * Detect whether event ended
	 * @method eventEnded
	 * @return boolean
	 */
	eventEnded: function () {
		var stream = this.stream;
		var endTime = stream.getAttribute('endTime') * 1000;
		var currentTimestamp = new Date().getTime();

		if (endTime < currentTimestamp) {
			return true;
		}

		return false;
	},
	/**
	 * Detect going extra from stream participant
	 * @method getGoing
	 * @param {string} userId
	 * @param {function} callback
	 */
	getGoing: function (userId, callback) {
		Streams.get(this.state.publisherId, this.state.streamName, function (err, stream) {
			var msg = Q.firstErrorMessage(err);
			if (msg) {
				console.warn(msg);
				return;
			}

			stream.getParticipant(userId, function (err, participant) {
				var msg = Q.firstErrorMessage(err);
				if (msg) {
					return console.warn(msg);
				}

				var going = participant && participant.getExtra('going');

				Q.handle(callback, stream, [going]);
			});
		});
	},
	/**
	 * Check if live stream happening or ended and set appropriate attributes
	 * @method livestreamState
	 * @return string
	 */
	livestreamState: function () {
		var livestreamState = 'waiting';
		if (this.eventEnded()) {
			livestreamState = 'ended';
		} else if (this.eventIsHappening()) {
			livestreamState = 'happening';
			if (this.state.autoStartWebrtc) {
				this.startWebRTC();
			}
		}

		$(".Q_aspect_conference .Calendars_info_content", this.element).attr('data-livestreamState', livestreamState);

		return livestreamState;
	},
	getPaymentStatus: function () {
		var publisherId = this.state.publisherId;
		var eventId = this.state.streamName.split('/').pop();
		return new Q.Promise(function(resolve, reject) {
			Q.req('Calendars/payment', ['status', 'info'], function (err, response) {
				var r = response && response.errors;
				var msg = Q.firstErrorMessage(err, r);
				if (msg) {
					return reject(msg);
				}
				resolve(response);
			}, {
				fields: {
					publisherId: publisherId,
					eventId: eventId,
					clientId: Q.clientId()
				}
			});
		});
	},
	/**
	 * 
	 * @returns 
	 */
	getPaymentInfo: function () {
		var tool = this;
		var state = this.state;
		var $calendarsPayment = tool.$('.Calendars_payment');
		var payment = tool.stream.attributes.payment;
		if (!payment) {
			return Q.Promise.resolve();
		}
		state.payment = {};
		state.payment.content = (tool.text.payment.info[payment.type]).interpolate(payment);
		state.payment.description = tool.stream.fields.title;
		Q.each(['amount', 'currency', 'type'], function(index, key) {
			state.payment[key] = payment[key];
		});
		state.payment.credits = Q.Assets.Credits.convertToCredits(payment.amount, payment.currency);

		$calendarsPayment.html(state.payment.content).show();

		if (!Users.loggedInUserId()) {
			return;
		}

		tool.getPaymentStatus().then(function(data) {
			if (!state.payment) {
				return;
			}
			state.payment.isAssetsCustomer = Q.getObject("slots.info.isAssetsCustomer", data);
			var status = Q.getObject("slots.status", data);
			if (!status) {
				return;
			}

			state.payment.content += status ? ' (' + tool.text.payment.info.paid + ')' : '';
			state.payment.date = status.insertedTime;
		}).catch(function(err) {
			console.warn(err);
		}).then(function() {
			$calendarsPayment.html(state.payment.content);
		});
	},
	/**
	 * Add related participants to event
	 * @method addRelatedParticipants
	 * @param {object} options
	 * @param {boolean} [options.callback] Callback calling when all participants added
	 */
	addRelatedParticipants: function (options) {
		var tool = this;
		var state = this.state;
		var going = $(tool.element).attr('data-going');
		var toolText = tool.text.event.tool;
		var creditsAmount = Q.getObject("payment.credits", state) || 0;
		var requiredParticipantsList = tool.stream.getAttribute("requiredParticipants");

		Q.each(tool.state.relatedParticipants.participants, function (streamType, data) {
			var relatedTool = Q.getObject("relatedTool", data);
			if (!relatedTool) {
				return console.warn(streamType + " relation required, but related tool empty");
			}

			var categoryPublisherId = data.publisherId || Q.Users.loggedInUserId();
			var categoryStreamName = data.streamName;
			var categoryRelationType = data.relationType;
			var TypeDisplayPlural = Q.getObject([streamType, "multiple"], tool.appTextRelatedParticipants);
			var SelectIncludesToAdd = toolText.SelectIncludesToAdd.interpolate({TypeDisplayPlural: TypeDisplayPlural});
			var AddParticipants = Q.getObject([streamType, "add"], tool.appTextRelatedParticipants) || toolText.AddParticipants;
			var warning = null;
			if (requiredParticipantsList) {
				warning = tool.text.event.tool.RequiredRelatedParticipants.interpolate({requiredParticipantsList: requiredParticipantsList.join(", ")});
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
					var $dialogContent = $(".Q_dialog_content", dialog);
					$dialogContent.attr('data-going', going);
					$dialogContent.attr('data-relatedParticipantsModified', false);

					// need to check later if selected participants modified
					var $selectedParticipants;

					var $buttonProceed = $("button[name=proceed]", dialog);

					var $summary = $(".Streams_related_participant_summary", $dialogContent);

					var $currencySelect = $("<select>").on("change", function () {
						var exchange = $("option:selected", $currencySelect).attr("data-exchange");

						$(".Streams_related_participant_amount, .summary", $summary).each(function () {
							var $this = $(this);
							$this.html(_amountView(parseFloat($this.attr("data-amount")) / exchange));
						});
					});

					// check if conditions to proceed and enable/disable proceed button
					var _validToProceed = function () {
						if (going !== "yes" || Q.isEmpty(requiredParticipantsList)) {
							return $buttonProceed.removeClass("Q_disabled");
						}

						for (var i=0; i < requiredParticipantsList.length; i++) {
							if ($(".Streams_preview_tool.Q_selected[data-streamType='" + requiredParticipantsList[i] + "']", dialog).length) {
								return $buttonProceed.removeClass("Q_disabled");
							}
						}

						$buttonProceed.addClass("Q_disabled");
					};
					_validToProceed();

					var _amountView = function (amount) {
						var currency = $currencySelect.val();
						if (currency !== "credits") {
							amount = (amount).toFixed(2);
						}
						amount = amount.toString();
						return amount.includes("-") ? amount.replace("-", "") : "+" + amount;
					};

					Q.each(Q.Assets.Credits.exchange, function (currency, amount) {
						var selected = currency === state.relatedParticipants.currency ? "selected" : "";
						$currencySelect.append($("<option data-exchange='" + amount + "' " + selected + "'>" + currency + "</option>"));
					});
					$("th.currency", $summary).html($currencySelect);

					$summary.addItem = function (id, name, amount) {
						// don't add rows with zero amount
						if (!parseFloat(amount)) {
							return;
						}

						var exchange = parseFloat($("option:selected", $currencySelect).attr("data-exchange"));
						var amountConverted = amount/exchange;
						$("<tr data-id='" + id + "'><td class='Streams_related_participant_name'>" + name + "</td><td class='Streams_related_participant_amount' data-amount='" + amount + "'>" + _amountView(amountConverted) + "</td></tr>").appendTo($("tbody", $summary));
						$summary.calculateSum();
					};
					$summary.removeItem = function (id) {
						$("tr[data-id='" + id + "']", $summary).remove();
						$summary.calculateSum();
					};
					$summary.calculateSum = function () {
						var sum = 0;
						$(".Streams_related_participant_amount", $summary).each(function () {
							var amount = parseFloat($(this).attr("data-amount"));
							if (isNaN(amount)) {
								return;
							}

							sum += amount;
						});

						var exchange = parseFloat($("option:selected", $currencySelect).attr("data-exchange"));
						var sumConverted = sum/exchange;
						$(".summary", $summary).attr("data-amount", sum).html(_amountView(sumConverted));

						if ($("tbody tr", $summary).length) {
							$summary.show();
						} else {
							$summary.hide();
						}
					};
					var $streamsRelatedParticipant = $(".Streams_related_participant", dialog);
					$streamsRelatedParticipant.tool('Streams/related', {
						publisherId: categoryPublisherId,
						streamName: categoryStreamName,
						relationType: categoryRelationType,
						editable: false,
						closeable: false,
						sortable: false,
						relatedOptions: {
							withParticipant: false
						},
						beforeRenderPreview: function (data, element) {
							if (tool.alreadyRelated(relatedTool, data.publisherId, data.name)) {
								element.addClass('Q_selected');
							}
						},
						onRefresh: function () {
							$dialogContent.attr('data-empty', $streamsRelatedParticipant.is(":empty"));
						}
					}).activate();

					if (going !== 'yes') {
						$summary.addItem('self', toolText.ReservationFee, -1*creditsAmount);
					}

					dialog.forEachTool("Streams/preview", function () {
						var previewTool = this;
						var $toolElement = $(this.element);

						$selectedParticipants = $(".Streams_preview_tool.Q_selected", dialog)
						.map(function(){return this.id;}).get().join();

						$toolElement.on(Q.Pointer.fastclick, function () {
							var publisherId = previewTool.state.publisherId;
							var streamName = previewTool.state.streamName;
							$toolElement.toggleClass('Q_selected');

							if ($toolElement.hasClass('Q_selected')) {
								if (!tool.alreadyRelated(relatedTool, publisherId, streamName)) {
									$summary.addItem(streamName, $(".Streams_preview_title", $toolElement).html(), -1*creditsAmount);
								} else {
									$summary.removeItem(streamName);
								}
							} else {
								if (tool.alreadyRelated(relatedTool, publisherId, streamName)) {
									$summary.addItem(streamName, $(".Streams_preview_title", $toolElement).html(), creditsAmount);
								} else {
									$summary.removeItem(streamName);
								}
							}

							// check selected participants to enable process button
							_validToProceed();

							// check if selected participants modified and set attribute

							$dialogContent.attr('data-relatedParticipantsModified', $selectedParticipants !== $(".Streams_preview_tool.Q_selected", dialog).map(function(){return this.id;}).get().join());
						});
					});

					$("button[name=AddParticipants]", dialog).on(Q.Pointer.fastclick, function () {
						var url = Q.getObject([streamType, "url"], state.relatedParticipants.participants);
						Q.handle(Q.url(url));
					});

					$("button[name=cancel]", dialog).on(Q.Pointer.fastclick, function () {
						Q.confirm(toolText.CloseEvent.confirm.text.Cancel, function (choice) {
							if (!choice) {
								return false;
							}

							Q.Dialogs.pop();
							tool.rsvp('no');
						},
						{ title: toolText.CloseEvent.button }
						);
					});

					var recurringValue = "justonce";
					var _proceed = function () {
						var selectedRelatedParticipants = [];

						// collect related participants
						var relatedParticipants = [];
						$(".Streams_preview_tool", dialog).each(function (index, element) {
							var previewTool = Q.Tool.from(element, "Streams/preview");

							if (!previewTool.state.streamName) {
								return;
							}

							var selected = element.classList.contains('Q_selected');
							relatedParticipants.push({
								toPublisherId: categoryPublisherId,
								toStreamName: categoryStreamName,
								fromPublisherId: previewTool.state.publisherId,
								fromStreamName: previewTool.state.streamName,
								selected: selected
							});

							if (selected) {
								selectedRelatedParticipants.push({
									publisherId: previewTool.state.publisherId,
									streamName: previewTool.state.streamName
								});
							}
						});

						// save related participants recurring
						if (recurringValue === "recurring") {
							Calendars.Recurring.setRecurring(tool.stream, {
								relatedParticipants: selectedRelatedParticipants
							});
						}

						var _relate = function () {
							var pipeItems = [];
							var itemsToRelate = [];
							var itemsToUnRelate = [];
							var pipeItemsUnRelate = [];
							Q.each(relatedParticipants, function (index, item) {
								pipeItems.push(item.fromPublisherId + ':' + item.fromStreamName);
							});
							var pipeToProcess = new Q.Pipe(pipeItems, function () {
								itemsToRelate = [];
								itemsToUnRelate = [];
								Q.Dialogs.pop();
								Q.handle(options.callback, null, [true]);
							});

							Q.each(relatedParticipants, function (index, item) {
								var alreadyParticipated = tool.alreadyRelated(relatedTool, item.fromPublisherId, item.fromStreamName);
								var pipeKey = item.fromPublisherId + ':' + item.fromStreamName;
								if (!item.selected && alreadyParticipated) {
									itemsToUnRelate.push(item);
									pipeItemsUnRelate.push(pipeKey);
								} else if (item.selected && !alreadyParticipated) {
									itemsToRelate.push(item);
								} else {
									pipeToProcess.fill(pipeKey)();
								}
							});

							// this pipe will process after unrelated all items
							var pipeToRelate = new Q.Pipe(pipeItemsUnRelate, function () {
								Q.each(itemsToRelate, function (i, item) {
									Q.Streams.relate(
										state.publisherId,
										state.streamName,
										streamType,
										item.fromPublisherId,
										item.fromStreamName,
										function () {}
									);
								});
							});

							// first unrelate items to get refunded credits
							if (pipeItemsUnRelate.length) {
								Q.each(itemsToUnRelate, function (i, item) {
									Q.Streams.unrelate(
										state.publisherId,
										state.streamName,
										streamType,
										item.fromPublisherId,
										item.fromStreamName,
										function () {
											pipeToRelate.fill(item.fromPublisherId + ':' + item.fromStreamName)();
										}
									);
								});
							} else {
								pipeToRelate.fill()();
							}

							// listen for Streams/related onRefresh
							if (itemsToRelate.length || itemsToUnRelate.length) {
								var key = relatedTool.state.onRefresh.set(function () {
									// check related items
									Q.each(itemsToRelate, function (i, item) {
										var pipeKey = item.fromPublisherId + ':' + item.fromStreamName;
										if (tool.alreadyRelated(relatedTool, item.fromPublisherId, item.fromStreamName)) {
											itemsToRelate.splice(i, 1);
											pipeToProcess.fill(pipeKey)();
										}
									});

									// check unrelated items
									Q.each(itemsToUnRelate, function (i, item) {
										var pipeKey = item.fromPublisherId + ':' + item.fromStreamName;
										if (!tool.alreadyRelated(relatedTool, item.fromPublisherId, item.fromStreamName)) {
											itemsToUnRelate.splice(i, 1);
											pipeToProcess.fill(pipeKey)();
										}
									});

									// if all items processed, remove this handler
									if (!itemsToRelate.length && !itemsToUnRelate.length) {
										relatedTool.state.onRefresh.remove(key);
									}
								}, tool);
							}
						};

						if (going !== 'yes') {
							return _relate();
						}

						// if credits need to pay, data-amount will be negative. And opposite if credits returned.
						var needCredits = -1 * parseInt($(".summary", $summary).attr("data-amount")) || 0;
						var currentCredits = Q.Assets.Credits.amount;
						if (!state.isAdmin && needCredits > currentCredits) {
							Q.Dialogs.pop();
							Q.Assets.Payments.stripe({
								amount: 0, // needCredits - currentCredits,
								currency: options.currency || 'USD',
								reason: 'EventParticipation',
								onSuccess: function () {
									
								},
							}, function(err, data) {
								if (err) {
									return;
								}
								_relate();
							});
							return;
						}

						_relate();
					};

					$buttonProceed.on(Q.Pointer.fastclick, function () {
						var $this = $(this);

						$this.addClass("Q_working");

						if ($dialogContent.attr("data-recurring") === "false") {
							return _proceed();
						}

						Q.confirm(tool.text.event.tool.UpdateFutureReservations, function (reply) {
							recurringValue = reply ? "recurring" : "justonce";
							_proceed();
						},{
							title: tool.text.event.tool.ManageReservation,
							ok: tool.text.event.tool.Yes,
							cancel: tool.text.event.tool.No,
							noClose: true
						});
					});

					// set recurring controls default selected
					Calendars.Recurring.getRecurringData(tool.stream, function (data) {
						var relatedParticipants = Q.getObject(["userRecurring", "relatedParticipants"], data);
						var defaultState = Q.isEmpty(relatedParticipants) ? "justonce" : "recurring";
						$(".Calendars_recurring_dialog_controls > [data-value=" + defaultState + "]", $dialogContent).addClass("Q_selected");

						var contentDefaultState = true;
						if (Q.isEmpty(Q.getObject(["userRecurring", "days"], data))) {
							contentDefaultState = false;
						}
						$dialogContent.attr("data-recurring", contentDefaultState);
					});
				},
				onClose: function () {
					Q.handle(options.callback, null, [false]);
				}
			});

			//var participant = Q.getObject(streamType, toolText.StreamsTypesReadable) || 'participant';
		});
	},
	/**
	 * Check if required participants related to event
	 * @method checkRelatedParticipants
	 * @param {array|string} checkStreamType Check exactly type. If null - check all types.
	 * @return boolean
	 */
	checkRelatedParticipants: function (checkStreamType) {
		var tool = this;
		var result = true;

		checkStreamType = checkStreamType || tool.stream.getAttribute("requiredParticipants");

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
				return console.warn(streamType + " relation required, but related tool empty");
			}

			if (Q.isEmpty(tool.getMyRelations(relatedTool))) {
				result = false;
			}
		});

		return result;
	},
	/**
	 * Get from Streams/related tool only relations published by current user
	 * @method getMyRelations
	 * @param {Q.Tool} relatedTool
	 * @return {array} Array of objects
	 */
	getMyRelations: function (relatedTool) {
		var userId = Q.Users.loggedInUserId();
		var res = [];

		relatedTool.$(".Streams_preview_tool").each(function () {
			var relatedPreview = Q.Tool.from(this, "Streams/preview");
			if (Q.getObject("state.publisherId", relatedPreview) !== userId) {
				return;
			}

			res.push(relatedPreview.state);
		});

		return res;
	},
	/**
	 * Check if stream already related to relatedParticipants
	 * @method alreadyRelated
	 * @param {object} relatedTool
	 * @param {string} publisherId
	 * @param {string} streamName
	 */
	alreadyRelated: function (relatedTool, publisherId, streamName) {
		var alreadyParticipated = false;

		Q.each(this.getMyRelations(relatedTool), function (i, previewState) {
			if (previewState.publisherId === publisherId && previewState.streamName === streamName) {
				alreadyParticipated = true;
			}
		});

		return alreadyParticipated;
	},
	/**
	 * Make RSVP action
	 * @method rsvp
	 * @param {string} rsvp yes, no, maybe
	 * @param {function} callback called on success
	 * @param {Object} options any options to pass to Q.Users.login()
	 */
	rsvp: function (rsvp, callback, options) {
		var tool = this;
		var $te = $(this.element);
		var state = this.state;
		var paymentType = Q.getObject("payment.type", state);
		var paymentAmount = Q.getObject("payment.amount", state);
		var paymentCurrency = Q.getObject("payment.currency", state);
		var userId = Users.loggedInUserId();
		if (!userId) {
			var redirectUrl = Q.url(["event", state.publisherId, state.streamName.split('/').pop()].join('/') + "?rsvp=yes");
			Q.Users.login(Q.extend({
				successUrl: redirectUrl
			}, options));
			Q.Users.onComplete.setOnce(function () {
				Q.handle(redirectUrl);
			});

			Q.handle(callback, tool, [false]);
			return false;
		}

		// if rsvp already changed, do nothing
		if ($te.attr('data-going') === rsvp) {
			Q.handle(callback, tool, [false]);
			return false;
		}

		var isPublisher = userId === state.publisherId;

		var _saveGoingCallback = function () {
			tool.going(rsvp);
			Q.handle(tool.state.onGoing, tool, [rsvp, tool.stream]);
		};

		tool.$rsvpElement.addClass('Q_working');

		if (rsvp === 'no') {
			return _saveGoing(rsvp).then(_saveGoingCallback).catch(function () {
				tool.$rsvpElement.removeClass('Q_working');
			});
		}

		// prepayment mode
        if (rsvp === 'yes' && tool.modePrepayment) {
			if (state.payment && state.payment.isAssetsCustomer) {
				return tool.rsvp('maybe', callback, options);
			}

			Q.confirm(tool.text.event.tool.PrepaymentConfirm, function (result) {
				if (!result) {
					tool.$rsvpElement.removeClass('Q_working');
					Q.handle(callback, tool, [false]);
					return;
				}

				Q.Assets.Payments.stripe({
					amount: 1,
					currency: 'USD',
					description: tool.text.event.tool.Prepayment
				}, function(err, data) {
					if (err) {
						tool.$rsvpElement.removeClass('Q_working');
						Q.handle(callback, tool, [false]);
						return;
					}
                    state.payment.isAssetsCustomer = true;
					tool.rsvp('maybe', callback, options);
				});
			});
            return;
        }

		// check if required related participants added
		if (!tool.checkRelatedParticipants()) {
			tool.addRelatedParticipants({
				callback: function (process) {
					if (process) {
						tool.rsvp(rsvp, callback);
					} else {
						Q.handle(callback, tool, [false]);
					}
				}
			});

			return false;
		}

		if (isPublisher || state.isAdmin || !state.payment || rsvp === 'maybe') {
			return _saveGoing(rsvp).then(_saveGoingCallback);
		}

		var summary = paymentAmount || 0;
		var paymentDetails = [
			{userId: userId, amount: paymentAmount}
		];

		if (paymentType === 'optional') {
			_donate().catch(function(err){
				err && console.warn(err);
			}).then(function(){
				tool.getPaymentInfo();
				tool.$rsvpElement.removeClass('Q_working');
				Q.handle(state.onPaid, tool);
			});
			return _saveGoing(rsvp).then(_saveGoingCallback);
		}

		// collect payment for related participants
		Q.each(state.relatedParticipants.participants, function (streamType, data) {
			var relatedTool = Q.getObject("relatedTool", data);
			if (!relatedTool) {
				return console.warn(streamType + " relation, but related tool empty");
			}
			var relations = tool.getMyRelations(relatedTool);
			var amountParticipants = Q.getObject("length", relations) || 0;
			summary += (amountParticipants * paymentAmount);

			// collect payments details for all related streams
			if (amountParticipants) {
				Q.each(relations, function (index, previewState) {
					paymentDetails.push({
						publisherId: previewState.publisherId,
						streamName: previewState.streamName,
						amount: paymentAmount
					});
				});
			}

		});

		_pay(function(err, data) {
			_saveGoing(rsvp).then(_saveGoingCallback);
			Q.handle(state.onPaid, tool);
		}, function() {
			tool.$rsvpElement.removeClass('Q_working');
			Q.handle(callback, tool, [false]);
		});

		function _saveGoing(dataGoing) {
			var fields = {
				publisherId: state.publisherId,
				eventId: state.streamName.split('/').pop(),
				going: dataGoing,
				clientId: Q.clientId()
			};

			var statusChanged = $te.attr('data-going') !== dataGoing;
			if (statusChanged) {
				$te.attr('data-going', dataGoing);
			}

			return new Q.Promise(function(resolve, reject){
				if (!statusChanged) {
					return reject("status has not changed");
				}

				Q.req('Calendars/going', '', function (err, response) {
					Streams.Stream.refresh(state.publisherId, state.streamName, function () {
						tool.stream = this;

						var r = response && response.errors;
						var msg = Q.firstErrorMessage(err, r);
						if (msg) {
							Q.alert(msg, {title: "Sorry"});
							return reject(msg);
						}

						Q.handle(callback, tool, [true]);
						resolve(response);
					}, {
						withParticipant: true,
						messages: true,
						unlessSocket: true
					});
				}, {
					method: 'post',
					fields: fields
				});
			});
		}

		function _donate() {
			var cacheKey = Q.Cache.key([state.publisherId, state.streamName, "donation"].join('.'));
			var cache = Q.Cache.session(cacheKey);

			return new Q.Promise(function(resolve, reject){
				Q.Template.render('Calendars/event/payment',
					{
						content: tool.text.payment.confirmationDialog.content.interpolate({
							amount: paymentAmount + ' ' + paymentCurrency
						}),
						button: tool.text.payment.confirmationDialog.button + ' '
					},
					function (err, html) {
						if (err) {
							return reject(err);
						}

						if (Q.getObject(['subject'], cache.get(cacheKey))) {
							return reject();
						}

						Q.Dialogs.push({
							className: 'Q_dialog_audio',
							title: tool.text.payment.confirmationDialog.title,
							content: html,
							destroyOnClose: true,
							onActivate : function (dialog) {
								$('.Payment-confirmation-button', dialog).on(Q.Pointer.fastclick, function(){
									Q.Dialogs.pop();
									resolve(_pay());
									return false;
								});
							},
							onClose: function () {
								cache.set(cacheKey, 0, true);
							}
						});
					}
				);
			});
		}

		function _pay(resolve, reject) {
			Q.Assets.pay({
				amount: summary,
				currency: paymentCurrency,
				toStream: {
					publisherId: state.publisherId,
					streamName: state.streamName
				},
				items: paymentDetails,
				onSuccess: resolve,
				onFailure: reject,
			});
		}
	},
	/**
	 * Check which elements to show and set appropriate state.show
	 * @method setShow
	 */
	setShow: function (callback) {
		var tool = this;
		var state = this.state;

		// check event type
		state.show.eventType = !!tool.stream.getAttribute("eventType");

		// don't show rsvp for started events
		state.show.rsvp = parseInt(tool.stream.getAttribute('startTime')) * 1000 > Date.now();

		// check if user is publisher or admin for current community
		if (state.isAdmin) {
			state.show.checkin = true;
			state.show.closeEvent = true;

			// if event is recurring and user have admin permissions, show adminRecurring button
			if (Q.getObject(["relatedFromTotals", 'Calendars/recurring'], tool.stream)) {
				state.show.adminRecurring = true;
			}
		} else {
			state.show.myqr = !!(tool.stream.participant && tool.stream.participant.testRoles('attendee'));
		}
		tool.$(".Calendars_info .Calendars_aspect_myqr")[state.show.myqr ? "slideDown" : "slideUp"](300);

		// check if links exist
		state.show.moreInfo = !!tool.stream.getAttribute('eventUrl');

		// check if links exist
		state.show.registration = !!tool.stream.getAttribute('ticketsUrl');

		if (state.show.participants === false && tool.stream.testReadLevel('participants')) {
			state.show.participants = true;
		} else if (state.show.participants === 'publishers') {
			state.show.participants = state.isAdmin;
		} else {
			state.show.participants = false;
		}

		state.show.chat = tool.stream.testReadLevel('messages');
		tool.$(".Calendars_info .Streams_aspect_chats")[state.show.chat ? "slideDown" : "slideUp"](300);

		// if event location undefined, hide location section
		if (Q.plugins.Travel
		&& Q.getObject("fields.location", tool.stream)
		&& (tool.stream.testWriteLevel(40) || tool.stream.testPermission('Places/location'))) {
			state.show.location = true;
			state.show.trips = true;
		} else {
			state.show.location = false;
			state.show.trips = false;
		}
		tool.$(".Calendars_info .Travel_aspect_trips")[state.show.trips ? "slideDown" : "slideUp"](300);
		tool.$(".Calendars_info .Q_aspect_where")[state.show.location ? "slideDown" : "slideUp"](300);

		state.livestream = tool.stream.getAttribute('livestream');
		// if event location undefined, hide location section
		if (state.livestream && (tool.stream.testWriteLevel(40) || tool.stream.testPermission('Media/livestream'))) {
			state.show.livestream = {
				state: tool.livestreamState(),
				remote: !!state.livestream.matchTypes('url').length
			};
		} else {
			state.show.livestream = false;
		}
		tool.$(".Calendars_info .Q_aspect_conference")[state.show.livestream ? "slideDown" : "slideUp"](300);

		// if config Calendats/event/reminders empty, it's no sense to show it
		if (tool.stream.participant && tool.stream.participant.testRoles('attendee')) {
			state.show.reminders = !Q.isEmpty(Q.getObject("Event.reminders", Calendars));
		} else {
			state.show.reminders = false;
		}
		tool.$(".Calendars_info .Q_aspect_reminders")[state.show.reminders ? "slideDown" : "slideUp"](300);

		state.show.presentation = tool.stream.testWriteLevel(40) || tool.stream.testPermission('Media/presentation');
		tool.$(".Calendars_info .Streams_aspect_presentation")[state.show.presentation ? "slideDown" : "slideUp"](300);
	},
	/**
	 * Make all needed actions if rsvp changed.
	 * @method going
	 */
	going: function (g, duringRefresh) {
		g = g || "no";
		var tool = this;

		tool.setShow();

		$(tool.element).attr('data-going', g);

		tool.$('.Calendars_going [data-going=' + g + ']')
			.addClass('Q_selected')
			.siblings().removeClass('Q_selected');

		if (g === 'no' && !duringRefresh) {
			_checkTrips();
		}

		$(".Calendars_going_prompt .Calendars_going", tool.element).removeClass('Q_working');

		/**
		 * Check if user is driver to some trip related to this event
		 * and if yes - ask user if he want to close these trips.
		 * @method _checkTrips
		 */
		function _checkTrips () {
			var $tripsAspectDiv = tool.$('.Calendars_info > .Travel_aspect_trips');
			var $tripsToolDiv = $tripsAspectDiv.length ? $(".Travel_trips_tool", $tripsAspectDiv) : null;

			if (!$tripsToolDiv || !$tripsToolDiv.length) {
				return;
			}

			var tripsTool = Q.Tool.from($tripsToolDiv, "Travel/trips");
			var tripsState = tripsTool.state;

			if (!tripsTool || !(tripsState.driverTripTo || tripsState.driverTripFrom)) {
				return;
			}

			Q.each([tripsState.driverTripTo, tripsState.driverTripFrom], function (index, tripInfo) {
				// if trip TO exist
				if (typeof tripInfo === 'object' && tripInfo.publisherId && tripInfo.streamName) {
					var confirmText = tool.closeEventConfirm.trip.Cancel.interpolate({
						tripDirection: tripInfo.type === "Travel/to"
							? tool.closeEventConfirm.directions.TO
							: tool.closeEventConfirm.directions.FROM
					});

					// get array of user id participated
					var participants = tripInfo.participants && Object.keys(tripInfo.participants);
					participants = participants || [];

					// exclude driver from participants array
					var i = participants.indexOf(tripInfo.publisherId);
					if (i >= 0) {
						participants.splice(i, 1);
					}

					// add participants text if participants exist
					if (participants.length) {
						confirmText += " " + tool.closeEventConfirm.trip.Passengers.interpolate({
							passengerCount: participants.length
						});
					}

					Q.confirm(confirmText, function (choice) {
							if (!choice) {
								return false;
							}

							Travel.Trip.discontinue(tripInfo.publisherId, tripInfo.streamName);
						},
						{ title: tool.closeEventConfirm.trip.Title }
					);
				}
			});
		}
	},
	/**
	 * Allow admins update participants roles
	 * @method handleRoles
	 * @param {string} userId
	 * @param {Element|jQuery} element
	 */
	handleRoles: function (userId, element) {
		var tool = this;
		var state = this.state;

		if (!state.isAdmin) {
			return;
		}

		Q.req("Calendars/event", ["roles"], function (err, response) {
			if (Q.firstErrorMessage(err, response && response.errors)) {
				return;
			}

			var roles = ['requested', 'attendee'];
			Q.Template.render('Calendars/event/roles', {
				roles
			}, function (err, html) {
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
							$this.addClass('Q_selected').siblings().removeClass('Q_selected');
						}
					}, {
						method: "PUT",
						fields: {
							publisherId: state.publisherId,
							streamName: state.streamName,
							userId,
							roles,
							role: $this.attr("data-role")
						}
					});

				});
				$(element).append($html);
			});
		}, {
			fields: {
				publisherId: state.publisherId,
				streamName: state.streamName,
				userId
			}
		});
	},
	Q: {
		beforeRemove: function () {

		}
	}
});

Q.Template.set('Calendars/event/tool',
'<div class="Calendars_event_curtain">' +
	'<div class="Q_tool Streams_preview_tool Streams_image_preview_tool Streams_internal_preview" ' +
	'{{#if icon}}' +
	' data-icon-src="{{icon}}"' +
	'{{/if}}' +
	'data-streams-preview=\'{"publisherId":"{{stream.fields.publisherId}}","streamName":"{{stream.fields.name}}", "cacheBust": false, "closeable": false, "imagepicker": {"cacheBust": false, "showSize": "500x", "save": "Calendars/event", "saveSizeName": "Calendars/event"}}\'>' +
	'</div></div>' +
	'{{#if show.hosts}}' +
	'  <div class="Calendars_event_hosts">' +
	'    {{{tool "Users/avatar" icon=1000 userId=stream.fields.publisherId className="Calendars_event_publisher" templates-contents-name="Calendars/event/hosts/avatar/contents"}}}' +
	'  </div>' +
	'{{/if}}' +
	'{{#if show.participants}}' +
	'<div class="Calendars_event_participants"></div>' +
	'{{/if}}' +
	'{{#if show.rsvp}}' +
	'	<div class="Q_big_prompt Calendars_going_prompt">' +
	'		{{text.event.tool.AreYouIn}}' +
	'		<span class="Calendars_going">' +
	'			<span data-going="no" class="Calendars_no {{no}}">{{text.event.tool.No}}</span>' +
	'			<span data-going="maybe" class="Calendars_maybe {{maybe}}">{{text.event.tool.Maybe}}</span>' +
	'			<span data-going="yes" class="Calendars_yes {{yes}}">{{text.event.tool.Yes}}</span>' +
	'		</span>' +
	'	</div>' +
	'{{/if}}' +
	'<div class="Calendars_info">' +
	'	<div class="Q_button Streams_aspect_presentation" {{#ifEquals show.presentation false}}style="display:none"{{/ifEquals}} data-invoke="presentation">' +
	'		<div class="Calendars_info_icon"><i class="qp-calendars-livestream"></i></div>' +
	'		<div class="Calendars_info_content">{{text.event.tool.Presentation}}</div>' +
	'		<div class="Calendars_info_unseen" data-state="waiting"></div>' +
	'	</div>' +
	'	<div class="Q_button Media_aspect_webrtc" data-invoke="webrtc">' +
	'		<div class="Calendars_info_icon"><i class="qp-calendars-livestream"></i></div>' +
	'		<div class="Calendars_info_content"></div>' +
	'	</div>' +
	'	<div class="Q_button Streams_aspect_chats" {{#ifEquals show.chat false}}style="display:none"{{/ifEquals}} data-invoke="chat">' +
	'		<div class="Calendars_info_icon"><i class="qp-calendars-conversations"></i></div>' +
	'		<div class="Calendars_info_content">{{text.event.tool.Conversation}}</div>' +
	'		<div class="Calendars_info_unseen" data-state="waiting"></div>' +
	'	</div>' +
	'{{#if show.moreInfo}}' +
	'	<div class="Q_button Streams_aspect_info" data-invoke="moreInfo">' +
	'		<div class="Calendars_info_icon"><i class="qp-calendars-about"></i></div>' +
	'		<div class="Calendars_info_content">{{text.event.tool.MoreInfo}}</div>' +
	'	</div>' +
	'{{/if}}' +
	'{{#if show.registration}}' +
	'	<div class="Q_button Streams_aspect_registration" data-invoke="registration">' +
	'		<div class="Calendars_info_icon"><i class="qp-calendars-events"></i></div>' +
	'		<div class="Calendars_info_content">{{text.event.tool.Registration}}</div>' +
	'	</div>' +
	'{{/if}}' +
	'{{#if show.promote}}' +
	'	<div class="Q_button Streams_aspect_promote" data-invoke="promote">' +
	'		<div class="Calendars_info_icon"><i class="qp-calendars-promote"></i></div>' +
	'		<div class="Calendars_info_content">{{text.event.tool.Promote}}</div>' +
	'	</div>' +
	'{{/if}}' +
	'{{#if show.checkin}}' +
	'	<div class="Q_button Calendars_aspect_checkin Calendars_aspect_admin" data-invoke="checkin">' +
	'		<div class="Calendars_info_icon"><i class="qp-communities-qrcode"></i></div>' +
	'		<div class="Calendars_info_content">{{text.event.tool.Checkin}}</div>' +
	'	</div>' +
	'{{/if}}' +
	'	<div class="Q_button Calendars_aspect_myqr" {{#ifEquals show.myqr false}}style="display:none"{{/ifEquals}} data-invoke="myqr">' +
	'		<div class="Calendars_info_icon"><i class="qp-communities-qrcode"></i></div>' +
	'		<div class="Calendars_info_content">{{text.event.tool.Myqr}}</div>' +
	'	</div>' +
	'{{#if show.trips}}' +
	'	<div class="Q_button Travel_aspect_trips" {{#ifEquals show.trips false}}style="display:none"{{/ifEquals}}>' +
	'		<div class="Calendars_info_buttons">{{{tool "Travel/trips" publisherId=stream.fields.publisherId streamName=stream.fields.name}}}</div>' +
	'	</div>' +
	'{{/if}}' +
	'{{#if show.time}}' +
	'	<div class="Q_button Q_aspect_when" data-invoke="time">' +
	'		<div class="Calendars_info_icon"><i class="qp-calendars-time"></i></div>' +
	'		<div class="Calendars_info_content">' +
	'			{{{tool "Q/timestamp" "start" capitalized=true relative=false time=startTime}}}{{#if endTime}}, {{text.event.composer.Ending}} <div class="Calendars_event_endTime"></div>{{/if}}' +
	'		</div>' +
	'		<div class="Calendars_recurring_setting"></div>' +
	'	</div>' +
	'{{/if}}' +
	'	<div class="Q_button Q_aspect_reminders" {{#ifEquals show.reminders false}}style="display:none"{{/ifEquals}} data-invoke="reminders">' +
	'		<div class="Calendars_info_icon"><i class="qp-calendars-alarm"></i></div>' +
	'		<div class="Calendars_info_content">{{text.event.tool.Reminders}}</div>' +
	'	</div>' +
	'	<div class="Q_button Q_aspect_where" {{#ifEquals show.location false}}style="display:none"{{/ifEquals}} data-invoke="local">' +
	'		<div class="Calendars_info_icon"><i class="qp-calendars-locations"></i></div>' +
	'		<div class="Calendars_info_content">' +
	'			<div class="Calendars_location_venue" data-redundant={{venueRedundant}}>{{location.venue}}</div>' +
	'			<div class="Calendars_location_address">{{location.address}}</div>' +
	'			<div class="Calendars_location_area">{{location.area.title}}</div>' +
	'		</div>' +
	'	</div>' +
	'	<div class="Q_button Q_aspect_conference" {{#ifEquals show.livestream false}}style="display:none"{{/ifEquals}} data-invoke="livestream">' +
	'		<div class="Calendars_info_icon"><i class="qp-calendars-livestream"></i></div>' +
	'		<div class="Calendars_info_content" data-livestreamState="{{show.livestream.state}}" data-livestreamRemote="{{show.livestream.remote}}">' +
	'			{{{tool "Q/timestamp" "start" capitalized=true time=startTime}}}' +
	'			<div class="Calendars_event_startLiveStream">{{text.event.tool.StartLiveStream}}</div>' +
	'			<div class="Calendars_event_LiveStreamEnded">{{text.event.tool.LiveStreamEnded}}</div>' +
	'			<div class="Calendars_event_LiveStreamRecording">{{text.event.tool.ClickToViewRecording}}</div>' +
	'		</div>' +
	'	</div>' +
	'{{#if show.interests}}' +
	'	<div class="Q_button Streams_aspect_interests" data-invoke="interests">' +
	'		<div class="Calendars_info_icon"><i class="qp-calendars-interests"></i></div>' +
	'		<div class="Calendars_info_content">' +
	'		{{#each interestTitles}}' +
	'			{{this}}<br />' +
	'		{{/each}}' +
	'		</div>' +
	'	</div>' +
	'{{/if}}' +
	'{{#if relatedParticipants}}' +
	'	{{#each relatedParticipants}}' +
	'	<div class="Q_button Streams_aspect_relatedParticipants" data-streamType="{{@key}}" data-categoryInfo="{{{json this}}}">' +
	'		<div class="Calendars_info_icon"><i class="qp-calendars-{{#replace "/" "-"}}{{@key}}{{/replace}}"></i></div>' +
	'		<div class="Calendars_info_content"></div>' +
	'	</div>' +
	'	{{/each}}' +
	'{{/if}}' +
	'{{#if show.eventType}}' +
	'	<div class="Q_button Calendars_aspect_eventType" data-invoke="eventType">' +
	'		<div class="Calendars_info_icon"><i class="qp-calendars-events"></i></div>' +
	'		<div class="Calendars_info_content"></div>' +
	'	</div>' +
	'{{/if}}' +
	'{{#if show.adminRecurring}}' +
	'	<div class="Q_button Calendars_aspect_recurring Calendars_aspect_admin">' +
	'		<div class="Calendars_info_icon"><i class="Calendars_composer_recurring_admin"></i></div>' +
	'		<div class="Calendars_info_content">{{text.event.tool.RecurringAdmin}}</div>' +
	'	</div>' +
	'{{/if}}' +
	'{{#if show.closeEvent}}' +
	'	<div class="Q_button Calendars_aspect_close Calendars_aspect_admin" data-invoke="close">' +
	'		<div class="Calendars_info_icon"><img alt="Close Event" src=\'{{toUrl "Q/plugins/Calendars/img/white/close.png"}}\'></div>' +
	'		<div class="Calendars_info_content">{{text.event.tool.CloseEvent.button}}</div>' +
	'	</div>' +
	'{{/if}}' +
	'{{#if show.openTo}}' +
	'	<div class="Calendars_participants_info">' +
	'	{{text.event.tool.OpenTo}} {{peopleMin}} - {{peopleMax}} {{labelTitles}}</div>' +
	'{{/if}}' +
	'<div class="Calendars_participants_info Calendars_payment" style="display: none">' +
	'	<div class="Calendars_info_content Calendars_payment_info">{{payment.content}}</div>' +
	'</div>' +
	 // '{{#if authorizedToEdit}}' +
	'	<div class="Calendars_event_title">' +
	'		<div class="Calendars_event_title_label">{{text.event.tool.TitleOfEvent}}</div>' +
	'		{{{tool "Streams/inplace" "title" field="title" inplaceType="text" inplace-placeholder="Title of event or activity" inplace-selectOnEdit=true publisherId=stream.fields.publisherId streamName=stream.fields.name}}}' +
	'	</div>' +
	'	<div class="Calendars_variable_height Calendars_event_description">' +
	'		{{{tool "Streams/inplace" "content" inplaceType="textarea" inplace-placeholder="Enter a description of this event or activity" inplace-selectOnEdit=false publisherId=stream.fields.publisherId streamName=stream.fields.name}}}' +
	'	</div>' +
	 // '{{/if}}' +
	'</div>'
);

Q.Template.set('Calendars/event/AddParticipants',
	'<h3>{{text.event.tool.YouReservingPlace}}</h3>' +
	'<h3>{{SelectIncludesToAdd}}</h3>' +
	'{{#if warning}}' +
	'	<div class="Streams_related_participant_warning">{{warning}}</div>' +
	'{{/if}}' +
	'<div class="Streams_related_participant"></div>' +
	'<table class="Streams_related_participant_summary" data-showMath="{{showMath}}">' +
	'	<thead><tr><th >{{text.event.tool.Name}}</th><th class="currency">{{currency}}</th></tr></thead>' +
	'	<tbody></tbody>' +
	'	<tfoot><tr><td>{{text.event.tool.Total}}</td><td class="summary"></td></tr></tfoot>' +
	'</table>' +
	'<button class="Q_button" name="AddParticipants">{{AddParticipants}}</button>' +
	'<button class="Q_button" name="proceed">{{Proceed}}</button>' +
	'<button class="Q_button" name="cancel">{{text.event.tool.CancelReservation}}</button>'
);

Q.Template.set('Calendars/event/payment',
	'<div class="Q_big_prompt" style="text-align: center">' +
	'<div class="Payment-confirmation-content">{{content}}</div><br>' +
	'<div class="Q_clickable_stretcher Q_clickable_sized">' +
	'<a class="Q_button Payment-confirmation-button">{{button}}</a>'+
	'</div>' +
	'</div>'
);

Q.Template.set('Calendars/event/reminders',
	'<h2>{{text.RemindersLabel}}</h2>' +
	'{{#each remindersConfig}}' +
	'	<label><input type="checkbox" {{this.checked}} value="{{@key}}">{{this.name}}</label>' +
	'{{/each}}'
);

Q.Template.set('Calendars/event/roles',
`<div class="Calendars_event_roles">
	<h2>Roles management</h2>
	{{#each roles}}
		<div data-role="{{this}}">{{this}}</div>		
	{{/each}}
</div>`
);

})(Q, Q.jQuery, window);