<?php

/**
 */
function Calendars_event_webhook_Stripe_charge($params)
{
	// TODO do something when webhook comes
}
/*
 * Example of webhook response
 *
{
	"id": "evt_1Bsw8hLXOK3Au08lDXpZ7LWu",
  "object": "event",
  "api_version": "2018-02-05",
  "created": 1518022279,
  "data": {
	"object": {
		"id": "ch_1Bsw8hLXOK3Au08lxsiiQJ3y",
      "object": "charge",
      "amount": 10000,
      "amount_refunded": 0,
      "application": null,
      "application_fee": null,
      "balance_transaction": "txn_1Bsw8hLXOK3Au08lRpvVW1zY",
      "captured": true,
      "created": 1518022279,
      "currency": "usd",
      "customer": "cus_CHEIb8f9c8LVPK",
      "description": null,
      "destination": null,
      "dispute": null,
      "failure_code": null,
      "failure_message": null,
      "fraud_details": {
		},
      "invoice": null,
      "livemode": false,
      "metadata": {
			"streamName": "Calendars/event/Qwyejstcg",
        "publisherId": "secvxhmp",
        "userId": "true",
        "description": "Judaism: Daily Mincha"
      },
      "on_behalf_of": null,
      "order": null,
      "outcome": {
			"network_status": "approved_by_network",
        "reason": null,
        "risk_level": "normal",
        "seller_message": "Payment complete.",
        "type": "authorized"
      },
      "paid": true,
      "receipt_email": null,
      "receipt_number": null,
      "refunded": false,
      "refunds": {
			"object": "list",
        "data": [

			],
        "has_more": false,
        "total_count": 0,
        "url": "/v1/charges/ch_1Bsw8hLXOK3Au08lxsiiQJ3y/refunds"
      },
      "review": null,
      "shipping": null,
      "source": {
			"id": "card_1BsfpKLXOK3Au08l0LtuSdjF",
        "object": "card",
        "address_city": null,
        "address_country": null,
        "address_line1": null,
        "address_line1_check": null,
        "address_line2": null,
        "address_state": null,
        "address_zip": null,
        "address_zip_check": null,
        "brand": "Visa",
        "country": "US",
        "customer": "cus_CHEIb8f9c8LVPK",
        "cvc_check": null,
        "dynamic_last4": null,
        "exp_month": 3,
        "exp_year": 2022,
        "fingerprint": "KZAuJitpxmdvLQIS",
        "funding": "credit",
        "last4": "4242",
        "metadata": {
			},
        "name": "hello@world.com",
        "tokenization_method": null
      },
      "source_transfer": null,
      "statement_descriptor": null,
      "status": "succeeded",
      "transfer_group": null
    }
  },
  "livemode": false,
  "pending_webhooks": 1,
  "request": {
	"id": "req_kKH2903Eq4WZsj",
    "idempotency_key": null
  },
  "type": "charge.succeeded"
}
*/