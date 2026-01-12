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

	tool.modePrepayment && $toolElement.attr("data-modePrepayment", tool.modePrepayment);
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

	Q.each(['yes', 'no', 'maybe'], function (i, going) {
		Streams.Stream.onMessage(state.publisherId, state.streamName, 'Calendars/going/'+going)
		.set(function(message) {
			if (message.byUserId === userId) {
				tool.updateInterface(going);
			}
		}, tool);
	});

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
		console.trace();
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
				icon: state.icon || tool.stream.iconUrl('1000x'),
				peopleMin: tool.stream.getAttribute('peopleMin') || Q.getObject("Event.defaults.peopleMin", Calendars) || 0,
				peopleMax: tool.stream.getAttribute('peopleMax') || Q.getObject("Event.defaults.peopleMax", Calendars) || 100,
				labelTitles: labelTitles,
				relatedParticipants: state.relatedParticipants.participants,
				authorizedToEdit: stream.testWriteLevel('edit'),
				text: tool.text,
				icons: tool.icons
			});

			Q.Template.render('Calendars/event/tool', fields, function (err, html) {
				if (err) {
					return;
				}
				Q.replace(tool.element, html);

				var $participants = $(".Calendars_event_participants", tool.element);
				if ($participants.length && tool.stream && tool.stream.fields.participatingCount >= fields.peopleMin) {
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
						},
						avatar: {
							icon: '40',
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

						tool.participant = participant;

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
				
				if (state.teleconference) {
					tool.teleconferenceManager = tool.manageTeleconference();
				}

				tool.manageLivestream();

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

				tool.$goingElement = $(".Calendars_going_prompt .Calendars_going", tool.element);
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
			fields: ['subscriptionRules', 'subscriptionRules'],
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
						$participants[0].style.display = 'flex';
					} else {
						$participants[0].style.display = 'none';
						// TODO: close events once everyone leaves?
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
						tool.updateInterface('no', true);
					} else {
						tool.updateInterface(participant && participant.getExtra('going'), true);
					}
				});
			} else {
				tool.updateInterface('no', true);
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

			// force going if defined in GET params
			var going = new URLSearchParams(window.location.search).get('going');
			if (going) {
				tool.updateInterface(going);
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

				Calendars.Event.updateParticipants({
					tool: tool,
					userId: participant.userId,
					type: (function () {
						if (participant.testRoles('leader')) {
							return 'leader';
						} else if (participant.testRoles('host')) {
							return 'host';
						} else if (participant.testRoles('speaker')) {
							return 'speaker';
						} else if (participant.testRoles('staff')) {
							// logged user is a staff in this event
							if (Q.Users.loggedInUserId() === participant.userId) {
								$te.attr("data-staff", true);
							}

							return 'staff';
						}
					})()
				});

				if (Q.getObject(['checkin'], extra)) {
					Calendars.Event.updateParticipants({
						tool: tool,
						userId: participant.userId,
						type: 'checkin'
					});
				}

				Calendars.Event.updateParticipants({
					tool: tool,
					userId: participant.userId,
					type: (function () {
						if (participant.testRoles('rejected')) {
							return 'rejected';
						} else if (participant.testRoles('requested')) {
							return 'requested';
						} else if (participant.testRoles('registered')) {
							return 'registered';
						}
					})()
				});

				if (Q.getObject("type", tool.stream.getAttribute('payment')) === 'required') {
					Calendars.Event.updateParticipants({
						tool: tool,
						userId: participant.userId,
						type: (function () {
							switch (Q.getObject(['paid'], extra)) {
								case 'reserved':
									return 'paid-reserved';
								case 'fully':
									return 'paid-fully';
								case 'no':
									return 'paid-no';
							}
						})()
					});
				}
			});
		}
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
	 * Check if teleconference happening or ended and set appropriate attributes
	 * @method teleconferenceState
	 * @return string
	 */
	teleconferenceState: function () {
		var teleconferenceState = 'waiting';
		if (this.eventEnded()) {
			teleconferenceState = 'ended';
		} else if (this.eventIsHappening()) {
			teleconferenceState = 'happening';
			/* if (this.state.autoStartWebrtc) {
				this.startWebRTC();
			} */
		}

		$(".Q_aspect_conference .Calendars_info_content", this.element).attr('data-teleconferenceState', teleconferenceState);

		return teleconferenceState;
	},
	manageTeleconference: function () {
		var tool = this;
		var state = tool.state;
		var schedulerButton = $(".Calendars_event_scheduler_tool", tool.element);
		var enterRoomButton = $(".Calendars_event_scheduler_join", tool.element);
		var participantsListContainer = tool.element.querySelector('.Q_aspect_conference_users_list');
		var webrtcParticipantsList = {};
		handleUIEvents();
		trackEventStart();
		
		//check if there is WebRTC stream. It should exist if the host checked "teleconference" checkbox while creating the event.
		//this WebRTC stream should have at least readlevel=10 to be visible by Q.Streams.related
		
		Q.Streams.related(tool.state.publisherId, tool.state.streamName, 'Calendars/event/webrtc', true, { dontFilterUsers: true/* , participants: 100  */}, function () {
			let webrtcStream;
			for (let i in this.relatedStreams) {
				if (this.relatedStreams[i].fields.type == 'Media/webrtc') {
					webrtcStream = this.relatedStreams[i];
					break;
				}
			}
			if (!webrtcStream) {
				//Q.alert('WebRTC stream not found.')
				return;
			}

			//Even though I called Q.Streams.related I have to call Q.Streams.get as Q.Streams.related doesn't work with "participants" param correctly (I need to get list of participants)
			Q.Streams.get(webrtcStream.fields.publisherId, webrtcStream.fields.name, function (err, stream, extra) {
				if(!stream) {
					console.warn('WebRTC stream not found')
					return;
				}
				tool.webrtcStream = stream;

				updateUIAccordingEventState();
				askToJoinTeleconferenceIfHappening();
				trackWebRTCParticipants(Object.keys(extra.participants));
			}, { participants: 20 });			
		});

		function trackEventStart() {
			var toolKey = 'online-event-start_' + tool.id;
			if (detectToolInit() === false) {
				let onTimeStampToolEvent = Q.Tool.onActivate('Q/timestamp');
				onTimeStampToolEvent.add(function () {
					askToJoinTeleconferenceIfHappening();
					if (detectToolInit()) {
						onTimeStampToolEvent.remove(toolKey)
					}
				}, toolKey);
			}

			function detectToolInit() {
				var teleconferenceTimestampTool = Q.Tool.from($("div[data-invoke=teleconference] .Q_timestamp_tool", $(tool.element)), "Q/timestamp");
				if (teleconferenceTimestampTool) {
					teleconferenceTimestampTool.state.beforeRefresh.set(function (result, diff) {
						updateTeleconferenceState();
						askToJoinTeleconferenceIfHappening();
					}, toolKey);

					return true;
				}
				return false;
			}
	}

		function trackWebRTCParticipants(initParticipantsIds) {
			if (!tool.webrtcStream || !tool.webrtcStream.testReadLevel('participants') || !participantsListContainer) return;

			tool.webrtcStream.onMessage("Streams/joined")
				.add(function (message) {
					if (avatarExists(message.byUserId)) {
						return;
					}

					addAvatar(message.byUserId, true);
				});
			tool.webrtcStream.onMessage("Streams/left")
				.add(function (message) {
					if (!avatarExists(message.byUserId)) {
						return;
					}

					removeAvatar(message.byUserId);

				});

			for (let i in initParticipantsIds) {
				addAvatar(initParticipantsIds[i]);
			}

			function avatarExists(userId) {
				return webrtcParticipantsList[userId] != null;
			}

			function addAvatar(userId) {
				let container = document.createElement('DIV');
				container.className = 'Q_aspect_conference_users_item';

				Q.Streams.Avatar.get(userId).then(function (avatar) {
					let name = avatar.displayName();
					let iconUrl = avatar.iconUrl();

					let description = document.createElement('DIV');
					description.className = 'Calendars_webrtc_notice_desc';
					container.appendChild(description);

					let avatarContainer = document.createElement('DIV');
					avatarContainer.className = 'Calendars_webrtc_notice_avatar';
					description.appendChild(avatarContainer);
					let avatarImg = document.createElement('IMG');
					avatarImg.src = iconUrl;
					avatarContainer.appendChild(avatarImg);

					let descriptionContainer = document.createElement('DIV');
					descriptionContainer.className = 'Q_aspect_conference_list_item_user';
					descriptionContainer.innerHTML = name;
					description.appendChild(descriptionContainer);

					let buttonContainer = document.createElement('DIV');
					buttonContainer.className = 'Q_aspect_conference_list_item_buttons';
					container.appendChild(buttonContainer);
				})
				participantsListContainer.appendChild(container);
				webrtcParticipantsList[userId] = container;
				return container;
			}

			function removeAvatar(userId) {
				if(webrtcParticipantsList[userId]) {
					webrtcParticipantsList[userId].remove();
					delete webrtcParticipantsList[userId];
				}
			}
		}

		function updateUIAccordingEventState() {
			if (tool.webrtcStream && tool.webrtcStream.testWriteLevel(40)) {
				schedulerButton.removeClass("Q_hidden");
				if(!tool.eventIsHappening()) {
					enterRoomButton.removeClass("Q_hidden");
				} else {
					enterRoomButton.addClass("Q_hidden");
				}
			}
		}

		function webrtcIsActive() {
			for (var r in Q.Media.WebRTCRooms) {
				let streamOfRoom = Q.Media.WebRTCRooms[r].roomStream();
				if (streamOfRoom.fields.publisherId == tool.webrtcStream.fields.publisherId && streamOfRoom.fields.name == tool.webrtcStream.fields.name) {
					return true;
				}
			}
			return false;
		}
		window.document.addEventListener('keyup', askToJoinTeleconferenceIfHappening)
		function askToJoinTeleconferenceIfHappening() {
			if(tool.eventIsHappening() === false) {
				return;
			}
			if(webrtcIsActive() === true) {
				console.warn('WebRTC already active')
				return;
			}
			var stream = tool.stream;
			let noticeKey = 'eventStarted_' + tool.stream.fields.name + '_' + tool.stream.getAttribute('startTime');
			if(Q.Notices.get(noticeKey)) {
				return;
			}

			var startTime = stream.getAttribute('startTime') * 1000;
			var endTime = stream.getAttribute('endTime') * 1000;
			var currentTimestamp = new Date().getTime();
			var elapsed = currentTimestamp - startTime;			
			let container = document.createElement('DIV');
			container.className = 'Calendars_teleconference_notice';

			let avatarContainer = document.createElement('DIV');
			avatarContainer.className = 'Calendars_teleconference_notice_avatar';
			container.appendChild(avatarContainer);
			let icon = document.createElement('SPAN');
			icon.className = 'qp-calendars-teleconference';
			avatarContainer.appendChild(icon);

			let descriptionContainer = document.createElement('DIV');
			descriptionContainer.className = 'Calendars_teleconference_notice_desc';
			container.appendChild(descriptionContainer);

			let descriptionText = document.createElement('SPAN');
			descriptionText.className = 'Calendars_teleconference_notice_text';
			if (startTime < currentTimestamp && endTime > currentTimestamp && elapsed < 5 * 60 * 1000) {
				//5 minutes have not passed since startTime, show that event is started (not ongoing)
				descriptionText.innerHTML = (Q.getObject(['notifications', 'webrtc', 'StartedInEvent'], tool.text) || '').interpolate({ user: name, event: tool.stream.fields.title });
			} else {
				//5 minutes have passed since startTime, show that event is ongoing
				descriptionText.innerHTML = (Q.getObject(['notifications', 'webrtc', 'OngloingInEvent'], tool.text) || '').interpolate({ user: name, event: tool.stream.fields.title });
			}
			descriptionContainer.appendChild(descriptionText);

			let buttonContainer = document.createElement('DIV');
			buttonContainer.className = 'Calendars_teleconference_notice_buttons';
			container.appendChild(buttonContainer);
			let watchButton = document.createElement('BUTTON');
			watchButton.className = 'Q_button Calendars_teleconference_notice_join';
			watchButton.innerHTML = Q.getObject(['event', 'tool', 'Join'], tool.text);
			buttonContainer.appendChild(watchButton);

			let closeButton = document.createElement('SPAN');
			closeButton.className = 'Calendars_teleconference_notice_close';
			closeButton.innerHTML = Q.getObject(['event', 'tool', 'Close'], tool.text);
			buttonContainer.appendChild(closeButton);

			
			Q.Notices.add({
				closeable: false,
				key: noticeKey,
				type: 'online-event',
				timeout: 10,
				content: container.outerHTML
			});

			let noticeEl = Q.Notices.get(noticeKey)
			if (noticeEl) {
				noticeEl.onclick = null;
				let watchButton = noticeEl.querySelector('.Calendars_teleconference_notice_join');
				let closeButton = noticeEl.querySelector('.Calendars_teleconference_notice_close');

				['click', 'auxclick'].forEach(function (eventName) {
					watchButton.addEventListener(eventName, function (e) {
						startWebRTC();
						Q.Notices.remove(noticeKey);
					})
				})

				closeButton.addEventListener('click', function (e) {
					Q.Notices.remove(noticeKey);
				})
			}
		}

		function handleUIEvents() {

			tool.state.onInvoke('teleconference').set(function (stream) {
				tool.state.webrtc = null;
				tool.getGoing(Q.Users.loggedInUserId(), function (going) {
					if (going !== 'yes') {
						return Q.alert(tool.text.event.tool.YouAreNotParticipated);
					}

					startWebRTC();
				});
			}, tool);

			//available only for the host
			schedulerButton.on(Q.Pointer.fastclick, function () {
				if(!tool.webrtcStream) return;
				
				Q.Dialogs.push({
					title: Q.getObject(['event', 'tool', 'updateTeleconference'], tool.text),
					className: '',
					apply: true,
					content: Q.Tool.setUpElement('div', 'Media/webrtc/scheduler', {
						publisherId: tool.webrtcStream.fields.publisherId,
						streamName: tool.webrtcStream.fields.name,
						showSaveButton: true
					}),
					onActivate: function (dialogElement, dialogObj) {
						tool.webrtcSchedulerTool = Q.Tool.from(dialogObj.content, 'Media/webrtc/scheduler')
					},
					onClose: function () {
						tool.webrtcSchedulerTool.createOrUpdateWebRTCStream().then(function (response) {

						}).catch(function (msg) {
							Q.Notices.add({
								content: msg,
								timeout: 5
							});
						});
					}
				})
			});
			
			//available only for the host. allows the host enter the room before event stats
			enterRoomButton.on(Q.Pointer.fastclick, function () {
				var WebConference = Q.Media.WebRTC({
					element: document.body,
					roomId: (tool.webrtcStream.fields.name).replace('Media/webrtc/', ''),
					roomPublisherId: tool.webrtcStream.fields.publisherId,
					resumeClosed: true,
					defaultDesktopViewMode: 'maximized',
					defaultMobileViewMode: 'audio',
					mode: 'node',
					startWith: { video: false, audio: true },
					audioOnlyMode: false,
					onWebRTCRoomCreated: function () {

					},
					onWebrtcControlsCreated: function () {

					},
					beforeSwitch: function () {
						
					}
				});

				WebConference.start();
			});
		}

		function startWebRTC() {
			var $toolElement = $(this.element);
			var userId = Q.Users.loggedInUserId();

			if (state.webrtc) {
				return;
			}

			// if event not started or already ended
			if (!state.teleconference || !tool.eventIsHappening()) {
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
					relationType: 'Calendars/event/webrtc',
					tool: tool,
					useRelatedTo: true,
					onWebrtcControlsCreated: function () {
						$toolElement.attr("data-webrtc", true);
					},
					onStart: function () {
						state.webrtc = this;

						let noticeKey = 'eventStarted_' + tool.stream.fields.name + '_' + tool.stream.getAttribute('startTime');
						if(Q.Notices.get(noticeKey)) {
							Q.Notices.remove(noticeKey);
						}

					},
					onEnd: function () {
						state.webrtc = 'ended';
						$toolElement.attr("data-webrtc", false);
					}
				});
			});
		}

		/**
	 	* Sets data attribute so UI of tool is updated depending on whether teleconference is happening or not
	 	* @method teleconferenceState
	 	* @return string
	 	*/
		function updateTeleconferenceState() {
			var teleconferenceState = tool.teleconferenceState();
			
			$(".Q_aspect_conference .Calendars_info_content", tool.element).attr('data-teleconferenceState', teleconferenceState);

			return teleconferenceState;
		}

		/* Streams.Stream.onMessage(state.publisherId, state.streamName, 'Streams/changed').set(function (message) {
			var instructions = JSON.parse(message.instructions);
			var newTitle = Q.getObject(["changes", "title"], instructions);		
		}); */

		return {
			startWebRTC: startWebRTC,
			updateTeleconferenceState: updateTeleconferenceState
		}
	},
	manageLivestream: function () {
		var tool = this;
		var toolText = tool.text.event.tool;
		var livestreamAspect = tool.element.querySelector('.Q_aspect_livestream');
		var livestreamAspectText = livestreamAspect.querySelector('.Calendars_info_content');
		var livestreamsListEl = livestreamAspect.querySelector('.Q_aspect_livestream_list');
		var relatedTool = null;
		var livestreamSubscription = null
		var livestreamStartNotificationIsOn = false;
		var livestreamsList = [];
		var relatedToolRefreshDebauncer = null;
		//check if there is Livestream stream. It should exist if the host checked "teleconference" checkbox AND checked "Scheduler livestream" in WebRTC scheduler form while creating the event
		/* Q.Streams.related(tool.state.publisherId, tool.state.streamName, 'Calendars/event/livestream', true, { dontFilterUsers: true }, function () {
			for (let i in this.relatedStreams) {
				if (this.relatedStreams[i].fields.type == 'Media/webrtc') {
					tool.livestreamStream = this.relatedStreams[i];
					break;
				}
			}

			if (!tool.livestreamStream) {
				Q.alert('livestreamStream stream not found.')
				return;
			}
			handleLivestreamEvents();
			handleUIEvents()
		}); */

		handleLivestreamEvents();
		handleUIEvents();
		trackLivestreams();

		getMyLivestreamSubscribtion().then(function (subscriptionData) {
			updateLivestreamSubscriptionState(subscriptionData)
			updateUI();
		});

		function trackLivestreams() {
			Q.activate(
				Q.Tool.setUpElement('div', 'Streams/related', {
					publisherId: tool.state.publisherId,
					streamName: tool.state.streamName,
					relationType: 'Calendars/event/livestream',
					tag: 'div',
					isCategory: true,
					creatable: false,
					realtime: true,
					onUpdate: function (e) {
						reloadLivestreamsList(e.relatedStreams);
					}
				}),
				{},
				function () {
					let relatedTool = this;
					//Streams/related tool doesn't react and doesn't refresh its streams attributes when they are updated by external code (e.g. by node.js or PHP)
					//so we need to refresh all streams manually when their attributes were modified so corresponding UI updates will be triggered
					relatedToolRefreshDebauncer = Q.debounce(function () {
						relatedTool.refresh();
					}, 500);
				}
			);
		}

		function reloadLivestreamsList(relatedStreams) {
			let streams = Object.values(relatedStreams);
			for(let i in streams) {
				let livestreamStream = streams[i];

				let exist = false;
				for(let s in livestreamsList) {
					let existingItem = livestreamsList[s];
					if(livestreamStream.fields.name == existingItem.streamName && livestreamStream.fields.publisherId == existingItem.publisherId) {
						exist = existingItem;
						break;
					}
				}

				let lives = livestreamStream.getAttribute('lives');
				let p2pLive = livestreamStream.getAttribute('p2pRoom');
				let liveIsActive = (lives && lives.length != 0) || (p2pLive != null && p2pLive != '');

				if(exist){ 
					if(liveIsActive && exist.listItemEl) {
						if(livestreamStream.fields.publisherId == tool.state.publisherId) {
							livestreamsListEl.insertBefore(exist.listItemEl, livestreamsListEl.firstChild);
						} else {
							livestreamsListEl.appendChild(exist.listItemEl);
						}
					} else if(!liveIsActive) {
						if(exist.listItemEl.parentElement) exist.listItemEl.parentElement.removeChild(exist.listItemEl);
					}
					continue;
				}				
		
				//if(!liveIsActive) continue;

				let livestreamObject = {
					publisherId: livestreamStream.fields.publisherId,
					streamName: livestreamStream.fields.name,
					stream: livestreamStream,
					listItemEl: null,
				};

				livestreamsList.push(livestreamObject);

				livestreamObject.listItemEl = createLivestreamListItem(livestreamStream)
				if(liveIsActive) livestreamsListEl.appendChild(livestreamObject.listItemEl);

				livestreamObject.onStreamRefresh = Q.Streams.Stream.onRefresh(livestreamStream.fields.publisherId, livestreamStream.fields.name);
				livestreamObject.onStreamRefresh.add(function () {
					if(relatedToolRefreshDebauncer) {
						relatedToolRefreshDebauncer();
					}
				});
			}

			for (let s = livestreamsList.length - 1; s >= 0; s--) {
				let active = false;
				for (let r in relatedStreams) {
					if(livestreamsList[s].streamName == relatedStreams[r].fields.name && livestreamsList[s].publisherId == relatedStreams[r].fields.publisherId) {
						active = true;
					}
				}
				
				if(active) continue;

				livestreamsList.splice(s, 1);
			}
		}

		function createLivestreamListItem(livestreamStream) {
			let container = document.createElement('DIV');
			container.className = 'Q_aspect_livestream_list_item';

			Q.Streams.Avatar.get(livestreamStream.fields.publisherId).then(function (avatar) {
				let name = avatar.displayName();
				let iconUrl = avatar.iconUrl();

				let description = document.createElement('DIV');
				description.className = 'Calendars_livestream_notice_desc';
				container.appendChild(description);

				let avatarContainer = document.createElement('DIV');
				avatarContainer.className = 'Calendars_livestream_notice_avatar';
				description.appendChild(avatarContainer);
				let avatarImg = document.createElement('IMG');
				avatarImg.src = iconUrl;
				avatarContainer.appendChild(avatarImg);

				let descriptionContainer = document.createElement('DIV');
				descriptionContainer.className = 'Q_aspect_livestream_list_item_user';
				descriptionContainer.innerHTML = name + ' is live';
				description.appendChild(descriptionContainer);

				let buttonContainer = document.createElement('DIV');
				buttonContainer.className = 'Q_aspect_livestream_list_item_buttons';
				container.appendChild(buttonContainer);

				let joinButton = document.createElement('A');
				joinButton.href = '#';
				joinButton.className = 'Q_aspect_livestream_list_item_join';
				joinButton.innerHTML = tool.text.event.tool.Join;
				buttonContainer.appendChild(joinButton);

				['click', 'auxclick'].forEach(function (eventName) {
					joinButton.addEventListener(eventName, function (e) {
						e.preventDefault();
						if (e.ctrlKey || e.button === 1) {
							window.open(livestreamStream.url(), "_blank");
							return;
						};
						if (Q.Media) Q.Media.openLivestreamTool(livestreamStream.fields.publisherId, livestreamStream.fields.name);
					}, false);
				})

			})

			return container;
		}

		function handleUIEvents() {
			$(".Calendars_event_scheduler", tool.element).on(Q.Pointer.fastclick, function () {
				
			});
			tool.state.onInvoke('livestream').set(function (stream) {
				if(livestreamAspect) livestreamAspect.classList.add('Q_working');
				notifyMeWhenLivestreamStarted(livestreamStartNotificationIsOn === true ? 'unsubscribe' : 'subscribe').then(function () {
					if(livestreamAspect) livestreamAspect.classList.remove('Q_working');
					updateUI();
				});
			}, tool);
		}

		function updateLivestreamSubscriptionState(subscriptionData) {
			if(!subscriptionData) {
				livestreamSubscription = null;
				livestreamStartNotificationIsOn = false;
				return;
			}
			livestreamSubscription = subscriptionData;
			var messageFilters = JSON.parse(livestreamSubscription.fields.filter);
			var messageTypes = messageFilters.types;
			if(tool.stream.participant.subscribed == 'yes' && messageTypes.indexOf('Calendars/event/livestream/started') !== -1 && messageTypes.indexOf('Calendars/event/livestream/stopped') !== -1) {
				livestreamStartNotificationIsOn = true;
			} else {
				livestreamStartNotificationIsOn = false;
			}
		}
		function updateUI() {
			if(livestreamStartNotificationIsOn) {
				livestreamAspectText.innerHTML = tool.text.event.tool.LiveStreamNotificationOn;
			} else {
				livestreamAspectText.innerHTML = tool.text.event.tool.LiveStreamNotifyMe;
			}

			for(let i in livestreamsList){
				let livestream = livestreamsList[i];
				let livestreamItem = document.createElement('DIV');
				livestreamItem.className = 'Q_aspect_livestream_list_item';
				let livestreamUser = document.createElement('DIV');
				livestreamUser.className = 'Q_aspect_livestream_list_item_user';
				livestreamItem.appendChild(livestreamUser);
				let livestreamJoin = document.createElement('DIV');
				livestreamJoin.className = 'Q_aspect_livestream_list_item_join';
				livestreamItem.appendChild(livestreamJoin);
			}
		}

		function handleLivestreamEvents() {
			tool.stream.onMessage("Calendars/event/livestream/started").set(function (message) {
				for(let i in livestreamsList) {
					if(livestreamsList[i].stream) {
						livestreamsList[i].stream.refresh(null, { evenIfNotRetained: true });
					}
				}
			});
			tool.stream.onMessage("Calendars/event/livestream/stopped").set(function (message) {
				for(let i in livestreamsList) {
					if(livestreamsList[i].stream) {
						livestreamsList[i].stream.refresh(null, { evenIfNotRetained: true });
					}
				}

			});
		}

		function notifyMeWhenLivestreamStarted(action) {
			return new Promise(function (resolve, reject) {
				var fields = {
					publisherId: tool.state.publisherId,
					eventId: tool.state.streamName.split('/').pop(),
					action: action,
				};
				Q.req('Calendars/livestreamSubscription', ['stream', 'subscription', 'participant'], function (err, response) {
					if (err != null) {
						reject(err);
						return;
					}
					refreshEventStream().then(function () {
						updateLivestreamSubscriptionState(response.slots.subscription);
						resolve();
					})
				}, {
					method: 'post',
					fields: fields
				});
			});

		}
		
		function getMyLivestreamSubscribtion() {
			return new Promise(function (resolve, reject) {
				var fields = {
					publisherId: tool.state.publisherId,
					streamName: tool.state.streamName,
				};
				Q.req('Calendars/livestreamSubscription', 'subscription', function (err, response) {
					if (err != null) {
						reject(err);
						return;
					}
					var subscription = response.slots.subscription.subscription;
					resolve(subscription);
				}, {
					method: 'get',
					fields: fields
				});
			});
		}

		function refreshEventStream() {
			return new Promise(function (resolve, reject) {
				Streams.Stream.refresh(tool.state.publisherId, tool.state.streamName, function () {
						tool.stream = this;

						resolve();
					}, {
						withParticipant: true,
						messages: true,
						unlessSocket: true
					});
			});
		}
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
		var payment = tool.stream && tool.stream.getAttribute('payment');
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
							tool.updateInterface('no');
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
								amount: needCredits - currentCredits,
								currency: options.currency || 'USD',
								reason: 'JoinedPaidStream',
								metadata: {
									publisherId: tool.state.publisherId,
									streamName: tool.state.streamName
								},
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
	 * Update whether the current user is "going" to an event.
	 *
	 * This is the authoritative client-side handler for event participation.
	 *
	 * Responsibilities:
	 *  - Trigger login if needed, then retry automatically
	 *  - Prevent redundant updates
	 *  - Perform optimistic UI update, revert on any failure
	 *  - Support prepayment mode (create Stripe customer first)
	 *  - Ensure required related-participants flow completes first
	 *  - Process optional payments (donation UI)
	 *  - Process required payments ONLY when server responds with slots.payment
	 *  - Refresh stream + participant on every server response
	 *
	 * The server determines when payment is needed.
	 * The client never computes amounts or calls Assets.pay().
	 *
	 * @method going
	 * @param {String} going  "yes", "no", or "maybe"
	 * @param {Function} callback Receives (true|false)
	 * @param {Object} options Passed to Q.Users.login()
	 */
	going: function (going, callback, options) {
		var tool  = this;
		var $te   = $(this.element);
		var state = this.state;

		var paymentType     = Q.getObject("payment.type", state);
		var paymentAmount   = Q.getObject("payment.amount", state);
		var paymentCurrency = Q.getObject("payment.currency", state);

		var userId = Users.loggedInUserId();

		//-------------------------------------------------------------
		// 0. Require login
		//-------------------------------------------------------------
		if (!userId) {
			Users.login({
				onSuccess: {
					"Users": function () {
						tool.going(going, callback, options);
					}
				}
			});
			return false;
		}

		//-------------------------------------------------------------
		// 1. No-op if unchanged
		//-------------------------------------------------------------
		var previousGoing = $te.attr("data-going");

		if (previousGoing === going) {
			Q.handle(callback, tool, [false]);
			return false;
		}

		//-------------------------------------------------------------
		// 2. UI utility helpers
		//-------------------------------------------------------------
		var revertUI = function () {
			$te.attr("data-going", previousGoing);
			tool.updateInterface(previousGoing);
			tool.$goingElement.removeClass("Q_working");
		};

		var finalizeUI = function () {
			tool.updateInterface(going);
			Q.handle(state.onGoing, tool, [going, tool.stream, tool.participant]);
			Q.handle(callback, tool, [true]);
		};

		tool.$goingElement.addClass("Q_working");

		var isPublisher = (userId === state.publisherId);

		//-------------------------------------------------------------
		// 3. going = "no"
		//-------------------------------------------------------------
		if (going === "no") {
			return _saveGoing("no")
				.then(finalizeUI)
				.catch(revertUI);
		}

		//-------------------------------------------------------------
		// 4. Prepayment mode (ensure Stripe customer profile)
		//-------------------------------------------------------------
		if (going === "yes" && tool.modePrepayment) {

			if (!tool.stream.getAttribute('payment') || Q.getObject("payment.isAssetsCustomer", state)) {
				return tool.going("maybe", callback, options);
			}

			Q.Assets.Payments.stripe({
				amount: 1,
				currency: "USD",
				reason: 'EventParticipation',
				description: tool.text.event.tool.Prepayment
			}, function (err) {
				if (err) {
					revertUI();
					Q.handle(callback, tool, [false]);
					return;
				}
				state.payment.isAssetsCustomer = true;
				tool.going("maybe", callback, options);
			});

			return;
		}

		//-------------------------------------------------------------
		// 5. Required related participants must be added first
		//-------------------------------------------------------------
		if (!tool.checkRelatedParticipants()) {
			tool.addRelatedParticipants({
				callback: function (ok) {
					if (ok) {
						tool.going(going, callback, options);
					} else {
						revertUI();
						Q.handle(callback, tool, [false]);
					}
				}
			});
			return false;
		}

		//-------------------------------------------------------------
		// 6. No payment required
		//-------------------------------------------------------------
		if (isPublisher || state.isAdmin || !state.payment || going === "maybe") {
			return _saveGoing(going)
				.then(finalizeUI)
				.catch(revertUI);
		}

		//-------------------------------------------------------------
		// 7. Payment MAY be required — only server decides.
		//    Optimistic UI: save now, let server override via slots.payment.
		//-------------------------------------------------------------
		_saveGoing(going)
			.then(finalizeUI)
			.catch(revertUI);

		//-------------------------------------------------------------
		// 8. Optional donation-style payment
		//-------------------------------------------------------------
		if (paymentType === "optional") {
			_donate()
				.catch(function (err) { err && console.warn(err); })
				.then(function () {
					tool.getPaymentInfo();
					tool.$goingElement.removeClass("Q_working");
					Q.handle(state.onPaid, tool);
				});
			return;
		}

		//-------------------------------------------------------------
		// 9. Required payment:
		//    Do nothing here. The server returns slots.payment.
		//    Stripe is handled inside _saveGoing().
		//-------------------------------------------------------------



		// ==================================================================
		// INTERNAL HELPERS
		// ==================================================================

		/**
		 * Save "going" state to server.
		 *
		 * Handles:
		 *  - Server-side errors
		 *  - Refreshing stream & participant
		 *  - Triggering Stripe when server returns slots.payment
		 *
		 * @method _saveGoing
		 * @private
		 * @param {String} targetGoing
		 * @return {Promise}
		 */
		function _saveGoing(targetGoing) {
			var changed = ($te.attr("data-going") !== targetGoing);

			if (changed) {
				$te.attr("data-going", targetGoing);
			}

			return new Q.Promise(function (resolve, reject) {

				if (!changed) return reject("no_change");

				Q.req(
					"Calendars/going",
					["stream","participant","payment","paid"],
					function (err, response) {

						var msg = Q.firstErrorMessage(err, response);
						if (msg) {
							Q.alert(msg, { title: "Sorry" });
							return reject(msg);
						}

						Streams.Stream.refresh(
							state.publisherId,
							state.streamName,
							function () {
								var slots = response.slots || {};
								var payment  = slots.payment;
								var paid = slots.paid;
								var paymentDetails = payment && payment.details;

								tool.stream = this;
								if (slots.participant) {
									tool.participant = new Streams.Participant(slots.participant);
								}

								//-------------------------------------------------
								// Server instructs client to open Stripe
								//-------------------------------------------------
								if (paymentDetails && paymentDetails.intent) {

									// Note that mere presence of .intentToken without
									// a corresponding .intent object means that the server
									// has 
									var intent = paymentDetails.intent;
									var stripeOptions = {
										intentToken   : paymentDetails.intentToken,
										amount        : intent.amount,
										currency      : intent.currency,
										reason        : intent.reason,
										// metadata      : intent.metadata || {},
										toPublisherId : intent.toPublisherId,
										toStreamName  : intent.toStreamName
									};

									Q.Assets.Payments.stripe(
										stripeOptions,
										function () {
											tool.getPaymentInfo();
											Q.handle(state.onPaid, tool);
											resolve(response);
										},
										function () {
											revertUI();
											reject("stripe_cancel");
										}
									);

									return;
								} else if (paid) {
									Q.handle(state.onPaid, tool, [payment]);
								}

								//-------------------------------------------------
								// Normal success
								//-------------------------------------------------
								resolve(response);
							},
							{
								withParticipant: true,
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
		}

		/**
		 * Optional donation payment dialog.
		 *
		 * User may refuse; the main flow continues without error.
		 *
		 * @method _donate
		 * @private
		 * @return {Promise}
		 */
		function _donate() {
			var cacheKey = Q.Cache.key([
				state.publisherId,
				state.streamName,
				"donation"
			].join("."));

			var cache = Q.Cache.session(cacheKey);

			return new Q.Promise(function (resolve, reject) {

				Q.Template.render(
					"Calendars/event/payment",
					{
						content: tool.text.payment.confirmationDialog.content.interpolate({
							amount: paymentAmount + " " + paymentCurrency
						}),
						button: tool.text.payment.confirmationDialog.button + " "
					},
					function (err, html) {
						if (err) return reject(err);

						if (cache.get(cacheKey)) {
							return reject("already_shown");
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
										resolve();
										return false;
									});
							},
							onClose: function () {
								cache.set(cacheKey, 1, true);
							}
						});
					}
				);
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

		// don't show going for started events
		state.show.going = parseInt(tool.stream.getAttribute('startTime')) * 1000 > Date.now();

		// check if user is publisher or admin for current community
		if (state.isAdmin) {
			state.show.editWebrtc = true;
			state.show.checkin = true;
			state.show.closeEvent = true;

			// if event is recurring and user have admin permissions, show adminRecurring button
			if (Q.getObject(["relatedFromTotals", 'Calendars/recurring'], tool.stream)) {
				state.show.adminRecurring = true;
			}
		} else {
			state.show.myqr = !!(tool.stream.participant && tool.stream.participant.testRoles('registered'));
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
		} else if (!Q.getObject("fields.location", tool.stream) || Q.getObject("event.hideLocationIfNotPaid", Calendars) === true) {
			state.show.location = false;
			state.show.trips = false;
		}

		tool.$(".Calendars_info .Travel_aspect_trips")[state.show.trips ? "slideDown" : "slideUp"](300);
		tool.$(".Calendars_info .Q_aspect_where")[state.show.location ? "slideDown" : "slideUp"](300);

		state.teleconference = tool.stream.getAttribute('teleconference') || tool.stream.getAttribute('livestream'); //livestream is for backward compatibility
		
		// if event location undefined, hide location section
		if (state.teleconference && (tool.stream.testWriteLevel(40) || tool.stream.testPermission('Media/livestream'))) {
			state.show.teleconference = {
				state: tool.teleconferenceState(),
				remote: !!state.teleconference.matchTypes('url').length,
			};
		} else {
			state.show.teleconference = false;
		}
		tool.$(".Calendars_info .Q_aspect_conference")[state.show.teleconference ? "slideDown" : "slideUp"](300);

		// if config Calendats/event/reminders empty, it's no sense to show it
		if (tool.stream.participant && tool.stream.participant.testRoles('registered')) {
			state.show.reminders = !Q.isEmpty(Q.getObject("Event.reminders", Calendars));
		} else {
			state.show.reminders = false;
		}
		tool.$(".Calendars_info .Q_aspect_reminders")[state.show.reminders ? "slideDown" : "slideUp"](300);

		state.show.presentation = tool.stream.testWriteLevel(40) || tool.stream.testPermission('Media/presentation');
		tool.$(".Calendars_info .Streams_aspect_presentation")[state.show.presentation ? "slideDown" : "slideUp"](300);

		// interests
		if (Q.isEmpty(Calendars.Event.getInterests(tool.stream))) {
			state.show.interests = false;
		}
	},
	/**
	 * Update the interface based on going changing
	 * @method going
	 */
	updateInterface: function (going, duringRefresh) {
		going = going || "no";
		var tool = this;

		tool.setShow();

		$(tool.element).attr('data-going', going);

		tool.$('.Calendars_going [data-going=' + going + ']')
			.addClass('Q_selected')
			.siblings().removeClass('Q_selected');

		if (going === 'no' && !duringRefresh) {
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

		if (!state.isAdmin || !tool.modePrepayment) {
			return;
		}

		Q.req("Calendars/event", ["roles", "paid"], function (err, response) {
			if (Q.firstErrorMessage(err, response && response.errors)) {
				return;
			}

			Q.Template.render('Calendars/event/roles', {
				roles: ['rejected', 'requested', 'registered'],
				paid: ['no', 'reserved', 'fully']
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
							role: $this.attr("data-role")
						}
					});

				});

				$("[data-paid=" + response.slots.paid + "]", $html).addClass('Q_selected');
				$("[data-paid]", $html).on(Q.Pointer.fastclick, function () {
					var $this = $(this);
					$this.addClass('Q_working');
					Q.req("Calendars/event", ["paid"], function (err, response) {
						$this.removeClass('Q_working');
						if (Q.firstErrorMessage(err, response && response.errors)) {
							return;
						}

						if (response.slots.paid) {
							$this.addClass('Q_selected').siblings().removeClass('Q_selected');
						}
					}, {
						method: "PUT",
						fields: {
							publisherId: state.publisherId,
							streamName: state.streamName,
							userId,
							paid: $this.attr("data-paid")
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
	},
	icons: {
		livestream: '<svg width="666.8385" height="491.05225" viewBox="0 0 20.005155 14.731567" version="1.1" id="svg1" sodipodi:docname="live-svgrepo-com.svg" xml:space="preserve" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:cc="http://creativecommons.org/ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><defs id="defs1" /><sodipodi:namedview id="namedview1" pagecolor="#ffffff" bordercolor="#666666" borderopacity="1.0" inkscape:showpageshadow="2" inkscape:pageopacity="0.0" inkscape:pagecheckerboard="0" inkscape:deskcolor="#d1d1d1" /><g stroke="none" stroke-width="1" fill="none" fill-rule="evenodd" transform="translate(-1.998872,-4.6457837)"><g id="ic_fluent_live_24_filled" fill="#212121" fill-rule="nonzero"><path style="display:inline" d="m 16.267742,7.8120529 c 2.312011,2.3120111 2.312011,6.0605221 0,8.3725331 -0.390524,0.390524 -1.023689,0.390524 -1.414214,0 -0.390524,-0.390524 -0.390524,-1.023689 0,-1.414214 1.530963,-1.530962 1.530963,-4.013143 0,-5.5441055 -0.390524,-0.3905243 -0.390524,-1.0236893 0,-1.4142136 0.390525,-0.3905242 1.02369,-0.3905242 1.414214,0 z" id="path3" /><path style="display:inline" d="m 9.3094225,7.8120529 c 0.3905243,0.3905243 0.3905243,1.0236893 0,1.4142136 -1.5309626,1.5309625 -1.5309626,4.0131435 0,5.5441055 0.3905243,0.390525 0.3905243,1.02369 0,1.414214 -0.3905243,0.390524 -1.0236893,0.390524 -1.4142136,0 -2.3120111,-2.312011 -2.3120111,-6.060522 0,-8.3725331 0.3905243,-0.3905242 1.0236893,-0.3905242 1.4142136,0 z" id="path2" /><path style="display:inline" d="m 19.07434,4.9386769 c 3.90625,3.9062496 3.90625,10.2395311 0,14.1457811 -0.390524,0.390524 -1.023689,0.390524 -1.414214,0 -0.390524,-0.390524 -0.390524,-1.023689 0,-1.414214 3.125201,-3.125201 3.125201,-8.1921526 0,-11.3173535 -0.390524,-0.3905243 -0.390524,-1.0236893 0,-1.4142136 0.390525,-0.3905243 1.02369,-0.3905243 1.414214,0 z" id="path1" /><path style="display:inline" d="m 6.3427727,4.9386769 c 0.3905243,0.3905243 0.3905243,1.0236893 0,1.4142136 -3.125201,3.1252009 -3.125201,8.1921525 0,11.3173535 0.3905243,0.390525 0.3905243,1.02369 0,1.414214 -0.3905243,0.390524 -1.0236893,0.390524 -1.4142136,0 -3.9062495,-3.90625 -3.9062495,-10.2395315 0,-14.1457811 0.3905243,-0.3905243 1.0236893,-0.3905243 1.4142136,0 z" /></g><path id="path5" transform="matrix(0.82605162,0,0,0.82605162,4.2752137,7.6601506)" inkscape:transform-center-x="-0.74766358" d="m 7.6067637,7.3899887 c 0,0 -0.1452693,-0.9369033 -0.1452693,-2.1353762 0,-1.1984729 0.1452693,-2.1353763 0.1452693,-2.1353763 0.059919,-0.4403868 0.4811252,-0.7222222 0.8660254,-0.5 0,0 0.9791917,0.5346379 1.7766539,0.9950534 0.797463,0.4604155 1.849291,1.2129575 1.849291,1.2129575 0.354797,0.2676751 0.457535,0.7051431 0.07264,0.9273653 0,0 -1.120428,0.7457109 -1.77666,1.1403229 -0.6562322,0.394612 -1.9219249,0.9950534 -1.9219249,0.9950534 -0.4033948,0.1865569 -0.8660254,-0.055556 -0.8660254,-0.5 z" style="display:inline;stroke-width:0.0131803;-inkscape-stroke:none" sodipodi:nodetypes="szsszsszss" /></g></svg>',
		settingsGears: '<svg width="800px" height="800px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"> <path fill-rule="evenodd" clip-rule="evenodd" d="M12 8.00002C9.79085 8.00002 7.99999 9.79088 7.99999 12C7.99999 14.2092 9.79085 16 12 16C14.2091 16 16 14.2092 16 12C16 9.79088 14.2091 8.00002 12 8.00002ZM9.99999 12C9.99999 10.8955 10.8954 10 12 10C13.1046 10 14 10.8955 14 12C14 13.1046 13.1046 14 12 14C10.8954 14 9.99999 13.1046 9.99999 12Z" fill="#0F1729"/> <path fill-rule="evenodd" clip-rule="evenodd" d="M12 8.00002C9.79085 8.00002 7.99999 9.79088 7.99999 12C7.99999 14.2092 9.79085 16 12 16C14.2091 16 16 14.2092 16 12C16 9.79088 14.2091 8.00002 12 8.00002ZM9.99999 12C9.99999 10.8955 10.8954 10 12 10C13.1046 10 14 10.8955 14 12C14 13.1046 13.1046 14 12 14C10.8954 14 9.99999 13.1046 9.99999 12Z" fill="#0F1729"/> <path fill-rule="evenodd" clip-rule="evenodd" d="M10.7673 1.01709C10.9925 0.999829 11.2454 0.99993 11.4516 1.00001L12.5484 1.00001C12.7546 0.99993 13.0075 0.999829 13.2327 1.01709C13.4989 1.03749 13.8678 1.08936 14.2634 1.26937C14.7635 1.49689 15.1915 1.85736 15.5007 2.31147C15.7454 2.67075 15.8592 3.0255 15.9246 3.2843C15.9799 3.50334 16.0228 3.75249 16.0577 3.9557L16.1993 4.77635L16.2021 4.77788C16.2369 4.79712 16.2715 4.81659 16.306 4.8363L16.3086 4.83774L17.2455 4.49865C17.4356 4.42978 17.6693 4.34509 17.8835 4.28543C18.1371 4.2148 18.4954 4.13889 18.9216 4.17026C19.4614 4.20998 19.9803 4.39497 20.4235 4.70563C20.7734 4.95095 21.0029 5.23636 21.1546 5.4515C21.2829 5.63326 21.4103 5.84671 21.514 6.02029L22.0158 6.86003C22.1256 7.04345 22.2594 7.26713 22.3627 7.47527C22.4843 7.7203 22.6328 8.07474 22.6777 8.52067C22.7341 9.08222 22.6311 9.64831 22.3803 10.1539C22.1811 10.5554 21.9171 10.8347 21.7169 11.0212C21.5469 11.1795 21.3428 11.3417 21.1755 11.4746L20.5 12L21.1755 12.5254C21.3428 12.6584 21.5469 12.8205 21.7169 12.9789C21.9171 13.1653 22.1811 13.4446 22.3802 13.8461C22.631 14.3517 22.7341 14.9178 22.6776 15.4794C22.6328 15.9253 22.4842 16.2797 22.3626 16.5248C22.2593 16.7329 22.1255 16.9566 22.0158 17.14L21.5138 17.9799C21.4102 18.1535 21.2828 18.3668 21.1546 18.5485C21.0028 18.7637 20.7734 19.0491 20.4234 19.2944C19.9803 19.6051 19.4613 19.7901 18.9216 19.8298C18.4954 19.8612 18.1371 19.7852 17.8835 19.7146C17.6692 19.6549 17.4355 19.5703 17.2454 19.5014L16.3085 19.1623L16.306 19.1638C16.2715 19.1835 16.2369 19.2029 16.2021 19.2222L16.1993 19.2237L16.0577 20.0443C16.0228 20.2475 15.9799 20.4967 15.9246 20.7157C15.8592 20.9745 15.7454 21.3293 15.5007 21.6886C15.1915 22.1427 14.7635 22.5032 14.2634 22.7307C13.8678 22.9107 13.4989 22.9626 13.2327 22.983C13.0074 23.0002 12.7546 23.0001 12.5484 23H11.4516C11.2454 23.0001 10.9925 23.0002 10.7673 22.983C10.5011 22.9626 10.1322 22.9107 9.73655 22.7307C9.23648 22.5032 8.80849 22.1427 8.49926 21.6886C8.25461 21.3293 8.14077 20.9745 8.07542 20.7157C8.02011 20.4967 7.97723 20.2475 7.94225 20.0443L7.80068 19.2237L7.79791 19.2222C7.7631 19.2029 7.72845 19.1835 7.69396 19.1637L7.69142 19.1623L6.75458 19.5014C6.5645 19.5702 6.33078 19.6549 6.11651 19.7146C5.86288 19.7852 5.50463 19.8611 5.07841 19.8298C4.53866 19.7901 4.01971 19.6051 3.57654 19.2944C3.2266 19.0491 2.99714 18.7637 2.84539 18.5485C2.71718 18.3668 2.58974 18.1534 2.4861 17.9798L1.98418 17.14C1.87447 16.9566 1.74067 16.7329 1.63737 16.5248C1.51575 16.2797 1.36719 15.9253 1.32235 15.4794C1.26588 14.9178 1.36897 14.3517 1.61976 13.8461C1.81892 13.4446 2.08289 13.1653 2.28308 12.9789C2.45312 12.8205 2.65717 12.6584 2.82449 12.5254L3.47844 12.0054V11.9947L2.82445 11.4746C2.65712 11.3417 2.45308 11.1795 2.28304 11.0212C2.08285 10.8347 1.81888 10.5554 1.61972 10.1539C1.36893 9.64832 1.26584 9.08224 1.3223 8.52069C1.36714 8.07476 1.51571 7.72032 1.63732 7.47528C1.74062 7.26715 1.87443 7.04347 1.98414 6.86005L2.48605 6.02026C2.58969 5.84669 2.71714 5.63326 2.84534 5.45151C2.9971 5.23637 3.22655 4.95096 3.5765 4.70565C4.01966 4.39498 4.53862 4.20999 5.07837 4.17027C5.50458 4.1389 5.86284 4.21481 6.11646 4.28544C6.33072 4.34511 6.56444 4.4298 6.75451 4.49867L7.69141 4.83775L7.69394 4.8363C7.72844 4.8166 7.7631 4.79712 7.79791 4.77788L7.80068 4.77635L7.94225 3.95571C7.97723 3.7525 8.02011 3.50334 8.07542 3.2843C8.14077 3.0255 8.25461 2.67075 8.49926 2.31147C8.80849 1.85736 9.23648 1.49689 9.73655 1.26937C10.1322 1.08936 10.5011 1.03749 10.7673 1.01709ZM14.0938 4.3363C14.011 3.85634 13.9696 3.61637 13.8476 3.43717C13.7445 3.2858 13.6019 3.16564 13.4352 3.0898C13.2378 3.00002 12.9943 3.00002 12.5073 3.00002H11.4927C11.0057 3.00002 10.7621 3.00002 10.5648 3.0898C10.3981 3.16564 10.2555 3.2858 10.1524 3.43717C10.0304 3.61637 9.98895 3.85634 9.90615 4.3363L9.75012 5.24064C9.69445 5.56333 9.66662 5.72467 9.60765 5.84869C9.54975 5.97047 9.50241 6.03703 9.40636 6.13166C9.30853 6.22804 9.12753 6.3281 8.76554 6.52822C8.73884 6.54298 8.71227 6.55791 8.68582 6.57302C8.33956 6.77078 8.16643 6.86966 8.03785 6.90314C7.91158 6.93602 7.83293 6.94279 7.70289 6.93196C7.57049 6.92094 7.42216 6.86726 7.12551 6.7599L6.11194 6.39308C5.66271 6.2305 5.43809 6.14921 5.22515 6.16488C5.04524 6.17811 4.87225 6.23978 4.72453 6.34333C4.5497 6.46589 4.42715 6.67094 4.18206 7.08103L3.72269 7.84965C3.46394 8.2826 3.33456 8.49907 3.31227 8.72078C3.29345 8.90796 3.32781 9.09665 3.41141 9.26519C3.51042 9.4648 3.7078 9.62177 4.10256 9.9357L4.82745 10.5122C5.07927 10.7124 5.20518 10.8126 5.28411 10.9199C5.36944 11.036 5.40583 11.1114 5.44354 11.2504C5.47844 11.379 5.47844 11.586 5.47844 12C5.47844 12.414 5.47844 12.621 5.44354 12.7497C5.40582 12.8887 5.36944 12.9641 5.28413 13.0801C5.20518 13.1875 5.07927 13.2876 4.82743 13.4879L4.10261 14.0643C3.70785 14.3783 3.51047 14.5352 3.41145 14.7349C3.32785 14.9034 3.29349 15.0921 3.31231 15.2793C3.33461 15.501 3.46398 15.7174 3.72273 16.1504L4.1821 16.919C4.4272 17.3291 4.54974 17.5342 4.72457 17.6567C4.8723 17.7603 5.04528 17.8219 5.2252 17.8352C5.43813 17.8508 5.66275 17.7695 6.11199 17.607L7.12553 17.2402C7.42216 17.1328 7.5705 17.0791 7.7029 17.0681C7.83294 17.0573 7.91159 17.064 8.03786 17.0969C8.16644 17.1304 8.33956 17.2293 8.68582 17.427C8.71228 17.4421 8.73885 17.4571 8.76554 17.4718C9.12753 17.6719 9.30853 17.772 9.40635 17.8684C9.50241 17.963 9.54975 18.0296 9.60765 18.1514C9.66662 18.2754 9.69445 18.4367 9.75012 18.7594L9.90615 19.6637C9.98895 20.1437 10.0304 20.3837 10.1524 20.5629C10.2555 20.7142 10.3981 20.8344 10.5648 20.9102C10.7621 21 11.0057 21 11.4927 21H12.5073C12.9943 21 13.2378 21 13.4352 20.9102C13.6019 20.8344 13.7445 20.7142 13.8476 20.5629C13.9696 20.3837 14.011 20.1437 14.0938 19.6637L14.2499 18.7594C14.3055 18.4367 14.3334 18.2754 14.3923 18.1514C14.4502 18.0296 14.4976 17.963 14.5936 17.8684C14.6915 17.772 14.8725 17.6719 15.2344 17.4718C15.2611 17.4571 15.2877 17.4421 15.3141 17.427C15.6604 17.2293 15.8335 17.1304 15.9621 17.0969C16.0884 17.064 16.167 17.0573 16.2971 17.0681C16.4295 17.0791 16.5778 17.1328 16.8744 17.2402L17.888 17.607C18.3372 17.7696 18.5619 17.8509 18.7748 17.8352C18.9547 17.8219 19.1277 17.7603 19.2754 17.6567C19.4502 17.5342 19.5728 17.3291 19.8179 16.919L20.2773 16.1504C20.536 15.7175 20.6654 15.501 20.6877 15.2793C20.7065 15.0921 20.6721 14.9034 20.5885 14.7349C20.4895 14.5353 20.2921 14.3783 19.8974 14.0643L19.1726 13.4879C18.9207 13.2876 18.7948 13.1875 18.7159 13.0801C18.6306 12.9641 18.5942 12.8887 18.5564 12.7497C18.5215 12.6211 18.5215 12.414 18.5215 12C18.5215 11.586 18.5215 11.379 18.5564 11.2504C18.5942 11.1114 18.6306 11.036 18.7159 10.9199C18.7948 10.8126 18.9207 10.7124 19.1725 10.5122L19.8974 9.9357C20.2922 9.62176 20.4896 9.46479 20.5886 9.26517C20.6722 9.09664 20.7065 8.90795 20.6877 8.72076C20.6654 8.49906 20.5361 8.28259 20.2773 7.84964L19.8179 7.08102C19.5728 6.67093 19.4503 6.46588 19.2755 6.34332C19.1277 6.23977 18.9548 6.1781 18.7748 6.16486C18.5619 6.14919 18.3373 6.23048 17.888 6.39307L16.8745 6.75989C16.5778 6.86725 16.4295 6.92093 16.2971 6.93195C16.167 6.94278 16.0884 6.93601 15.9621 6.90313C15.8335 6.86965 15.6604 6.77077 15.3142 6.57302C15.2877 6.55791 15.2611 6.54298 15.2345 6.52822C14.8725 6.3281 14.6915 6.22804 14.5936 6.13166C14.4976 6.03703 14.4502 5.97047 14.3923 5.84869C14.3334 5.72467 14.3055 5.56332 14.2499 5.24064L14.0938 4.3363Z" fill="#000000"/> </svg>',
		notificationsOn: '<svg fill="#000000" version="1.1" id="Layer_1" width="690.47144" height="836.92456" viewBox="796 796 172.61786 209.23114" enable-background="new 796 796 200 200" xml:space="preserve" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"><defs id="defs2" /> <g id="path6" transform="matrix(0.95802941,0.01486985,-0.01486985,0.95802941,33.486595,24.332537)" style="display:inline"><path style="color:#000000;display:inline;fill:#000000;stroke-width:1.04368;-inkscape-stroke:none" d="m 898.29625,791.53096 c -8.82323,0.13694 -16.09154,6.72534 -17.45431,15.16559 -27.44077,8.17901 -47.32801,33.6369 -46.86265,63.61891 l 0.37427,24.11393 c 0.46761,30.1266 -7.631,38.8958 -14.70167,46.19046 l -2.93561,3.02817 0.20138,0.23336 c -2.53092,3.6444 -4.00068,8.09394 -3.9268,12.85373 0.18765,12.09034 10.24298,21.83644 22.33144,21.64881 l 131.71453,-2.04438 c 12.08855,-0.18763 21.83332,-10.24029 21.64682,-22.32937 -0.074,-4.83069 -1.74072,-9.28297 -4.45457,-12.8745 l 0.17365,-0.23918 -2.87503,-2.78917 c -7.29367,-7.07169 -15.65846,-15.58418 -16.12609,-45.71196 -0.003,-0.22532 -0.009,-0.2799 -0.007,-0.16096 l -0.37178,-23.95291 c -0.46535,-29.98169 -21.13153,-54.80928 -48.81245,-62.13391 -1.624,-8.39388 -9.09194,-14.75355 -17.91455,-14.61662 z" id="path1-8" /><path d="m 914.72,975.961 h -37.436 c -1.786,0 -3.466,0.844 -4.532,2.279 -1.066,1.433 -1.391,3.284 -0.875,4.995 3.121,10.366 12.742,17.918 24.126,17.918 11.384,0 21.003,-7.552 24.125,-17.918 0.516,-1.711 0.188,-3.563 -0.876,-4.995 -1.066,-1.435 -2.746,-2.279 -4.532,-2.279 z" id="path2-1" style="display:inline" transform="matrix(1.0435579,-0.01619736,0.01619736,1.0435579,-49.562981,-20.372467)" /><g id="g8" transform="translate(1.8446061,-0.02863066)"><path style="fill:none;stroke:#000000;stroke-width:15.6553;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-opacity:1" d="m 946.06972,798.92676 c 0,0 12.40296,8.13599 20.7094,18.89457 8.30644,10.75857 12.72203,24.64054 12.72203,24.64054" id="path8" /><path style="display:inline;fill:none;stroke:#000000;stroke-width:15.6553;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none;stroke-opacity:1" d="m 847.08205,800.4633 c 0,0 -12.14448,8.517 -20.11303,19.52819 -7.96855,11.01118 -11.95118,25.0235 -11.95118,25.0235" id="path8-8" /></g></g></svg>',
		notificationsOff: '<svg fill="#000000" version="1.1" id="Layer_1" width="695.95178" height="836.92468" viewBox="796 796 173.98795 209.23117" enable-background="new 796 796 200 200" xml:space="preserve" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"><defs id="defs2" /> <g id="g2" style="display:inline" transform="translate(-14.363441,4.07817)"> <path d="m 914.72,975.961 h -37.436 c -1.786,0 -3.466,0.844 -4.532,2.279 -1.066,1.433 -1.391,3.284 -0.875,4.995 3.121,10.366 12.742,17.918 24.126,17.918 11.384,0 21.003,-7.552 24.125,-17.918 0.516,-1.711 0.188,-3.563 -0.876,-4.995 -1.066,-1.435 -2.746,-2.279 -4.532,-2.279 z" id="path2" style="display:inline" /><path id="path1" style="color:#000000;display:inline;fill:#000000;-inkscape-stroke:none" d="m 896.00195,791.92188 c -8.45494,0 -15.51618,6.20379 -16.94726,14.26953 -11.81294,3.32224 -22.20962,9.99594 -30.11573,18.91015 l 6.1753,6.22217 c 7.43452,-8.6387 17.53108,-14.9181 29.0459,-17.49756 9.1231,-1.78672 14.4894,-1.94417 23.68164,-0.002 24.08281,5.39577 42.0957,26.85344 42.0957,52.61914 v 22.95312 c 0,0.21999 0.004,0.26021 0.004,0.1543 0,27.26502 7.92072,39.75134 14.80468,47.36719 l -0.26171,0.34961 c 2.29538,2.12863 6.35808,7.49364 6.76708,11.07763 l 7.65088,7.70948 c 0.81112,-2.23237 1.27711,-4.62614 1.27735,-7.12891 9.6e-4,-4.62903 -1.52963,-8.91924 -4.07617,-12.40039 l 0.16992,-0.22656 -2.71289,-2.71485 c -6.88239,-6.88334 -14.76953,-15.16298 -14.76953,-44.0332 0,-0.21591 -0.004,-0.26828 -0.004,-0.1543 v -22.95312 c 0,-28.73023 -19.42965,-52.82314 -45.83984,-60.25195 -1.43103,-8.06573 -8.49097,-14.26953 -16.94532,-14.26953 z m -52.47558,40.2041 c -6.51082,9.84529 -10.31348,21.62513 -10.31348,34.31738 v 23.10742 c 0,28.86909 -7.88911,37.14986 -14.77148,44.0332 l -2.85743,2.85743 0.18946,0.22656 c -2.47889,3.45381 -3.95313,7.69474 -3.95313,12.25586 0,11.58568 9.48839,21.07226 21.07227,21.07226 h 126.2168 c 5.84795,0 11.15636,-2.42204 14.98437,-6.30664 l -6.20313,-6.25 c -2.21433,2.28505 -5.31159,3.70703 -8.78124,3.70703 h -126.2168 c -6.80009,0 -12.2207,-5.42037 -12.2207,-12.22265 0,-3.56116 1.50388,-6.70429 3.92382,-8.94922 l 3.07618,-2.85352 -0.29102,-0.34765 c 6.85505,-7.63271 14.68164,-20.12503 14.68164,-47.22266 v -23.10742 c 0,-10.23848 2.88024,-19.77234 7.81982,-27.9126 z" /> <path style="color:#000000;display:inline;fill:#000000;stroke-width:0.958145;stroke-linecap:round;-inkscape-stroke:none" d="m 813.74181,806.5382 a 4.5871181,4.5871181 0 0 0 -3.22749,1.38168 4.5871181,4.5871181 0 0 0 0.0752,6.48627 l 175.08952,171.03264 a 4.5871181,4.5871181 0 0 0 6.48627,-0.0752 4.5871181,4.5871181 0 0 0 -0.0752,-6.48814 L 817.00059,807.84463 a 4.5871181,4.5871181 0 0 0 -3.25878,-1.30643 z" id="path8-5" transform="matrix(0.9580294,0.01486985,-0.01486985,0.9580294,47.17985,20.254425)" /> </g> </svg>',
		enterRoom: '<svg width="43.044926mm" height="49.441414mm" viewBox="0 0 43.044926 49.441414" version="1.1" id="svg1" xml:space="preserve" xmlns="http://www.w3.org/2000/svg" xmlns:svg="http://www.w3.org/2000/svg"><defs id="defs1" /><path style="color:#000000;fill:#000000;stroke-linecap:round;stroke-linejoin:round;-inkscape-stroke:none" d="M 13.117194,3.1534699e-7 A 2.6255,2.6255 0 0 0 10.49024,2.6250003 a 2.6255,2.6255 0 0 0 2.626954,2.625 H 37.792973 V 44.18946 H 13.117194 a 2.6255,2.6255 0 0 0 -2.626954,2.625 2.6255,2.6255 0 0 0 2.626954,2.62695 h 24.919919 c 2.73405,0 5.00782,-2.27377 5.00782,-5.00781 V 5.0058603 c 0,-2.73405 -2.27377,-5.00585998465302 -5.00782,-5.00585998465302 z" id="path14" /><path style="color:#000000;fill:#000000;stroke-linecap:round;stroke-linejoin:round;-inkscape-stroke:none" d="m 20.990499,14.26367 a 2.0999999,2.0999999 0 0 0 -1.47461,0.63868 2.0999999,2.0999999 0 0 0 0.0469,2.9707 l 6.99023,6.77539 -6.99023,6.77539 a 2.0999999,2.0999999 0 0 0 -0.0469,2.96875 2.0999999,2.0999999 0 0 0 2.96875,0.0469 l 8.54688,-8.28321 a 2.1002099,2.1002099 0 0 0 0,-3.01758 l -8.54688,-8.2832 a 2.0999999,2.0999999 0 0 0 -1.49414,-0.5918 z" id="path5" /><path style="color:#000000;fill:#000000;stroke-linecap:round;stroke-linejoin:round;-inkscape-stroke:none" d="M 2.0996146,22.54688 A 2.0999999,2.0999999 0 0 0 5.5794793e-6,24.64844 2.0999999,2.0999999 0 0 0 2.0996146,26.74805 H 27.214853 a 2.0999999,2.0999999 0 0 0 2.09961,-2.09961 2.0999999,2.0999999 0 0 0 -2.09961,-2.10156 z" id="path6" /></svg>',
	}
});

Q.Template.set('Calendars/event/tool',
'<div class="Calendars_event_curtain">' +
	'<div class="Q_tool Streams_preview_tool Streams_image_preview_tool Streams_internal_preview" ' +
	'{{#if icon}}' +
	' data-icon-src="{{icon}}"' +
	'{{/if}}' +
	'data-streams-preview=\'{"publisherId":"{{stream.fields.publisherId}}","streamName":"{{stream.fields.name}}", "cacheBust": false, "closeable": false, "imagepicker": {"cacheBust": false, "showSize": "1000x", "save": "Calendars/event", "saveSizeName": "Calendars/event"}}\'>' +
	'</div></div>' +
	'{{#if show.hosts}}' +
	'  <div class="Calendars_event_hosts">' +
	'    {{{tool "Users/avatar" icon=1000 userId=stream.fields.publisherId className="Calendars_event_publisher" templates-contents-name="Calendars/event/hosts/avatar/contents"}}}' +
	'  </div>' +
	'{{/if}}' +
	'{{#if show.participants}}' +
	'<div class="Calendars_event_participants"></div>' +
	'{{/if}}' +
	'{{#if show.going}}' +
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
	'		<div class="Calendars_info_icon"><i class="qp-calendars-teleconference"></i></div>' +
	'		<div class="Calendars_info_content">{{text.event.tool.Presentation}}</div>' +
	'		<div class="Calendars_info_unseen" data-state="waiting"></div>' +
	'	</div>' +
	'	<div class="Q_button Media_aspect_webrtc" data-invoke="webrtc">' +
	'		<div class="Calendars_info_icon"><i class="qp-calendars-teleconference"></i></div>' +
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
	'	<div class="Q_aspect_livestream" {{#ifEquals show.livestream false}}style="display:none"{{/ifEquals}}>' +
	'		<div class="Q_button Q_aspect_livestream_button" data-invoke="livestream">' +
	'			<div class="Calendars_info_icon">' +
	'				{{{ icons.livestream }}}' +
	'			</div>' +
	'			<div class="Calendars_info_content" data-livestreamState="">' +
	'				<div class="Calendars_event_startlivestream">{{ text.event.tool.LiveStreamNotifyMe}}</div>' +
	'			</div>' +
	'		</div>' +
	'		<div class="Q_aspect_livestream_list"></div>' +
	'	</div>' +
	'	<div class="Q_aspect_conference" {{#ifEquals show.teleconference false}}style="display:none"{{/ifEquals}}>' +
	'		<div class="Q_button Q_aspect_conference_button" data-invoke="teleconference">' +
	'			<div class="Calendars_info_icon"><i class="qp-calendars-teleconference"></i></div>' +
	'			<div class="Calendars_info_content" data-teleconferenceState="{{show.teleconference.state}}" data-teleconferenceRemote="{{show.teleconference.remote}}">' +
	'				{{{tool "Q/timestamp" "start" capitalized=true time=startTime}}}' +
	'				<div class="Calendars_event_startTeleConference">{{text.event.tool.JoinTeleConference}}</div>' +
	'				<div class="Calendars_event_TeleConferenceEnded">{{text.event.tool.TeleConferenceEnded}}</div>' +
	'				<div class="Calendars_event_TeleConferenceRecording">{{text.event.tool.ClickToViewRecording}}</div>' +
	'   	        {{#if show.editWebrtc}}' +
	'   	        	<div class="Calendars_event_scheduler">' +
	'   	        		<div title="{{text.event.tool.JoinTeleConference}}" class="Calendars_event_scheduler_icon Calendars_event_scheduler_join Q_hidden">' +
	'   	            		{{{ icons.enterRoom }}}' + 
	'   	        		</div>' +
	'   	        		<div title="{{text.event.tool.OpenTeleconferenceScheduler}}" class="Calendars_event_scheduler_icon Calendars_event_scheduler_tool Q_hidden">' +
	'   	            		{{{ icons.settingsGears }}}' + 
	'   	        		</div>' +
	'   	        	</div>' +
	'   	        {{/if}}' +
	'			</div>' +
	'		</div>' +
	'		<div class="Q_aspect_conference_users_list"></div>' +
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
	'{{#if show.checkin}}' +
	'	<div class="Q_button Calendars_aspect_checkin Calendars_aspect_admin" data-invoke="checkin">' +
	'		<div class="Calendars_info_icon"><i class="qp-communities-qrcode"></i></div>' +
	'		<div class="Calendars_info_content">{{text.event.tool.Checkin}}</div>' +
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
</div>
<div class="Calendars_event_paid">
	<h2>Paid management</h2>
	{{#each paid}}
		<div data-paid="{{this}}">{{this}}</div>		
	{{/each}}
</div>`
);

})(Q, Q.jQuery, window);