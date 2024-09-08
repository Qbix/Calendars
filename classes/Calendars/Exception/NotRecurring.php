<?php

/**
 * @module Q
 */
class Calendars_Exception_NotRecurring extends Q_Exception
{
	/**
	 * @class Calendars_Exception_NotRecurring
	 * @constructor
	 * @extends Q_Exception
	 * @param {string} $type
	 */
};

Q_Exception::add('Calendars_Exception_NotRecurring', 'This {{type}} is not recurring.');
