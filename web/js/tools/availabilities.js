(function (Q, $, window, undefined) {

/**
 * Calendars/availabilities tool.
 * Renders a tool to preview availabilities
 * @class Calendars/availabilities
 * @constructor
 */
Q.Tool.define("Calendars/availabilities", function() {
	var tool = this;
	var state = this.state;

	Q.Text.get('Calendars/content', function (err, text) {
		var msg = Q.firstErrorMessage(err);
		if (msg) {
			return console.warn(msg);
		}

		tool.text = text;

		tool.refresh();
	});

	if (Q.Users.loggedInUserId()) {
		Q.Streams.Stream.join(state.categoryPublisherId, state.categoryStreamName);
	}

	tool.element.forEachTool("Calendars/availability/preview", function () {
		this.state.editable = tool.state.editable;
	}, tool);
},

{
	categoryPublisherId: Q.Users.loggedInUserId(),
	categoryStreamName: "Calendars/availabilities/main",
	editable: true,
	realtime: true,
	sortable: false,
	creatable: true
},

{
	refresh: function () {
		var tool = this;
		var state = this.state;
		var $toolElement = $(this.element);

		var options = {
			publisherId: state.categoryPublisherId,
			streamName: state.categoryStreamName,
			relationType: 'Calendars/availability',
			editable: state.editable,
			closeable: state.closeable,
			realtime: state.realtime,
			sortable: state.sortable,
			relatedOptions: {
				withParticipant: false
			}
		};

		if (state.creatable) {
			options.creatable = {
				"Calendars/availability": {
					'title': Q.getObject("availabilities.NewAvailability.Title", tool.text) || "New Availability"
				}
			}
		}

		$toolElement.tool("Streams/related", options).activate();
	}
});

})(Q, Q.jQuery, window);