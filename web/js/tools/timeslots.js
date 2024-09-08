(function (Q, $, window, undefined) {
	var Calendars = Q.Calendars;

/**
 * Calendars/timeslots tool.
 * Renders an times slots to select for event.
 * @class Calendars/timeslots
 * @param {Object} [options] options to pass
 *   @param {String} [options.max=1] Maximum events can be applied to this interval.
 *   @param {Array} [options.period=weekly] Period of event recurring. Currently only weekly supported.
 *   @param {string} [options.minutesPeriod=15] Minutes of which to split hour when create startTime, endTime lists.
 *   @param {boolean} [options.showNearest=false] If true show the date of nearest week day.
 *   @param {object} [options.slots]
 *   @param {object} [options.mode] Can be "composer" and "select". In "composer" mode user create time slots.
 *   In "select" mode user select from available time slots.
 *   @param {number} [options.startHour=0] Hours select elements will start from this hour.
 *   @param {number} [options.endHour=24] Hours select elements will end with this hour.
 *   @param {boolean} [options.multipleSelect=false] If true allow to select multiple time slots
 *   @param {Q.Event} [options.onCreate] Event fired after user created time slot in "composer" mode.
 *   @param {Q.Event} [options.onRemove] Event fired after user removed time slot in "composer" mode.
 *   @param {Q.Event} [options.onDeselect] Occur when time slot deselect in "select" mode.
 *   @param {Q.Event} [options.onSelect] Occur when time slot selected in "select" mode.
 */
Q.Tool.define("Calendars/timeslots", function(options) {
	var tool = this;

	var pipe = new Q.Pipe(["styles", "datejs", "text"], tool.refresh.bind(tool));
	Q.addStylesheet("{{Calendars}}/css/timeslots.css", pipe.fill("styles"),{ slotName: 'Calendars' });
	Q.addScript("{{Q}}/js/datejs/date.js", pipe.fill("datejs"),{ slotName: 'Q' });
	Q.Text.get('Calendars/content', function (err, content) {
		var msg = Q.firstErrorMessage(err, content);
		if (msg) {
			return console.error(msg);
		}

		tool.text = content;
		pipe.fill("text")();
	});
},

{
	max: 1,
	period: 'weekly',
	minutesPeriod: 15,
	showNearest: false,
	slots: {
		weekly: {
			Mon: [],
			Tue: [],
			Wed: [],
			Thu: [],
			Fri: [],
			Sat: [],
			Sun: []
		}
	},
	startHour: 0,
	endHour: 24,
	mode: "composer",
	multipleSelect: false,
	onCreate: new Q.Event(),
	onRemove: new Q.Event(),
	onSelect: new Q.Event(),
	onDeselect: new Q.Event()
},

{
	refresh: function () {
		var tool = this;
		var state = this.state;
		var period = state.period;
		var $toolElement = $(tool.element);
		var filledSlots = {};

		// show only days where slots available
		Q.each(state.slots[period], function (day, slots) {

			// sort time slots
			slots = slots.sort(function(a, b) { return parseInt(a[0]) - parseInt(b[0]); });

			// in "composer" mode we show all days
			if (state.mode === 'composer') {
				filledSlots[day] = slots;
			// in "select" mode we show only days filled with slots
			} else if (state.mode === "select" && !Q.isEmpty(slots)) {
				filledSlots[day] = slots;
			}
		});

		Q.Template.render('Calendars/timeslot',
		{
			period: period,
			slots: filledSlots,
			composer: state.mode === 'composer',
			showNearest: state.showNearest,
			text: tool.text
		},
		function (err, html) {
			if (err) return;
			$toolElement.html(html);

			// fill "date of next week day"
			$(".Calendars_timeslot_date", $toolElement).each(function () {
				var $this = $(this);
				var weekDay = $this.attr("data-weekDay").toLowerCase();
				var weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
				var weekDayIndex = weekdays.indexOf(weekDay.toLowerCase());
				var formattedDate = "";
				if (Date.today().getDay() == weekDayIndex) {
					formattedDate = tool.text.timeslots.Today.toLowerCase();
				} else if (Date.parse("tomorrow").getDay() == weekDayIndex) {
					formattedDate = tool.text.timeslots.Tomorrow.toLowerCase();
				} else {
					formattedDate = Date.parse("next " + weekDay).toString("d MMM");
				}

				$this.html(formattedDate);
			});

			// parse slots
			$("ul.Calendars_timeslot_period > li[data-start]", $toolElement).each(function () {
				tool.createSlot(this);
				tool.fillCopyDays();
			});

			$("select[name=copyFromDay]", $toolElement).on('change', function () {
				var $this = $(this);
				var $parent = $this.closest("li[data-weekday]");
				var day = $this.val();

				// remove current time slots before copy from day
				$("li[data-start][data-end]", $parent).remove();

				$("[data-weekday=" + day + "] li[data-start][data-end]", $toolElement).each(function () {
					var $this = $(this);
					var startTime = $this.attr('data-start');
					var endTime = $this.attr('data-end');

					tool.addSlot(startTime, endTime, $parent);
				});
			});

			// add slot
			$(".Calendars_timeslot_period .Calendars_timeslot_add", $toolElement).on(Q.Pointer.fastclick, function () {
				var $parent = $(this).closest("li[data-weekday]");

				Q.Dialogs.push({
					className: 'Calendars_timeslot_addslot',
					title: tool.text.timeslots.AddSlot,
					template: {
						name: 'Calendars/timeslot/addslot',
						fields: {
							text: tool.text.timeslots
						}
					},
					onActivate: function (dialog) {
						var $start = $("select[name=start]", dialog);
						var $end = $("select[name=end]", dialog);

						var timeFormatted, time, intTime, item;
						var $slots = $('li[data-start]', $parent);
						var weekDay = $parent.attr('data-weekday');
						var timesList = []; // for future use

						// create timeList object for future use
						for (var hour = state.startHour; hour < state.endHour; hour++) {
							for (var minutes = 0; minutes < 60; minutes += state.minutesPeriod) {
								timeFormatted = Q.timeInLocale(hour + ":" + minutes);
								time = hour + ':' + function () {
									if (minutes === 0) return '00';
									if (minutes < 10) return '0' + minutes;
									return minutes;
								}();

								item = {time: time, timeFormatted: timeFormatted};

								$slots.each(function () {
									var $this = $(this);
									var slotStartTime = tool.timeToInt($this.attr('data-start'));
									var slotEndTime = tool.timeToInt($this.attr('data-end'));
									var calculatedTime = tool.timeToInt(time);

									if (calculatedTime > slotStartTime && calculatedTime < slotEndTime) {
										item.reserved = true;
									}
								});

								timesList.push(item);
							}
						}

						Q.each(timesList, function (index, obj) {
							if (Q.getObject("reserved", timesList[index])) {
								return;
							}

							$start.append($("<option />").prop('value', obj.time).text(obj.timeFormatted));
						});

						$start.on('change', function () {
							var timeSelected = tool.timeToInt($start.val());
							var endSelected = $end.val();
							var reserved = false;
							$("option[value!=null]", $end).remove();

							Q.each(timesList, function (index, obj) {
								intTime = tool.timeToInt(obj.time);

								if (obj.reserved && timeSelected < intTime) {
									reserved = true;
								}

								if (reserved || intTime <= timeSelected) {
									return;
								}

								$("<option />").prop('value', obj.time).text(obj.timeFormatted).appendTo($end);
							});

							endSelected && $end.val(endSelected);
							$end.prop('disabled', false);
						});

						$("button[name=save]", dialog).on(Q.Pointer.fastclick, function () {
							var startTime = $start.val();
							var endTime = $end.val();

							if (isNaN(tool.timeToInt(startTime))) {
								return false;
							}
							if (isNaN(tool.timeToInt(endTime))) {
								return false;
							}

							tool.addSlot(startTime, endTime, $parent);

							Q.Dialogs.pop();
						});
					}
				});
			});

		});
	},
	timeToInt: function (time) {
		return parseInt(time.replace(':', ''));
	},
	/**
	 * Create time slot element
	 * @method createSlot
	 * @param {HTMLElement|jQuery|Array} [data] Can be array with startTime, endTime ['12:00', '13:00'] or li tag with
	 * attributes data-start='12:00', data-end='13:00'.
	 */
	createSlot: function (data) {
		var tool = this;
		var state = this.state;

		if (data instanceof HTMLElement) {
			data = $(data);
		}

		if (!(data instanceof jQuery)) {
			data = $("<li></li>").attr('data-start', data[0]).attr('data-end', data[1]);
		}

		var startTime = data.attr('data-start');
		var endTime = data.attr('data-end');
		var res = Q.timeInLocale(startTime) + ' - ' + Q.timeInLocale(endTime);

		var $timeSlot = $("<span class='Calendars_timeslot_slot'></span>").html(res).appendTo(data);
		if (state.mode === 'select') {
			$timeSlot.on(Q.Pointer.fastclick, function () {
				if (!state.multipleSelect) {
					$("li[data-start]", tool.element).removeClass('Q_selected');
				}
				data.toggleClass('Q_selected');

				var day = data.closest('[data-weekday]').attr("data-weekday");
				Q.handle(data.hasClass("Q_selected") ? state.onSelect : state.onDeselect, tool, [day, [startTime, endTime], data]);
			});
		}

		if (state.mode === 'composer') {
			$("<i class='qp-communities-close'></i>").on(Q.Pointer.fastclick, function () {
				data.remove();
				tool.fillCopyDays();
				Q.handle(state.onRemove, tool, [[data.attr('data-start'), data.attr('data-end')]]);
			}).appendTo(data);
		}

		return data;
	},
	/**
	 * Add time slot element to $parent and skip duplicates.
	 * @method addSlot
	 * @param {HTMLElement|jQuery|Array} [data] Can be array with startTime, endTime ['12:00', '13:00'] or li tag with
	 * attributes data-start='12:00', data-end='13:00'.
	 */
	addSlot: function (startTime, endTime, $parent) {
		var timeSlot = [startTime, endTime];

		// don't duplicate time slots
		if ($("li[data-start='" + startTime + "'][data-end='" + endTime + "']", $parent).length) {
			return;
		}

		this.createSlot(timeSlot).prependTo($(".Calendars_timeslot_period", $parent));
		this.fillCopyDays();
		Q.handle(this.state.onCreate, this, [timeSlot]);
	},
	/**
	 * Collecting selected intervals.
	 * return object with week days as keys and array of intervals as values.
	 * @method getIntervals
	 * @param {string} [period='weekly']
	 * @param {boolean} [onlySelected=false] If true return only selected intervals.
	 */
	getIntervals: function (period, onlySelected=false) {
		period = period || 'weekly';
		var res = {};

		$("ul.Calendars_timeslot[data-period=" + period + "] > li", this.element).each(function () {
			var $weekDay = $(this);
			var weekDay = $weekDay.attr('data-weekday');
			res[weekDay] = [];
			$("ul.Calendars_timeslot_period > li" + (onlySelected ? ".Q_selected" : ""), $weekDay).each(function () {
				var $this = $(this);
				var startTime = $this.attr('data-start');
				var endTime = $this.attr('data-end');

				if (!startTime || !endTime) {
					return;
				}

				res[weekDay].push([startTime, endTime]);
			});
			if (Q.isEmpty(res[weekDay])) {
				delete res[weekDay];
			}
		});

		return res;
	},
	/**
	 * Fill elements 'copyFromDay' with days where time slots defined.
	 * @method fillCopyDays
	 */
	fillCopyDays: function () {
		var $toolElement = $(this.element);

		$("select[name=copyFromDay] option[value!=null]", $toolElement).remove();

		// find filled days
		var filledDays = [];
		Q.each(this.state.slots.weekly, function (day) {
			if ($("li[data-weekday=" + day + "] li[data-start][data-end]", $toolElement).length) {
				filledDays.push(day);
			}
		});

		// mark elements
		$("li[data-weekday]", $toolElement).removeAttr('data-copyFromDays');

		if (!filledDays.length) {
			return;
		}

		// fill select elements with days
		Q.each(filledDays, function (index, day) {
			var $dayElement = $("li[data-weekday][data-weekday!=" + day + "]", $toolElement);
			$("select[name=copyFromDay]", $dayElement).append($("<option>").text(day));
			$dayElement.attr('data-copyFromDays', true);
		});

	}
});

Q.Template.set('Calendars/timeslot',
	'<ul class="Calendars_timeslot" data-period="{{period}}">' +
	'{{#each slots}}' +
	'	<li data-weekday="{{@key}}"><span class="Calendars_timeslot_weekDay">{{lookup ../text.weekdays @key}}</span>' +
	'	{{#if ../showNearest}}' +
	'		<span class="Calendars_timeslot_nearest">({{lookup ../text.timeslots "Nearest"}} <span class="Calendars_timeslot_date" data-weekDay="{{@key}}"></span>)</span>' +
	'	{{/if}}' +
	': <ul class="Calendars_timeslot_period">' +
	'	{{#each this}}' +
	'		<li data-start="{{lookup this 0}}" data-end="{{lookup this 1}}"></li>' +
	'	{{/each}}' +
	'	{{#if ../composer}}' +
	'		<li class="Calendars_timeslot_add"><i class="qp-communities-plus"></i> {{lookup ../text.timeslots "AddTimeSlot"}}</li>' +
	'		<li class="Calendars_timeslot_cfd">' +
	'			<i class="qp-communities-copy"></i>' +
	'			<select name="copyFromDay"><option value="null" selected>{{lookup ../text.timeslots "CopyFromDay"}}</option></select>' +
	'		</li>' +
	'	{{/if}}' +
	'	</ul></li>' +
	'{{/each}}' +
	'<ul>'
);
Q.Template.set('Calendars/timeslot/addslot',
	'<select name="start">' +
	'<option value="null">{{text.StartTime}}</option><select>' +
	' - ' +
	'<select name="end" disabled>' +
	'<option value="null">{{text.EndTime}}</option><select>' +
	'<button name="save" class="Q_button">{{text.Save}}</button>'
);

})(Q, Q.jQuery, window);