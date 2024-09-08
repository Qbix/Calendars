(function (Q, $, window, undefined) {
/**
 * Calendars/availability/preview tool.
 * Renders a tool to preview Calendars availability
 * @class Calendars/availability/preview
 * @constructor
 * @param {Object} [options] options to pass besides the ones to Streams/preview tool
 * @param {boolean} [options.useAvatar=false] If true use publisher avatar as stream icon
 * @param {boolean} [options.editable=true] If false - force refuse adding editable actions.
 * @param {String} [options.communityId=Q.Users.currentCommunityId] The id of the user representing the community publishing the interests
 * @param {Q.Event} [options.onProfile] event occur when admin want to see staff profile user.
 * @param {Q.Event} [options.onInvoke] event occur when onclick on tool element.
 */
Q.Tool.define("Calendars/availability/preview", ["Streams/preview"], function(options, preview) {
	var tool = this;
	var state = this.state;
	tool.preview = preview;
	var publisherId = preview.state.publisherId;
	var streamName = preview.state.streamName;
	var $toolElement = $(this.element);
	var userId = Q.Users.loggedInUserId();

	state.communityId = state.communityId || Q.Users.currentCommunityId;

	var pipe = new Q.Pipe(["scripts", "texts"], function () {
		Q.handle(state.onLoad, tool);
	});
	Q.addStylesheet([
		'{{Calendars}}/css/availabilityPreview.css',
		'{{Q}}/pickadate/themes/default.css',
		'{{Q}}/pickadate/themes/default.date.css'
	], { slotName: 'Calendars' });
	Q.addScript([
		'{{Q}}/pickadate/picker.js',
		'{{Q}}/pickadate/picker.date.js'
	], pipe.fill("scripts"));

	Q.Text.get('Calendars/content', function (err, text) {
		var msg = Q.firstErrorMessage(err);
		if (msg) {
			return console.warn(msg);
		}

		tool.text = text;
		pipe.fill("texts")();
	});

	if (publisherId && streamName) {
		Q.Streams.get(publisherId, streamName, function () {
			var stream = this;

			// this need to allow track stream changes online
			// if user non participated, messages not coming
			if (userId) {
				stream.join();
			}

			// on any field changes we refresh tool
			stream.onFieldChanged("").set(function (fields, changed) {
				tool.refresh();
				tool.element.classList.remove('Q_working');
			}, tool);

			// on message Streams/joined
			stream.onMessage("Streams/joined").set(function (message) {
				var extra = message.getInstruction('extra');
				if (typeof extra === 'string') {
					try {
						extra = JSON.parse(extra);
					} catch (e) {}
				}
				var $element = $(".Users_avatar_tool[id*=" + message.byUserId + "]", tool.element);

				if ($element.length && Q.getObject("role", extra) === 'staff') {
					tool.setupStaffAvatar($element[0], message.byUserId);
				}
			}, tool);

			// edit availability onclick tool.element
			$toolElement.on(Q.Pointer.fastclick, function () {
				Q.handle(state.onInvoke, tool, [stream]);
			});
		});
	}

	preview.state.creatable.preprocess = function (_proceed) {
		state.onLoad.add(function () {
			tool.openDialog(function (dialog) {
				//$(previewTool.element).clone().addClass('Streams_preview_loading').insertAfter(previewTool.element);

				var $saveButton = $("button[name=save]", dialog);
				var $label = $("select[name=labels] option:selected", dialog);
				var labels = {};
				labels[$label.val()] = $label.text();

				$saveButton.addClass("Q_working");
				Q.req("Calendars/availability", ["stream"],function (err, response) {
					$saveButton.removeClass("Q_working");
					var msg = Q.firstErrorMessage(err, response && response.errors);
					if (msg) {
						return;
					}

					var data = response.slots.stream;
					Q.Streams.get(data.publisherId, data.name, function (err) {
						if (err) {
							return;
						}

						var stream = this;
						Q.invoke({
							url: Q.url('newService'),
							name: 'newService',
							trigger: tool.element,
							onActivate: function (column) {
								var serviceBrowser = Q.Tool.from($(".Calendars_service_browser_tool", column)[0]);
								serviceBrowser.selectAvailability({
									stream: stream
								});
							}
						});
					});

				}, {
					method: 'post',
					fields: {
						template: state.serviceTemplate,
						location: state.location,
						timeSlots: state.timeSlots,
						livestream: $('.Calendars_availability_composer_livestream', dialog).attr("data-livestream") === "true",
						livestreamUrl: $("input[name=livestream]", dialog).val(),
						timezone: $("select[name=timezoneName]", dialog).val(),
						recurringStartDate: $('input[name=recurringStartDate]', dialog).val(),
						recurringEndDate: $('input[name=recurringEndDate]', dialog).val(),
						labels: labels,
						peopleMin: $('input[name=peopleMin]', dialog).val(),
						peopleMax: $('input[name=peopleMax]', dialog).val()
					}
				});
			}, {
				peopleMin: Q.getObject('Calendars.Event.defaults.peopleMin', Q) || 2,
				peopleMax: Q.getObject('Calendars.Event.defaults.peopleMax', Q) || 10
			});
		}, tool);

		return false;
	};

	preview.state.onRefresh.add(function () {
		tool.refresh(function (stream) {
			// activate participants tool only first time
			$(".Streams_participants_tool", tool.element)
			.tool("Streams/participants", {
				publisherId: stream.fields.publisherId,
				streamName: stream.fields.name,
				invite: {
					addLabel: ["Calendars/staff"],
					addMyLabel: false,
					alwaysSend: true,
					title: tool.text.availabilities.InviteStaff
				},
				showSummary: false,
				maxShow: 5,
				filter: function (userId, element) {
					var tool = this;
					Q.Streams.get(stream.fields.publisherId, stream.fields.name, function (err, stream, extra) {
						var fem = Q.firstErrorMessage(err);
						if (fem) {
							return console.warn("Calendars/availability/preview: " + fem);
						}

						Q.each(extra && extra.participants, function (uid, participant) {
							if (userId !== uid) {
								return;
							}

							try {
								if (!participant.testRoles('staff')) {
									return;
								}

								tool.setupStaffAvatar(element, userId);
							} catch (e) {}
						});
					}, {participants: tool.state.maxLoad});
				}
			}).attr('data-q-retain', 'retain')
			.activate();
		});
	});
},

{
	useAvatar: true,
	editable: true,
	onLoad: new Q.Event(),
	onProfile: new Q.Event(),
	onInvoke: new Q.Event()
},

{
	refresh: function ( callback) {
		var tool = this;
		var state = this.state;
		var ps = this.preview.state;

		// retain with stream
		Q.Streams.retainWith(tool)
		.get(ps.publisherId, ps.streamName, function () {
			var stream = this;
			tool.stream = stream;
			var $toolElement = $(tool.element);
	
			if (!Q.Streams.isStream(stream)) {
				return;
			}
			var address = '';
			var area = '';
			var location = stream.getAttribute('location');
			if (!Q.isEmpty(location)) {
				address = location.venue && (location.venue === location.address || location.address.includes(location.venue)) ? location.address : location.venue + "<br>" + location.address;
				area = Q.getObject("area.text", location) || '';
				area = area && '<br>' + area;
			}
	
			var livestream = stream.getAttribute('livestream') === "true";
	
			var serviceTemplate = stream.getAttribute('serviceTemplate');
			var _renderTemplate = function () {
				Q.Template.render('Calendars/availability/preview', {
					title: stream.fields.title,
					description: stream.fields.content,
					price: serviceTemplate.price ? '(' + (serviceTemplate.currency ? '' : '$') + parseFloat(serviceTemplate.price).toFixed(2) + (serviceTemplate.currency ? ' ' + serviceTemplate.currency : '') +')' : '',
					location: address + area,
					livestream: livestream,
					text: tool.text.availabilities
				}, function (err, html) {
					if (err) return;
	
					Q.replace(tool.element, html);
	
					$(".Calendars_availability_preview_description", tool.element).on(Q.Pointer.fastclick, function (e) {
						e.stopPropagation();
						var $this = $(this);
	
						if ($this.attr('data-expanded')) {
							$this[0].style["max-height"] = null;
							setTimeout(function () {
								$this.removeProp("style");
							}, 500);
							$this.removeAttr('data-expanded');
						} else {
							$this.attr('data-expanded', true);
							$this.css({
								"max-height": "10em",
								"-webkit-line-clamp": "unset",
							});
						}
	
						return false;
					});
	
					var $icon = $("img.Streams_preview_icon", tool.element);
					var publisherId = tool.preview.state.publisherId;
					var streamName = tool.preview.state.streamName;
					if (state.useAvatar) {
						$("<div />").tool("Users/avatar", {
							userId: publisherId,
							short: true
						}, tool.prefix + publisherId).insertAfter($icon).activate();
						$icon.remove();
					} else {
						tool.preview.icon($icon[0]);
					}
	
					var actions = {};
					/*if (state.editable && stream.testWriteLevel('join')) {
						actions.invite = function () {
							Q.Streams.invite(publisherId, streamName, {
								addLabel: ["Calendars/staff"],
								alwaysSend: true
							});
						};
					}*/
					if (state.editable && stream.testWriteLevel('edit')) {
						actions.edit = function () {
							tool.openDialog(function (dialog) {
								var $label = $("select[name=labels] option:selected", dialog);
								var label = $label.val();
								var labelText = $label.text();
								var labels = {};
	
								if (label && labelText) {
									labels[label] = labelText;
								} else {
									labels = null;
								}
	
								$toolElement.addClass('Q_working');
	
								Q.req("Calendars/availability", ["stream"], function (err, data) {
									var msg = Q.firstErrorMessage(err, data && data.errors);
									if (msg) {
										return console.warn(msg);
									}
	
									// we refresh tool onFieldChanged in tool constructor
									tool.element.classList.remove('Q_working');
								}, {
									method: "put",
									fields: {
										availability: {
											publisherId: tool.stream.fields.publisherId,
											streamName: tool.stream.fields.name
										},
										location: state.location,
										livestream: $('.Calendars_availability_composer_livestream', dialog).attr("data-livestream") === "true",
										livestreamUrl: $("input[name=livestream]", dialog).val(),
										timezone: $("select[name=timezoneName]", dialog).val(),
										template: state.serviceTemplate,
										timeSlots: state.timeSlots,
										recurringStartDate: $('input[name=recurringStartDate]', dialog).val(),
										recurringEndDate: $('input[name=recurringEndDate]', dialog).val(),
										labels: labels,
										peopleMin: $("input[name=peopleMin]", dialog).val(),
										peopleMax: $("input[name=peopleMax]", dialog).val()
									}
								});
							}, {
								recurringStartDate: tool.stream.getAttribute('recurringStartDate'),
								recurringEndDate: tool.stream.getAttribute('recurringEndDate')
							});
						};
	
						if (stream.testWriteLevel('close')) {
							actions.remove = function () {
								tool.preview.delete();
							};
						}
					}
	
					if (!Q.isEmpty(actions)) {
						setTimeout(function () {
							$toolElement.plugin('Q/actions', {
								actions: actions
							});
						}, 100);
					}
				});
			};
	
			// check labels
			var labels = stream.getAttribute('labels');
			if (Q.typeOf(labels) === 'object' && !Q.isEmpty(labels) && !Q.getObject("Calendars/*", labels)) {
				Q.Users.getContacts(stream.fields.publisherId, Object.keys(labels), Q.Users.loggedInUserId(), function (err, contacts) {
					if (Q.isEmpty(contacts)) {
						Q.Tool.remove(tool.element, true, true);
					} else {
						_renderTemplate();
					}
				});
			} else {
				_renderTemplate();
			}
	
			$toolElement.addClass("Q_disabled");
			var pipe = new Q.Pipe(["serviceStream", "eventStreams"], function () {
				Q.handle(callback, tool, [stream]);
				$toolElement.removeClass("Q_disabled");
			});
	
			// this method (getting related streams) more reliable, but very slow.
			state.eventStreams = [];
			stream.relatedTo("Calendars/event", function () {
				Q.each(this.relatedStreams, function (index) {
					state.eventStreams.push(this);
				});
				pipe.fill("eventStreams")();
			});
			stream.relatedFrom("Calendars/availability", function () {
				Q.each(this.relatedStreams, function (index) {
					if (this.fields.type === "Places/location") {
						state.locationStream = this;
						pipe.fill("locationStream")();
					} else if (this.fields.type === "Assets/service") {
						state.serviceStream = this;
						pipe.fill("serviceStream")();
					}
				});
			});
		});

	},
	setupStaffAvatar: function (element, userId) {
		var tool = this;
		var previewState = tool.preview.state;
		var $element = $(element);

		$element.attr('data-staff', 'true');

		if (!$element.hasClass('Q_badge_tool')) {
			$element.tool('Q/badge', {
				tr: {
					size: "16px",
					right: "5px",
					className: "Calendars_availability_staff",
					display: 'block',
					content: '<i class="qp-communities-owner"></i>'
				}
			}).activate();
		}

		Q.Streams.get(previewState.publisherId, previewState.streamName, function () {
			var stream = this;

			$element.on(Q.Pointer.fastclick, function () {
				if (stream.testWriteLevel('close')) {
					var content = "<button class='Q_button' name='profile'>{{OpenProfile}}</button><button class='Q_button' name='remove'>{{RemoveStaff}}</button>";
					content = content.interpolate(tool.text.availabilities);

					Q.Dialogs.push({
						title: tool.text.availabilities.SelectAction,
						content: content,
						className: "Calendars_availability_staff_actions",
						onActivate: function (dialog) {
							$("button[name=profile]", dialog).on(Q.Pointer.fastclick, function () {
								Q.handle(tool.state.onProfile, tool, [userId]);
								Q.Dialogs.pop();
							});
							$("button[name=remove]", dialog).on(Q.Pointer.fastclick, function () {
								Q.req("Calendars/availability", "leave", null, {
									fields: {
										publisherId: stream.fields.publisherId,
										streamName: stream.fields.name,
										userId: userId
									}
								});
								Q.Dialogs.pop();
							});
						}
					});
				}
			})
		});
	},
	openDialog: function (saveCallback, fields) {
		var tool = this;
		var state = this.state;

		var _selectTemplate = function () {
			var assetsServicePreview = this;
			var $toolElement = $(assetsServicePreview.element);

			$toolElement.addClass("Q_selected").siblings(".Assets_service_preview_tool").removeClass("Q_selected");
			var publisherId = assetsServicePreview.preview.state.publisherId;
			var streamName = assetsServicePreview.preview.state.streamName;
			Q.Streams.get(publisherId, streamName, function () {
				state.serviceTemplate = {
					publisherId: publisherId,
					streamName: streamName,
					price: this.getAttribute('price'),
					currency: this.getAttribute('currency') || '$',
					requiredParticipants: this.getAttribute('requiredParticipants'),
					payment: this.getAttribute('payment'),
					link: this.getAttribute('link')
				};
			});
		};

		var _selectLocation = function (location) {
			if (Q.isEmpty(location)) {
				return state.location = null;
			}

			state.location = {
				publisherId: Q.Users.communityId,
				placeId: location.placeId,
				venue: location.venue,
				latitude: location.latitude,
				longitude: location.longitude,
				address: location.venue
				//timeZone: locationStream.getAttribute('timeZone')
			};
		};

		var title = Q.getObject("availabilities.NewAvailability.Title", tool.text) || "New Availability";
		if (tool.stream) {
			title = Q.getObject("availabilities.EditAvailability", tool.text) || "Edit Availability";
		}

		var $locationToolElement;
		var saveProcessing = false;
		var _saveAvailability = function (dialog) {

			if (saveProcessing) {
				return;
			}
			saveProcessing = true;

			if (!tool.state.serviceTemplate) {
				Q.alert(tool.text.availabilities.NewAvailability.SelectTemplate);
				return false;
			}

			if (Q.isEmpty(state.timeSlots)) {
				Q.alert(tool.text.availabilities.NewAvailability.SelectTime);
				return false;
			}

			var areaTool = Q.Tool.from($(".Places_areas_tool", $locationToolElement), "Places/areas");
			if (tool.state.location && areaTool) {
				if (areaTool.state.areaSelected) {
					tool.state.location.area = areaTool.state.areaSelected;
				}
			}

			Q.handle(saveCallback, dialog, [dialog]);
		};

		var usedColumns = !!$(tool.element).closest(".Q_columns_column").length;
		var $content = null;
		var $controls = null;
		Q.Template.render(
			"Calendars/availability/composer",
			Q.extend({},{text: tool.text.availabilities.NewAvailability}, fields),
			function (err, html) {
				if (err) {
					return;
				}

				$content = $(html);
				if (usedColumns) {
					$controls = $content[$content.length-1];
					delete $content[$content.length-1];
				}
			}
		);

		Q.invoke({
			title: title,
			trigger: tool.element,
			content: $content,
			controls: $controls,
			className: "Calendars_availability_composer",
			onActivate: function () {
				var $parent = null;
				if (this instanceof $) {
					$parent = this;
				} else {
					$parent = $(arguments[2]);
				}
				$parent[0].forEachTool("Assets/service/preview", function () {
					this.state.editable = false;

					// if stream exists - edit
					if (tool.stream) {
						var publisherId = tool.stream.getAttribute('serviceTemplate').publisherId;
						var streamName = tool.stream.getAttribute('serviceTemplate').streamName;

						if (this.preview.state.publisherId === publisherId && this.preview.state.streamName === streamName) {
							Q.handle(_selectTemplate, this);
						}
					}

					$(this.element).on(Q.Pointer.fastclick, _selectTemplate.bind(this));
				});

				var $livestream = $('.Calendars_availability_composer_livestream', $parent);
				var selectedLocation = null;
				var locationAttr = tool.stream ? tool.stream.getAttribute('location') : null;
				if (locationAttr) {
					selectedLocation = {
						placeId: locationAttr.placeId,
						venue: locationAttr.venue,
						area: Q.getObject("area.text", locationAttr)
					};
				}
				$locationToolElement = $(".Calendars_availability_composer_location", $parent).tool("Places/location", {
					publisherId: Q.Users.communityId,
					showAreas: true,
					showCurrent: false,
					selectedLocation: selectedLocation
				}).activate(function () {
					this.forEachChild('Places/location/preview', function () {
						var thisTool = this;
						if (this.element.classList.contains('Q_selected')) {
							setTimeout(function () {
								thisTool.element.scrollingParent().scrollTop = thisTool.element.offsetTop;
							}, 1000);
						}
					});

					this.state.onChoose.add(function (location) {
						var locationDefined = !!location;
						$livestream.attr("data-location", locationDefined);
						_selectLocation(location);
					}, tool);
				});
				var $timezoneName = $("select[name=timezoneName]", $livestream);
				$timezoneName.val(function () {
					var offset = new Date().getTimezoneOffset();
					var sign = offset < 0 ? '+' : '-';
					offset = Math.abs(offset);
					return "GMT" + sign + Math.round(offset/60);
				}());
				var $livestreamUrl = $("input[name=livestream]", $livestream);
				var $livestreamUrlPlaceHolder = $livestreamUrl.closest(".Q_placeholders_container");
				var $scheduleOnlineConference = $("button[name=scheduleOnlineConference]", $livestream);
				if (tool.stream) {
					var isLiveStream = tool.stream.getAttribute("livestream") === "true";
					var livestreamUrl = tool.stream.getAttribute("livestreamUrl");
					var timezoneName = tool.stream.getAttribute("timezone");
					$livestream.attr("data-livestream", isLiveStream);
					$livestreamUrl.val(livestreamUrl).trigger("change");
					if (isLiveStream) {
						if (livestreamUrl) {
							$livestreamUrlPlaceHolder.addClass("Q_selected");
						} else {
							$scheduleOnlineConference.addClass("Q_selected");
						}
					}
					if (timezoneName) {
						$timezoneName.val(tool.stream.getAttribute("timezone"));
					}
				}
				// on change $livestream, call prepareSteps
				$livestreamUrl.on('change input', function () {
					var val = $(this).val();
					if (val.matchTypes('url').length) {
						$scheduleOnlineConference.removeClass("Q_selected");
						$livestreamUrlPlaceHolder.addClass("Q_selected");
						$livestream.attr("data-livestream", true);
					} else {
						$livestreamUrlPlaceHolder.removeClass("Q_selected");
						$livestream.attr("data-livestream", false);
					}
				});
				// Set Schedule Conference
				$scheduleOnlineConference.on(Q.Pointer.fastclick, function () {
					if ($scheduleOnlineConference.hasClass("Q_selected")) {
						$scheduleOnlineConference.removeClass("Q_selected");
						$livestream.attr("data-livestream", false);
					} else {
						$scheduleOnlineConference.addClass("Q_selected");
						$livestream.attr("data-livestream", true);
						$livestreamUrl.val('');
						$livestreamUrl.closest(".Q_placeholders_container").removeClass("Q_selected");
					}
				});

				$(".Calendars_availability_composer_templates", $parent).tool("Streams/related", {
					publisherId: state.communityId,
					streamName: "Assets/services",
					relationType: "Assets/service",
					editable: false,
					closeable: false,
					sortable: false,
					relatedOptions: {
						withParticipant: false
					}
				}).activate();

				var selectedLabel = '';
				state.timeSlots = {};
				if (tool.stream) {
					state.timeSlots = tool.stream.getAttribute('timeSlots');

					selectedLabel = tool.stream.getAttribute('labels');
					if (Q.typeOf(selectedLabel) === 'object') {
						selectedLabel = Object.keys(selectedLabel)[0];
					}

					$("input[name=peopleMin]", $parent).val(tool.stream.getAttribute('peopleMin'));
					$("input[name=peopleMax]", $parent).val(tool.stream.getAttribute('peopleMax'));
				}

				// recurring startDate, endDate
				$("input[name=recurringStartDate], input[name=recurringEndDate]", $parent).pickadate({
					showMonthsShort: true,
					format: 'ddd, mmm d, yyyy',
					formatSubmit: 'yyyy/mm/dd',
					hiddenName: true,
					min: new Date(),
					container: 'body',
					onStart: function () {
						this.$root.css("z-index", Q.zIndexTopmost());
						//this.set('select', new Date(y, m, d));
					}
				});

				$(".Calendars_availability_composer_time", $parent).tool("Calendars/timeslots", {
					slots: {
						weekly: state.timeSlots
					}
				}).activate(function () {
					var timeSlotsTool = this;
					var _setTimeSlots = function () {
						var timeSlots = timeSlotsTool.getIntervals();
						if (Q.isEmpty(timeSlots)) {
							state.timeSlots = {};
						} else {
							state.timeSlots = timeSlots;
						}
					};

					timeSlotsTool.state.onCreate.set(_setTimeSlots, tool);
					timeSlotsTool.state.onRemove.set(_setTimeSlots, tool);
				});

				// read labels and fill select element
				var $labelsElement = $("select[name=labels]", $parent);
				Q.req("Calendars/event", ["labels"], function (err, response) {
					var msg = Q.firstErrorMessage(err, response && response.errors);
					if (msg) {
						throw new Q.Error(msg);
					}

					var labels = response.slots.labels;

					// remove old labels
					$("option", $labelsElement).remove();

					// fill with new labels
					for (var label in labels) {
						$labelsElement.append($("<option" + (selectedLabel === label ? ' selected="selected"' : '') + ">").attr("value", label).text(labels[label]));
					}
				}, {
					fields: {
						userId: tool.preview.state.publisherId
					}
				});

				$("button[name=next], button[name=back]", $parent).on(Q.Pointer.fastclick, function () {
					var action = $(this).prop('name');
					var currentStep = parseInt($(".Calendars_availability_steps.Q_current", $parent).attr('data-step'));

					if (action === 'next') {
						if (currentStep === 1 && !state.serviceTemplate) {
							Q.alert(tool.text.availabilities.NewAvailability.SelectTemplate);
							return false;
						}

						if (currentStep === 2 && !($livestream.attr("data-livestream") === "true" || $livestream.attr("data-location") === "true")) {
							Q.alert(tool.text.availabilities.NewAvailability.SelectLocation);
							return false;
						}

						if (currentStep === 3 && Q.isEmpty(state.timeSlots)) {
							Q.alert(tool.text.availabilities.NewAvailability.SelectTime);
							return false;
						}
					}

					$(".Calendars_availability_steps", $parent).each(function () {
						var $this = $(this);
						var step = $this.attr("data-step");
						var left = parseInt($this.attr('data-left') || (step - 1) * 100);
						var newLeft = action === 'next' ? -100 + left : 100 + left;

						$this.attr('data-left', newLeft).css("left", newLeft + '%');

						setTimeout(function () {
							if (newLeft === 0) {
								$(".Calendars_availability_buttons", $parent).attr('data-step', step);
								$this.addClass('Q_current');
								setTimeout(function() {
									var scrollingParent = $this[0].scrollingParent();
									if (scrollingParent) scrollingParent.scrollTop = 0;
								}, 0);
							} else {
								$this.removeClass('Q_current');
							}
						}, 500);
					});
				});

				$("button[name=save]", $parent).on(Q.Pointer.fastclick, function () {
					_saveAvailability($parent);
					Q.Dialogs.pop();
					return false;
				});
			}
		});
	}
});

Q.Template.set('Calendars/availability/preview',
`<div class="Streams_preview_container Streams_preview_view Q_clearfix">
	<!--<img class="Streams_preview_icon">-->
	<div class="Streams_preview_contents">
		<h3 class="Streams_preview_title Streams_preview_view">{{title}}</h3>
		<span class="Calendars_availability_preview_price">{{price}}</span>
		{{#if location}}
			<div class="Calendars_availability_preview_location">{{{location}}}</div>
		{{/if}}
		{{#if livestream}}
			<div class="Calendars_availability_preview_livestream">{{text.LiveStream}}</div>
		{{/if}}
		<div class="Calendars_availability_preview_description">{{description}}</div>
		<div class="Streams_participants_tool"></div>
	</div>
</div>`
);

Q.Template.set("Calendars/availability/composer",
`<div class="Calendars_availability_steps Q_current" data-step="1">
		<h2>{{text.SelectTemplate}}</h2>
		<div class="Calendars_availability_composer_templates"></div>
	</div>
	<div class="Calendars_availability_steps" data-step="2">
		<h2>{{text.SelectLocation}}</h2>
		<div class="Calendars_availability_composer_location"></div>
		<div class="Calendars_availability_composer_livestream">
			<button class="Q_button" name="scheduleOnlineConference">{{text.ScheduleOnlineConference}}</button>
			<div class="or">OR</div>
			<input name="livestream" placeholder="{{text.SetLivestream}}" data-type="url">
			<label for="timezoneName">{{text.SelectTimeZone}}: <select name="timezoneName">
                <option>GMT-12</option>
                <option>GMT-11</option>
                <option>GMT-10</option>
                <option>GMT-9</option>
                <option>GMT-8</option>
                <option>GMT-7</option>
                <option>GMT-6</option>
                <option>GMT-5</option>
                <option>GMT-4</option>
                <option>GMT-3</option>
                <option>GMT-2</option>
                <option>GMT-1</option>
                <option>GMT+0</option>
                <option>GMT+1</option>
                <option>GMT+2</option>
                <option>GMT+3</option>
                <option>GMT+4</option>
                <option>GMT+5</option>
                <option>GMT+6</option>
                <option>GMT+7</option>
                <option>GMT+8</option>
                <option>GMT+9</option>
                <option>GMT+10</option>
                <option>GMT+11</option>
                <option>GMT+12</option>
            </select></label>
		</div>
		<input type="hidden" name="valid" value="">
	</div>
	<div class="Calendars_availability_steps" data-step="3">
		<h2>{{text.Type}}</h2>
		<div class="Calendars_availability_composer_type"><select name="recurringType"><option>{{text.Weekly}}</option></select></div>
		<h2>{{text.RecurringStartDate}}</h2>
		<div class="Calendars_availability_composer_type"><input name="recurringStartDate" data-value="{{recurringStartDate}}" /></div>
		<h2>{{text.RecurringEndDate}}</h2>
		<div class="Calendars_availability_composer_type"><input name="recurringEndDate" data-value="{{recurringEndDate}}" /></div>
		<h2>{{text.SelectTime}}</h2>
		<div class="Calendars_availability_composer_time"></div>
	</div>
	<div class="Calendars_availability_steps" data-step="4">
		<h2>{{text.SetVisitors}}</h2>
		<div class="Calendars_availability_composer_visitors">
			<label for="peopleMax"><span>{{text.PeopleMax}}</span> <input name="peopleMax" type="text" maxlength="4" value="{{peopleMax}}" class="Calendars_minmax"></label>
			<label for="labels"><span>{{text.PeopleLabels}}</span> <select name="labels" class="Calendars_availability_composer_labels"></select></label>
		</div>
	</div>
	<div class="Calendars_availability_buttons" data-step="1">
		<button name="back" class="Q_button">&lt; {{text.Back}}</button>
		<button name="next" class="Q_button">{{text.Next}} &gt;</button>
		<button name="save" class="Q_button">{{text.SaveAvailability}}</button>
	</div>`
);

})(Q, Q.jQuery, window);