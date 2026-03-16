(function (Q, $, window, undefined) {

var Users = Q.Users;
var Streams = Q.Streams;
var Calendars = Q.Calendars;

/**
 * This tool lets the user plan a new event
 * @class Calendars/service/browser
 * @constructor
 *   @param {String} [options.communityId=Q.Users.currentCommunityId] The id of the user representing the community publishing the interests
 *   @param {Q.Event} [options.onCreate] This event fires when the tool successfully creates a new event
 */
Q.Tool.define("Calendars/service/browser", function(options) {
	var tool = this;
	var state = this.state;

	// set default value
	state.communityId = state.communityId || Users.currentCommunityId;

	Q.addStylesheet("{{Calendars}}/css/serviceBrowser.css");

	Q.Text.get('Calendars/content', function (err, text) {
		tool.text = text;
		tool.refresh();
	});
},

{
	communityId: Users.currentCommunityId,
	onCreate: new Q.Event()
},

{
	refresh: function () {
		var tool = this;
		var state = tool.state;

		// check if composer filled, if no - render template and call refresh again
		if (!tool.element.innerHTML) {
			Q.Template.render('Calendars/templates/event/reservation', {}, function (err, html) {
				Q.replace(tool.element, html);;
				tool.refresh();
			});

			return;
		}

		tool.$composer = tool.$('.Calendars_service_browser');
		tool.$composer.children().not(':first-child').css({
			'opacity': 0.2,
			'pointer-events': 'none'
		});
		tool.$availability = tool.$('.Calendars_service_browser_availability');
		tool.$availabilityButton = tool.$('.Calendars_service_browser_availability_button');
		tool.$availabilityStep = tool.$(".Calendars_service_browser_availability input.Calendars_composer_step");
		tool.$payment = tool.$('.Calendars_service_browser_payment');
		tool.$location = tool.$('.Calendars_service_browser_location');
		tool.$teleconference = tool.$('.Calendars_service_browser_teleconference');
		tool.$locationStep = $('input.Calendars_composer_step', tool.$location);
		tool.$time = tool.$('.Calendars_service_browser_time');
		tool.$eventUrl = true;
		tool.$privacy = tool.$('.Calendars_service_browser_privacy');
		tool.$continue = tool.$('.Calendars_service_browser_share');
		tool.$timeslotStep = $("input.Calendars_composer_step", tool.$time);

		tool.$availabilityStep.add(tool.$locationStep).add(tool.$timeslotStep).on('change', function () {
			tool.prepareSteps();
		});

		tool.timeSlotsTool = null;
		tool.element.forEachTool("Calendars/timeslots", function () {
			tool.timeSlotsTool = this;
			var _setTimeSlotStep = function () {
				var selectedSlots = tool.timeSlotsTool.getIntervals(tool.timeSlotsTool.state.period, true);
				tool.$timeslotStep.val(Q.isEmpty(selectedSlots) ? '' : true).trigger('change');
			};
			var counter = 0;
			var intervalId = setInterval(function() {
				var toolLoaded = $(".Calendars_timeslot_period", tool.timeSlotsTool.element).length;

				if (toolLoaded) {
					_setTimeSlotStep();
				}

				if (toolLoaded || counter > 20) {
					intervalId && clearInterval(intervalId);
				}

				counter++;
			}, 500);
			this.state.onSelect.set(_setTimeSlotStep, this);
			this.state.onDeselect.set(_setTimeSlotStep, this);
		});

		// Calendars/availability
		tool.$availabilityButton.on(Q.Pointer.fastclick, function () {
			Q.Dialogs.push({
				title: tool.text.event.composer.ChooseAvailability,
				className: 'Calendars_composer_availabilities',
				content: $("<div />").tool("Calendars/availabilities", {
					categoryPublisherId: Users.communityId,
					categoryStreamName: 'Calendars/availabilities/main',
					editable: false,
					closeable: false,
					creatable: false
				}),
				onActivate: function (dialog) {
					$(dialog).on(Q.Pointer.fastclick, ".Calendars_availability_preview_tool", function () {
						tool.selectAvailability(Q.Tool.from(this, "Calendars/availability/preview"));
						Q.Dialogs.pop();
						return false;
					});
				}
			});
		});

		$(".Calendars_recurring_dialog_controls > [data-value]", tool.$time).on(Q.Pointer.fastclick, function () {
			$(this).addClass("Q_selected").siblings().removeClass("Q_selected");
		});

		tool.$continue.plugin('Q/clickable', {
			press: {size: 1.2},
			release: {size: 1.2}
		}).on(Q.Pointer.click, tool.continue.bind(tool))[0].preventSelections();
	},
	selectAvailability: function (availabilityTool) {
		var tool = this;
		tool.availabilityTool = availabilityTool;
		var state = this.state;
		var title = availabilityTool.stream.fields.title;
		tool.$availabilityButton.text(title);
		state.availability = {
			publisherId: availabilityTool.stream.fields.publisherId,
			streamName: availabilityTool.stream.fields.name
		};
		state.eventStreams = Q.getObject("state.eventStreams", availabilityTool) || [];
		var location = availabilityTool.stream.getAttribute('location');
		var venue = '';
		var address = '';
		var area = '';
		if (Q.isEmpty(location)) {
			tool.$location.hide();
		} else {
			venue = location.venue || location.address;
			address = venue === location.address ? "" : "<br>" + location.address;
			area = Q.getObject("area.text", location) || '';
			area = area && '<br>' + area;
			tool.$location.show();
		}

		var teleconference = availabilityTool.stream.getAttribute('teleconference') || availabilityTool.stream.getAttribute('livestream'); //livestream is for backward compatibility
		if (teleconference === "true") {
			tool.$teleconference.show();
		} else {
			tool.$teleconference.hide();
		}

		var assetsTemplate = availabilityTool.stream.getAttribute('serviceTemplate');
		var price = assetsTemplate.price;
		var currency = assetsTemplate.currency;
		var paymentType = assetsTemplate.payment;
		paymentType = paymentType === 'required' ? tool.text.availabilities.Price : paymentType;
		$(".Calendars_service_browser_payment_info", tool.$payment).html(paymentType + (price ? (currency ? ' ' : ' $') + parseFloat(price).toFixed(2) + (currency ? ' ' + currency : '') : ''));
		$("input.Calendars_composer_step", tool.$payment).val(true).trigger('change');

		// set location
		$(".Calendars_service_browser_location_address", tool.$location).html(venue + address + area);
		state.areaSelected = Q.getObject("area", location) || null;
		tool.$locationStep.val(true).trigger('change');

		// set privacy
		$(".Calendars_service_browser_peopleMin .value", tool.$privacy).html(availabilityTool.stream.getAttribute('peopleMin'));
		$(".Calendars_service_browser_peopleMax .value", tool.$privacy).html(availabilityTool.stream.getAttribute('peopleMax'));

		var labelSelected = availabilityTool.stream.getAttribute('labels');
		if (Q.typeOf(labelSelected) === 'object') {
			labelSelected = labelSelected[Object.keys(labelSelected)[0]];
		}
		$(".Calendars_service_browser_labels .value", tool.$privacy).html(labelSelected);

		// request additional data
		tool.$availabilityStep.val('').trigger('change');
		Q.req("Calendars/availability/response", "data", function (err, response) {
			var msg = Q.firstErrorMessage(err, response && response.errors);
			if (msg) {
				return Q.alert(msg);
			}

			tool.timeSlotsTool.state.slots.weekly = response.slots.data.availableSlots;
			tool.timeSlotsTool.refresh();

			// highlight selected time slots
			Q.each(state.eventStreams, function () {
				if (!(this.participant && this.participant.getExtra("going") === "yes")) {
					return;
				}

				var timeZone = JSON.parse(this.fields.location).timeZone;
				var startTime = this.getAttribute("startTime") * 1000;
				var hour = (new Date(startTime)).toLocaleString('en-US', {hour: '2-digit', hour12: false, minute: '2-digit', timeZone: timeZone}).replace(/^0+/, '');
				var weekDay = (new Date(startTime)).toLocaleString('en-US', {weekday: 'short', timeZone: timeZone});

				$("li[data-weekday='" + weekDay + "'] li[data-start='" + hour + "']", tool.timeSlotsTool.element).addClass("Q_selected");
			});

			tool.$availabilityStep.val(true).trigger('change');
		}, {
			fields: {
				publisherId: availabilityTool.stream.fields.publisherId,
				streamName: availabilityTool.stream.fields.name
			}
		});
	},
	prepareSteps: function () {
		var tool = this;
		var loc = tool.child('Places_location');
		var location = loc && loc.state.location;

		var steps = [];
		// create steps list
		Q.each([
			[tool.$availability],
			[tool.$payment],
			[tool.$location],
			[tool.$teleconference],
			[tool.$privacy],
			[tool.$time]
		],
		function (i, step) {
			var valid = true;
			Q.each(step, function (i, item) {
				if (item !== true && !item.is(":visible")) {
					valid = false;
				}
			});

			valid && steps.push(step);
		});
		var paymentTool = tool.child('Calendars_payment');
		if (paymentTool) {
			paymentTool.composer = this;
			steps.push([paymentTool.isValid()]);
		}

		var $composerChildren = $(".Calendars_step:visible", tool.$composer);

		Q.each(steps, function (i, step) {
			var filledOut = true;
			Q.each(step, function (i, item) {
				if (item === true) {
					return;
				}

				if (item === false) {
					filledOut = false;
					return;
				}

				if (jQuery.inArray(item.prop('tagName').toLowerCase(), ['input', 'select']) === -1) {
					item = $("input.Calendars_composer_step", item);
				}

				var val = item.val();
				if (item.attr('data-type')) {
					switch (item.attr('data-type')) {
						case 'url':
							filledOut = val.matchTypes('url').length;
							break;
					}
				} else if (!val) {
					filledOut = false;
				}
			});

			if (filledOut) {
				$composerChildren.eq(i+1)
				.css({'pointer-events': 'auto'})
				.stop()
				.animate({'opacity': 1});
			} else {
				var $jq = steps[i][0];
				if ($jq && $jq[0] instanceof Element) {
					if (!Q.info.isTouchscreen) {
						$jq.eq(0).plugin('Q/clickfocus');
					}
				}
				$composerChildren.slice(i+1)
				.css({'pointer-events': 'none'})
				.stop()
				.animate({'opacity': 0.5});
				return false;
			}
		});
	},
	continue: function () {
		var tool = this;
		var state = this.state;

		if (!Q.Users.loggedInUserId()) {
			return Q.Users.login({
				onSuccess: { // override default handler
					Users: tool.continue.bind(tool)
				}
			});
		}

		var timeSlots = tool.timeSlotsTool.getIntervals(null, true);
		if (Q.isEmpty(timeSlots)) {
			return Q.alert(tool.text.availabilities.PleaseSelectTimeSlots);
		}

		var teleconference = tool.availabilityTool.stream.getAttribute('teleconference') || tool.availabilityTool.stream.getAttribute('livestream'); //livestream is for backward compatibility
		var teleconferenceUrl = tool.availabilityTool.stream.getAttribute('teleconferenceUrl') || tool.availabilityTool.stream.getAttribute('livestreamUrl');
		var fields = {
			publisherId: state.communityId,
			availability: state.availability,
			teleconference: teleconference === "true" ? teleconferenceUrl ? teleconferenceUrl : "online" : "",
			timeSlots: timeSlots,
			recurring: $("[data-value=recurring]", tool.$time).hasClass("Q_selected")
		};

		// set local time zone
		var intl = Q.Intl.calendar();
		if (intl.timeZone) {
			fields.timezoneName = intl.timeZone;
		}

		// set diff time zone if defined
		var timezoneName = tool.availabilityTool.stream.getAttribute('timezone');
		if (timezoneName) {
			fields.timezoneName = timezoneName;
		}

		tool.$continue.addClass("Q_working");
		var _request = function () {
			Q.req("Calendars/event", ["stream", "exception"], function (err, data) {
				var msg = Q.firstErrorMessage(
					err, data && data.errors
				);
				if (msg) {
					tool.$continue.removeClass("Q_working");
					return alert(msg);
				}

				var exception = data.slots.exception;
				if (exception) {
					return Q.confirm(tool.text.availabilities.NotEnoughCreditsToParticipateEvents.interpolate(exception), function (reply) {
						if (!reply) {
							return tool.$continue.removeClass("Q_working");
						}

						Q.Assets.Credits.buy({
							missing: false,
							amount: exception.needCredits,
							onSuccess: function () {
								_request();
							},
							onFailure: function () {
								tool.$continue.removeClass("Q_working");
							}
						});
					},{
						title: tool.text.availabilities.ExceptionOccurred,
						ok: tool.text.event.tool.Yes,
						cancel: tool.text.event.tool.No,
						noClose: true
					});
				}

				var stream = Streams.Stream.construct(data.slots.stream, null, null, true);
				Q.handle(state.onCreate, tool, [stream]);
			}, {
				method: 'post',
				fields: fields
			});
		};

		_request();
	}
});

})(Q, Q.jQuery, window);