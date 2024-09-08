(function (Q, $, window, document, undefined) {

var Users = Q.Users;
var Streams = Q.Streams;

/**
 * Calendars Tools
 * @module Calendars-tools
 */

/**
 * Allows labels from Calendars/labelsCanManageEvents download of sample csv and upload a filled-out csv.
 * The upload starts a Streams/task where Streams/import handler runs and creates
 * events from the csv.
 * It also listens to Streams/task/progress messages on the task, displays progress
 * and provides a way to send mass messages to follow up the invitation messages.
 * @class Calendars import
 * @constructor
 * @param {array} [options] this array contains function parameters
 *   @param {String} [options.link] URL to the csv file to download, if any.
 *    Can be a full url, "{{Module}}/path/file.csv" or one of "university.csv" or "building.csv".
 *   @param {String} [options.communityId=Users::communityId] Community id on behalf of create events
 *   @param {String} [options.taskStream] Task stream for current tool. If it null, it will bre created from client.
 */
Q.Tool.define("Calendars/import", function (options) {
	var tool = this;
	var state = this.state;

	tool.refresh();
},

{
	communityId: Users.communityId,
	taskStream: null,
	link: null
},

{
	refresh: function () {
		var tool = this;
		var state = tool.state;

		var fields = {};

		if (state.link) {
			fields.href = state.link.isUrl() || state.link[0] === '{'
				? state.link
				: Q.url('{{Calendars}}/importing/' + state.link);
		}
		fields.communityId = state.communityId;
		Q.Template.render('Calendars/import/tool', fields, function (err, html) {
			Q.replace(tool.element, html);

			tool.$form = $('form', tool.element);
			tool.$fileLabel = $("label[for=Calendars_import_file]", tool.element);
			tool.$processElement = $(".Calendars_import_process", tool.element);
			tool.$progressElement = $(".Calendars_import_progress", tool.element);

			$("button[name=sampleCSV]", tool.element).on('click', function () {
				//window.location = Q.url("{{baseUrl}}/import/sample?communityId=" + state.communityId);
				return false;
			});

			_continue();
		});

		function _continue() {
			var $input = tool.$('input[type=file]')
				.click(function (event) {
					event.stopPropagation();
				}).change(_change);
			// for browsers that don't support the change event, have an interval
			this.ival = setInterval(function () {
				if ($input.val()) {
					_change();
				}
			}, 1000);
		}

		function _change() {
			if (!this.value) {
				return; // it was canceled
			}

			$("span", tool.$fileLabel).html(`(processing ${this.value})`);
			
			// task stream already defined, no need define it again
			Streams.retainWith(tool).create({
				publisherId: Users.loggedInUserId(),
				type: 'Streams/task',
				title: 'Importing events into ' + state.communityId
			}, function (err) {
				if (err) {
					return;
				}

				state.taskStream = this;

				// join current user to task stream to get messages
				this.join(function (err) {
					if (err) {
						return;
					}

					state.taskStream.refresh(function () {
						tool.postFile();
					}, {
						evenIfNotRetained: true
					});
				});

				$("input[name=taskStreamName]", tool.element).val(state.taskStream.fields.name);
			});
		}
	},
	/**
	 * send CSV file to server
	 * @method postFile
	 */
	postFile: function () {
		var tool = this;
		var state = this.state;

		if (!Streams.isStream(state.taskStream)) {
			throw new Q.Error("task stream invalid");
		}

		Q.Tool.remove(tool.$progressElement[0], true, false, "Streams/task/preview");
		tool.$progressElement.tool("Streams/task/preview", {
			publisherId: state.taskStream.fields.publisherId,
			streamName: state.taskStream.fields.name,
			//progress: "Q/pie"
		}).activate(function () {
			this.state.onComplete.set(tool.refresh.bind(tool), tool);
			this.state.onError.set(tool.refresh.bind(tool), tool);
		});
		tool.$processElement.show();

		Q.req("Calendars/import", [], function (err, response) {
			var msg = Q.firstErrorMessage(err, response && response.errors);
			if (msg) {
				return Q.alert(msg);
			}

		}, {
			method: 'POST',
			form: tool.$form[0]
		});

		tool.$fileLabel.addClass("Q_disabled");
		$("input:visible", tool.$form).prop("disabled", true);
	},
	Q: {
		beforeRemove: function () {
			if (this.ival) {
				clearInterval(this.ival);
			}
		}
	}
});

Q.Template.set('Calendars/import/tool',
	  `{{#if href}}<a href="{{href}}">{{import.linkTitle}}</a>{{/if}}
	<form enctype="multipart/form-data">
		<fieldset>
			<legend>{{import.fileLabel}}</legend>
			<label for="Calendars_import_file">{{import.ChooseFile}} <span></span></label>
	   		<input type="file" id="Calendars_import_file" name="file">
	   		<button name="sampleCSV" type="button">{{import.sampleCSV}}</button>
		</fieldset>
		<fieldset>
			<legend>{{import.importOptions}}</legend>
			<label data-for="toMainCommunityToo"><input type="checkbox" name="toMainCommunityToo"> {{import.toMainCommunityToo}}</label>
		</fieldset>
		<div class="Calendars_import_process">
			<fieldset>
				<legend>{{import.importProgress}}</legend>
				<div class="Calendars_import_progress"></div>
			</fieldset>
		</div>
		<input type="hidden" name="communityId" value="{{communityId}}">
		<input type="hidden" name="taskStreamName" value="{{taskStreamName}}">
	</form>`, {text: ['Calendars/content']}
);

})(Q, Q.jQuery, window, document);
