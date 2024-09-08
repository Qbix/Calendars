<?php
/**
 * @module Calendars
 */
/**
 * Class for dealing with Calendar events payment
 *
 * @class Calendars_Payment
 */
class Calendars_Payment
{
	/**
	 * Sets attributes of a stream
	 * @method setInfo
	 * @param Streams_Stream $stream Streams for which this payment created
	 * @param {array} $paymentInfo
	 * @param {string} $paymentInfo.type Required. "free", "optional" or "monthly"
	 * @param {integer} $paymentInfo.amount Required.
	 * @param {string} $paymentInfo.currency Required.
	 * @return void
	 * @throws Q_Exception
	 */
	static function setInfo($stream, $paymentInfo)
	{
		if (empty($paymentInfo) || (!empty($paymentInfo['type']) && ($paymentInfo['type'] === 'free'))) {
			return null;
		}
		Calendars_Payment::validate($paymentInfo);
		$stream->setAttribute('payment', array(
			'type' => $paymentInfo['type'],
			'amount' => floatval($paymentInfo['amount']),
			'currency' => $paymentInfo['currency']
		));
		$stream->save();
	}

	/**
	 * @method validate
	 * @param {array} $paymentInfo
	 * @param {string} $paymentInfo.type Required. "free", "optional" or "monthly"
	 * @param {integer} $paymentInfo.amount Required.
	 * @return void
	 * @throws Q_Exception
	 */
	static function validate($paymentInfo) {
		if (empty($paymentInfo['amount'])) {
			throw new Q_Exception("Empty payment amount");
		}
		if (empty($paymentInfo['currency'])) {
			throw new Q_Exception("Currency is not specified");
		}
		$paymentInfo['amount'] = intval($paymentInfo['amount']);
		$amount =& $paymentInfo['amount'];
		if (!in_array($paymentInfo['type'], array('required', 'optional'))) {
			throw new Q_Exception("Unknown payment type");
		}
		$defaults = Q_Config::expect('Calendars', 'events', 'defaults');
		$amountMin = null;
		$amountMax = null;
		if (!empty($defaults['payment']['amountMin'])) {
			$amountMin = $defaults['payment']['amountMin'];
		}
		if (!empty($defaults['payment']['amountMax'])) {
			$amountMax = $defaults['payment']['amountMax'];
		}
		if ($amountMin && ($amount < $amountMin)) {
			throw new Q_Exception("Payment amount less than " . $amountMin . " is not allowed");
		}
		if ($amountMin && ($amount > $amountMax)) {
			throw new Q_Exception("Payment amount more than " . $amountMax. " is not allowed");
		}
	}

}