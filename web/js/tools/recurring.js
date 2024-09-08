(function (Q, $, window, undefined) {
	var Calendars = Q.Calendars;

/**
 * Calendars/recurring tool.
 * Renders a tool make some stream recurring.
 * @class Calendars/recurring
 * @constructor
 * @param {Object} [options] options to pass
 *   @param {String} [options.action=settings] Can be "settings" (allow to edit recurring days) or "view" (view event recurring days).
 *   @param {Array} [options.days=[]] Array of days.
 *   @param {Object} [options.possibleDays] Object of possible days. Empty object means all days possible.
 *   @param {String} [options.startDate] date after recurring available
 *   @param {String} [options.endDate] date after recurring unavailable
 *   @param {string} [options.publisherId] Publisher id of recurring stream (if stream exist)
 *   @param {string} [options.streamName] streamName of recurring stream (if stream exist)
 *   @param {Q.Event} [options.onDaysChosen] Event fired after user closes dialog
 *   @param {Boolean} [options.modToolElement=true] If false don't change tool element html content. Just set events.
 */
Q.Tool.define("Calendars/recurring", function(options) {
	var tool = this;
	var state = this.state;

	Q.addStylesheet("{{Calendars}}/css/recurring.css", {slotName: 'Calendars'});

	Q.Text.get('Calendars/content', function (err, content) {
		var msg = Q.firstErrorMessage(err, content);
		if (msg) {
			console.error(msg);
			return;
		}

		tool.text = content;

		// if composer (no recurring stream created yet) or admin action
		if (state.action === 'admin' || (!state.publisherId && !state.streamName)) {
			// possibleDays - all week days
			Q.each(Object.keys(tool.text.weekdaysLong), function (key, weekDay) {
				state.possibleDays[weekDay] = [];
			});
		}

		tool.refresh();
	});
},

{
	days: [],
	startDate: null,
	endDate: null,
	period: "weekly",
	action: "settings",
	modToolElement: true,
	possibleDays: {},
	publisherId: null,
	streamName: null,
	onBeforeDialog: null,
	onDaysChosen: new Q.Event()
},

{
	/**
	 * Create just settings icon
	 * @method settings
	 */
	refresh: function () {
		var tool = this;
		var state = this.state;
		var $te = $(tool.element);

		Q.Template.render('Calendars/recurring/' + state.action, function (err, html) {
			if (err) return;

			if (state.modToolElement) {
				$te.html(html);
			}

			$te.on(Q.Pointer.fastclick, function(event){
				event.stopPropagation();
				event.preventDefault();

				if (Q.typeOf(state.onBeforeDialog) === 'function') {
					// mark icon as loading
					$te.addClass("Q_working");

					Q.handle(state.onBeforeDialog, tool, [function (state) {
						if (state !== false) {
							Q.handle(tool.openDialog, tool);
						}

						$te.removeClass("Q_working");
					}]);
				} else {
					Q.handle(tool.openDialog, tool);
				}
			}).on(Q.Pointer.start, function (event) {
				event.stopPropagation();
				event.preventDefault();
			});
		});
	},
	/**
	 * Open dialog with days list to select
	 * @method openDialog
	 */
	openDialog: function () {
		var tool = this;
		var state = this.state;
		Calendars.Recurring.dialog({
			period: state.period,
			days: state.days,
			startDate: state.startDate,
			endDate: state.endDate,
			action: state.action,
			possibleDays: state.possibleDays,
			callback: function(days, startDate, endDate){
				state.days = days;

				// if stream exists - update participant to recurring category stream
				if (state.publisherId && state.streamName) {
					Calendars.Recurring.setRecurring({
						fields: {
							publisherId: state.publisherId,
							name: state.streamName
						}
					}, {
						action: state.action,
						period: state.period,
						days: days,
						startDate: startDate,
						endDate: endDate
					});
				}

				Q.handle(state.onDaysChosen, tool, [days]);
			}
		});
	}
});

Q.Template.set('Calendars/recurring/settings',
	'<i class="Calendars_composer_recurring_settings"></i>'
);

Q.Template.set('Calendars/recurring/view',
	'<i class="Calendars_composer_recurring_view"></i>'
);

Q.Template.set('Calendars/recurring/admin',
	'<i class="Calendars_composer_recurring_admin"></i>'
);

})(Q, Q.jQuery, window);