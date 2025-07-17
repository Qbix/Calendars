(function (Q, $, window, undefined) {
	var Calendars = Q.Calendars;

/**
 * Calendars/payment tool.
 * Renders an option to make the event cost some money.
 * @class Calendars/payment
 */
Q.Tool.define("Calendars/payment", function(options) {
	var tool = this;

	Q.Text.get('Calendars/content', function (err, content) {
		var msg = Q.firstErrorMessage(err, content);
		if (msg) {
			console.error(msg);
			return;
		}

		tool.text = content;
		tool.refresh();
	});
},

{
	currency: 'credits',
	paymentOptions: ['free', 'optional', 'required'],
	onComplete: new Q.Event(),
	onError: new Q.Event()
},

{
	refresh: function () {
		var tool = this;

		var selectOptions = tool.state.paymentOptions.map(function(value) {
			return { value: value, title: tool.text.payment.selectOptions[value] };
		});
		Q.Template.render('Calendars/payment/select',
		{
			selectOptions: selectOptions,
			currency: tool.state.currency
		},
		function (err, html) {
			if (err) return;
			Q.replace(tool.element, html);;
			tool.$select = tool.$('select');
			var $amountDiv = tool.$('.Calendars_composer_payment_amount');
			tool.$amount = $amountDiv.find('.Calendars_composer_payment_amount_input');
			tool.$amount.attr('placeholder', tool.text.payment.amountPlaceholder);
			tool.$select.on('change', function() {
				var val = tool.$select.val();
				setVal();
				if (['optional', 'required'].indexOf(val) !== -1) {
					tool.$amount.parent().removeClass('warn');
					$amountDiv.show(function(){
						tool.$amount.focus();
					});
				} else {
					$amountDiv.hide();
				}
			});
			setVal();
			tool.$amount.on('input', function() {
				setVal();
			});
			tool.$amount.on('blur', function() {
				setVal();
			});
			function setVal() {
				var val = parseFloat(tool.$amount.val()) || 0;
				tool.$amount.parent().removeClass('warn');

				if (tool.isValid()) {
					Q.handle(tool.state.onComplete, tool, [val]);
				} else {
					tool.$amount.parent().addClass('warn');
					Q.handle(tool.state.onError, tool, [val]);
				}
				return val;
			}
		});
	},
	isValid: function() {
		var tool = this;

		var amountMin = Q.getObject('Q.Calendars.Event.defaults.payment.amountMin');
		var amountMax = Q.getObject('Q.Calendars.Event.defaults.payment.amountMax');
		var amount = parseFloat(tool.$amount.val());
		if (tool.$select.val() === 'free') {
			return true;
		}
		if (!amount) {
			return false
		}
		if (amountMin && (amount < amountMin)) {
			return false;
		}
		return !(amountMax && (amount > amountMax));
	},
	setValue: function (type, value) {
		var tool = this;

		tool.$select.val(type).trigger('change');
		tool.$amount.val(value).trigger('input');
	},
	getValue: function() {
		var tool = this;

		if (tool.$select.val() === 'free') {
			return null;
		}
		return {
			type: tool.$select.val(),
			amount: parseFloat(tool.$amount.val()).toFixed(2),
			currency: tool.state.currency
		};
	}
});

Q.Template.set('Calendars/payment/select',
	'<select name="payment" id="payment">' +
	'{{#each selectOptions}}<option value="{{value}}">{{title}}</option>{{/each}}' +
	'</select>' +
	'<div class="Calendars_composer_payment_amount" style="display: none">' +
	'<div class="Calendars_composer_payment_amount_input_wrapper">' +
	'<input class="Calendars_composer_payment_amount_input" placeholder="" value="">' +
	'</div>' +
	' {{currency}}' +
	'</div>'
);

})(Q, Q.jQuery, window);