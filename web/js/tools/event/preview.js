(function (Q, $, window, undefined) {

var Streams = Q.Streams;
var Calendars = Q.Calendars;
var Places = Q.Places;

/**
 * Calendars/event/preview tool.
 * Renders a tool to preview events
 * @class Calendars/event/preview
 * @constructor
 * @param {Object} [options] options to pass besides the ones to Streams/preview tool
 *   @param {Boolean} [options.hideIfNoParticipants] If there are no participants in the event, hide this preview.
 *   @param {Object} [options.show]
 *   @param {Boolean} [options.show.hosts=true]
 *   @param {Object} [options.icon]
 *   @param {Object} [options.icon.size='80'] If you remove the CSS blur, set this to '500x' or null
 *   @param {Boolean|String} [options.show.participants=true] Can be true, false and 'publishers' - which means display only to event publisher.
 *   @param {Boolean|Object} [options.textfill=false] You can pass true or an object of options to apply Q/textfill on the titles
 *   @param {String} [options.templateStyle=classic] Template style. Can be "classic", "square" (icon square on the left) and "tall" (icon on the top).
 *   @param {Q.Event} [options.onRefresh] Event occurs when tool element has rendered with content
 */
Q.Tool.define("Calendars/event/preview", ["Streams/preview"], function(options, preview) {
	var tool = this;
	tool.preview = preview;
	var $toolElement = $(tool.element);

	$toolElement.attr("data-mode", this.state.mode);
	$toolElement.attr("data-admin", Q.getObject("Event.isAdmin", Calendars));

	// apply template class
	$toolElement.addClass("Calendars_event_preview_template_" + tool.state.templateStyle);

	preview.preprocess = function (callback) {
		tool.composer(function (err, data) {
			var fem = Q.firstErrorMessage(err, data);
			if (fem) {
				return console.warn(fem);
			}
			callback(data.slots.stream.fields.name);
		});
	};

	preview.state.onRefresh.add(tool.refresh.bind(tool));

	// listen for Streams/changed message, and if title modified, change event title.
	Streams.Stream.onFieldChanged(preview.state.publisherId, preview.state.streamName)
	.set(function (fields, changed) {
		if (changed.title) {
			tool.$('.Calendars_event_titleContent').html(changed.title);
		}
		if (changed.icon) {
			var icon = Q.Streams.iconUrl(changed.icon, tool.state.icon.size);
			tool.$('.Calendars_event_preview_background').css(
				'background-image', 'url(' + icon + ')'
			);
		}
		if (changed.closedTime) {
			Q.Tool.remove(tool.element, true, true);
		}
	}, tool);

	Q.Socket.onEvent('Streams/post').set(function (message) {
		message = Streams.Message.construct(message);
		var streamName = Q.getObject("streamName", message) || "";
		var publisherId = Q.getObject("publisherId", message) || "";

		if (publisherId !== preview.state.publisherId || streamName !== preview.state.streamName) {
			return;
		}

		var instructions = message.getAllInstructions();
		var messageType = Q.getObject("type", message) || "";

		if (messageType === 'Calendars/checkin' && instructions.checkin) {
			// update Streams/participants tool
			Calendars.Event.updateParticipants({
				tool: tool,
				userId: instructions.userId,
				type: 'checkin'
			});
		}

		if (messageType === 'Streams/join') {
			if (Q.getObject("byUserId", message) === Q.Users.loggedInUserId()) {
				$(tool.element).attr('data-going', 'yes');
			}
		}

		if (messageType === 'Streams/leave') {
			if (Q.getObject("byUserId", message) === Q.Users.loggedInUserId()) {
				$(tool.element).attr('data-going', 'no');
			}
		}

	}, tool);
},

{
	hideIfNoParticipants: false,
	mode: Q.getObject("Communities.event.mode", Q) || "classic",
	show: {
		hosts: false,
		participants: true
	},
	icon: {
		size: '80'
	},
	templateStyle: Calendars.event.templateStyle || "classic",
	textfill: Q.getObject("Communities.event.preview.textfill", Q),
	onRefresh: new Q.Event()
},

{
	refresh: function (stream, callback) {
		var tool = this;
		var state = tool.state;
		var ps = tool.preview.state;
		var $te = $(tool.element);
		tool.stream = stream;

		var items = stream.getAttribute('payment');
		if (items) {
			$te.attr('data-payment', items.type);
		}

		if (state.hideIfNoParticipants
		&& stream.fields.participatingCount === 0) {
			$te.addClass('Calendars_event_preview_noParticipants');
		} else {
			$te.removeClass('Calendars_event_preview_noParticipants');
		}
		var location = JSON.parse(stream.fields.location || null) || Places.Location.fromStream(stream);
		var areaSelectd = Q.getObject(['area', 'title'], location) || "";
		var venue = "<div class='Calendars_event_preview_venue'>" + (areaSelectd ? areaSelectd+', ' : '') + (location.venue || location.address || '') + "</div>";
		var startTime = parseInt(stream.getAttribute('startTime'));
		var timestamp = Q.Tool.setUpElementHTML('div', 'Q/timestamp', {
			relative: false,
			time: startTime,
			capitalized: true
		}, 'Q_timestamp_start', tool.prefix);
		var endTime = parseInt(stream.getAttribute('endTime'));
		timestamp += " " + tool.text.event.composer.Ending.toLowerCase() + " ";
		timestamp += Q.Tool.setUpElementHTML('div', 'Q/timestamp', {
			relative: false,
			time: endTime,
			capitalized: true
		}, 'Q_timestamp_end', tool.prefix);
		var time = "<div class='Calendars_event_preview_time'>" + timestamp + "</div>";
		var info = time + venue;
		var participantsTool = Q.Tool.setUpElementHTML('div', 'Streams/participants', {
			publisherId: stream.fields.publisherId,
			streamName: stream.fields.name,
			max: stream.getAttribute('peopleMax'),
			invite: false,
			maxShow: 6
		}, 'Streams_participants', tool.prefix, {
			'data-q-retain': "retain"
		});
		var avatarTool = Q.Tool.setUpElementHTML('div',
			'Users/avatar',
			{
				icon: 40,
				userId: stream.fields.publisherId,
				templates: {
					contents: {
						name: 'Calendars/event/hosts/avatar/contents'
					}
				}
			},
			null,
			tool.prefix
		);
		var fields = {
			src: stream.iconUrl(state.icon.size),
			title: stream.fields.title,
			info: info,
			participantsTool: participantsTool,
			avatarTool: avatarTool,
			show: state.show,
			hideUnpaid: Q.getObject("Calendars.event.unpaid.hide.location", Q)
		};
		Q.Template.render('Calendars/event/preview', fields, function (err, html) {
			if (err) return;
			Q.replace(tool.element, html);
			Q.activate(tool, {
				'.Streams_participants_tool': {
					filter: function (userId, element) {
						if (state.show.hosts && userId === stream.fields.publisherId) {
							return false;
						}
					}
				}
			}, function () {
				Q.handle(callback, tool);
				
				if (state.textfill) {
					tool.$('.Calendars_event_title').plugin('Q/textfill', state.textfill);
				}

				var participantsTool = Q.Tool.from($(".Streams_participants_tool", tool.element));

				// set payment icon
				if (items) {
					var amt = items.amount.toFixed(2);
					if (parseInt(amt) == amt) {
						amt = items.amount.toFixed(0);
					}
					Q.Assets.Currencies.getSymbol(items.currency, function (symbol) {
						tool.$(".Calendars_event_preview_paid").html(symbol === 'credits' ? amt + " " + symbol : symbol + amt);
					});
				}

				// get stream with all participants
				Streams.get(ps.publisherId, ps.streamName, function (err, eventStream, extra) {
					var participants = Q.getObject(['participants'], extra);
					if (participants && participantsTool) {
						var participantsOrdering = [];
						Q.each(participants, function (userId, streamsParticipant) {
							if (!streamsParticipant) {
								return;
							}
							
							if (streamsParticipant.userId === Q.Users.loggedInUserId() && streamsParticipant.state === 'participating') {
								$te.attr('data-going', streamsParticipant.getExtra("going"));
							}

							if (streamsParticipant.testRoles('staff') || streamsParticipant.testRoles('speaker')) {
								participantsOrdering.push(userId);
							}
						});
						participantsTool.state.ordering = participantsOrdering;
						Q.handle(participantsTool.Q.onStateChanged("ordering"));

						participantsTool.state.onRefresh.add(function () {
							// add to participants onRefresh event handler to update avatar data-checkin
							// iterate event participants
							Q.each(participants, function (index, participant) {
								if (participant.state !== 'participating') {
									return;
								}

								var extra = participant.extra ? JSON.parse(participant.extra) : null;

								if (participant.testRoles('staff')) {
									// logged user is a staff in this event
									if (Q.Users.loggedInUserId() === participant.userId) {
										$te.attr("data-staff", true);
									}

									Calendars.Event.updateParticipants({
										tool: tool,
										userId: participant.userId,
										type: 'staff'
									});
								} else if (participant.testRoles('speaker')) {
									Calendars.Event.updateParticipants({
										tool: tool,
										userId: participant.userId,
										type: 'speaker'
									});
								} else if (participant.testRoles('leader')) {
									Calendars.Event.updateParticipants({
										tool: tool,
										userId: participant.userId,
										type: 'speaker'
									});
								}

								if (Q.getObject(['checkin'], extra)) {
									Calendars.Event.updateParticipants({
										tool: tool,
										userId: participant.userId,
										type: 'checkin'
									});
								}
							});
						}, tool);
					}

					if (parseInt(Q.getObject(["relatedFromTotals", 'Calendars/recurring', 'Calendars/recurring'], eventStream)) > 0) {
						$(".Calendars_event_preview_recurring", tool.element).tool("Calendars/recurring", {
							publisherId: ps.publisherId,
							streamName: ps.streamName,
							action: "settings",
							onBeforeDialog: function(callback){
								var recurringToolState = this.state;

								Calendars.Recurring.getRecurringData(eventStream, function(data){
									recurringToolState.period = Q.getObject(["eventRecurring", "period"], data) || [];
									recurringToolState.days = Q.getObject(["userRecurring", "days"], data) || [];
									recurringToolState.startDate = Q.getObject(["userRecurring", "startDate"], data) || [];
									recurringToolState.endDate = Q.getObject(["userRecurring", "endDate"], data) || [];
									recurringToolState.possibleDays = Q.getObject(["eventRecurring", "days"], data) || ['Mon'];

									Q.handle(callback);
								});
							}
						}).activate();
					}
				}, {
					participants: 100,
					withRelatedFromTotals: ['Calendars/recurring']
				});
			});
		});
	},
	composer: function () {
		var tool = this;
		var state = tool.state;
		var ps = tool.preview.state;
		Q.Dialogs.push({
			title: tool.text.preview.EventComposerDialogTitle,
			content: Q.Tool.setUpElement('div', 'Calendars/event/composer', {
				publisherId: ps.publisherId
			}),
			onActivate: function () {
				debugger;
			}
		});
	}
}

);

Q.Template.set('Calendars/event/preview',
	`<div class="Calendars_event_preview_container">
		<div class="Calendars_event_preview_background" style="background-image: url({{src}})"></div>
		<div class="Calendars_event_preview_foreground">
			<div class="Calendars_event_title">
				<div class="Calendars_event_titleContent">{{title}}</div>
			</div>
			<div class="Calendars_event_info" data-hideUnpaid="{{hideUnpaid}}">
				<div class="Calendars_event_infoContent">{{{info}}}</div>
			</div>
		</div>
	</div>
	{{#if show.participants}}
		{{{participantsTool}}}
	{{/if}}
	{{#if show.hosts}}
		{{{avatarTool}}}
	{{/if}}
	<div class="Calendars_event_preview_recurring"></div>
	<div class="Calendars_event_preview_paid"></div>`
);

})(Q, Q.jQuery, window);