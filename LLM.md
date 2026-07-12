# Calendars Plugin — LLM Coding Primer

Supplement to the Q Framework, Streams, Places, and Assets primers. Covers events,
going states, recurring schedules, availabilities, reminders, and calendar export.

---

## 1. Creating Events

```php
// Full event creation with location, payment, recurring
$event = Calendars_Event::create(array(
    'eventTitle'         => 'Weekly Meetup',
    'interestTitle'      => 'Hiking',           // or array of titles
    'placeId'            => $googlePlaceId,      // Google Places ID
    'localStartDateTime' => '2024-03-15 18:00',  // local to venue timezone
    'localEndDateTime'   => '2024-03-15 20:00',  // optional
    'duration'           => '2:00',              // alternative to endTime (H:M)
    'startTime'          => null,                // unix timestamp overrides localStartDateTime
    'endTime'            => null,                // unix timestamp overrides localEndDateTime
    'publisherId'        => $communityId,        // defaults to logged-in user
    'communityId'        => $communityId,        // for relating to community calendar
    'experienceId'       => 'main',              // or array of IDs
    'description'        => 'Meet at the trailhead',
    'icon'               => $imageUrlOrData,     // auto-searched if omitted
    'teleconference'     => false,               // true = create WebRTC room
    'peopleMin'          => 2,
    'peopleMax'          => 20,
    'labels'             => "Users/members\tUsers/guests",  // tab-delimited access labels
    'payment'            => array(               // null = free event
        'type'     => 'required',                // 'required' or 'optional'
        'amount'   => 10,
        'currency' => 'USD'
    ),
    'recurring'          => array(               // null = one-time event
        'period' => 'weekly',
        'days'   => array('Mon' => array(), 'Wed' => array())
    ),
    'contact'            => 'organizer@example.com'
), $skipAccess);
// Returns Streams_Stream (the event)
// Auto-relates to: community calendar, location, interests, nearby grid

// Event stream attributes after creation:
// startTime, endTime, timezoneName, venue, communityId, peopleMin, peopleMax,
// labels, labelTitles, payment, teleconference, eventUrl, ticketsUrl, userId
```

---

## 2. Going States (RSVP)

```php
// Set a user's going state
$participant = Calendars_Event::going($eventStream, $userId, 'yes', array(
    'skipPayment'            => false,   // true = bypass payment check
    'paid'                   => false,   // set if already paid externally
    'autoCharge'             => false,   // true = auto-charge saved card
    'skipRecurringParticipant'=> false,  // true = don't update recurring prefs
    'skipSubscription'       => false,   // true = join without subscribing
    'relatedParticipants'    => null     // array of related streams (pets, etc.)
));
// Throws Q_Exception if event already started
// Throws Streams_Exception_Full if peopleMax reached
// Returns Streams_Participant with extra.going = 'yes'|'maybe'|'no'

// Check going state
$going = Calendars_Event::getGoing($eventStream, $userId);
// Returns 'yes', 'no', or 'maybe'

// With participant object
$result = Calendars_Event::getGoing($eventStream, $userId, true);
// Returns ['participant' => Streams_Participant|null, 'going' => 'yes'|'no'|'maybe']

// Payment flow when going='yes' on a paid event:
// 1. Assets::pay() is called
// 2. If credits sufficient → going='yes', role='registered'
// 3. If credits insufficient → going='maybe', role='requested',
//    paymentIntent returned for client-side payment prompt
// 4. After payment webhook → going upgraded to 'yes' via
//    Calendars/after/Assets_credits_spend hook
```

**Participant roles (grouped — granting one revokes siblings):**
```
Group 1: rejected, requested, registered
Group 2: attendee, arrived
```

---

## 3. Querying Events

```php
// Events the user is participating in
$streams = Calendars_Event::participating(
    $userId,                    // null = logged-in user
    strtotime('-1 hour'),       // fromTime (earliest endTime)
    strtotime('+30 days'),      // untilTime (latest startTime)
    array('yes', 'maybe')       // going filter — string or array
);
// Returns array of Streams_Stream objects

// Also available on the Calendars class (same signature)
$streams = Calendars::participating($userId, $fromTime, $untilTime, $going);

// Get community calendar stream
$calendar = Calendars::stream($communityId, 'main');
// Returns Calendars/calendar/main stream (creates if missing)

// Get event info for iCal export
$info = Calendars_Event::info($eventStream, 'America/New_York');
// Returns: publisherId, streamName, startTime, endTime, start, end,
//          timezoneName, title, content, url, address, createdTime

// Check admin permissions
$isAdmin = Calendars_Event::isAdmin($userId, $communityId);
// Checks roles: Calendars/admins, Users/owners, Users/admins
```

---

## 4. Recurring Events

```php
// Make an event recurring
$recurringCategory = Calendars_Recurring::makeRecurring($eventStream, array(
    'period' => 'weekly',
    'days'   => array(
        'Mon' => array(),                       // all day
        'Wed' => array(array('9:00', '10:00')), // specific time slots
        'Fri' => array()
    )
));
// Creates Calendars/recurring stream with period + days attributes
// Relates event to recurring category via 'Calendars/recurring' type

// Get recurring category from an event
$recurringStream = Calendars_Recurring::fromStream($eventStream);
// Returns Streams_Stream or null

// Get last event in a recurring series
$lastEvent = Calendars_Recurring::getLastStream($recurringStream);

// Calculate next occurrence time
$nextTime = Calendars_Recurring::calculateTime($currentStartTime, array(
    'period' => 'weekly',
    'days'   => array('Mon' => array(), 'Thu' => array())
));
// Returns unix timestamp of next valid day

// Set per-user recurring preferences
$participant = Calendars_Recurring::setRecurringParticipant($eventStream, array(
    'period' => 'weekly',
    'days'   => array('Mon' => array(array('9:00','10:00'))),
    'startDate' => '2024-03-01',
    'endDate'   => '2024-06-01',
    'relatedParticipants' => array(
        array('publisherId' => $pid, 'streamName' => $sn)
    ),
    'updateExistingStreams' => true,  // apply to future events
    'skipStream'           => false  // skip current event
));
// Stored in Streams_Participant.extra on the Calendars/recurring stream
```

---

## 5. Availabilities (Service Booking)

```php
// Create or update an availability
$availability = Calendars_Availability::aggregate(array(
    'template'  => array(                       // REQUIRED: Assets/service stream
        'publisherId' => $publisherId,
        'streamName'  => 'Assets/service/Q123'
    ),
    'location'  => array(                       // REQUIRED (or teleconference)
        'placeId' => $googlePlaceId,
        'area'    => array('publisherId' => $pid, 'streamName' => $areaName)
    ),
    'timeSlots' => array(                       // REQUIRED
        'Mon' => array(array('9:00', '10:00'), array('14:00', '15:00')),
        'Wed' => array(array('10:00', '11:00')),
        'Fri' => array(array('9:00', '10:00'))
    ),
    'teleconference'     => false,
    'recurringStartDate' => '2024-03-01',
    'recurringEndDate'   => '2024-06-01',
    'peopleMin'          => 1,
    'peopleMax'          => 5,
    'labels'             => array('Users/members' => 'Members')
));
// Returns Calendars/availability stream
// Auto-creates recurring category and relates to Assets/service + location

// Generate events from an availability
$events = Calendars_Availability::createEvents($availabilityStream, array(
    'recurring'    => true,       // participate user during creation
    'paymentCheck' => false,      // true = just check cost, don't create
    'userId'       => $userId
));
// Returns array of Calendars/event streams (or cost check results)

// Chain: Assets/service → Calendars/availability → Calendars/event
// The service template provides: title, content, icon, price, currency, payment type
// The availability provides: timeSlots, location, capacity, recurring rules
// Events are the bookable instances created from the availability
```

---

## 6. Payment

```php
// Set payment info on an event
Calendars_Payment::setInfo($eventStream, array(
    'type'     => 'required',    // 'required', 'optional', or 'free'
    'amount'   => 25,
    'currency' => 'USD'
));
// Validates against Calendars.events.defaults.payment.amountMin/amountMax
// Saves to stream attribute 'payment'

// Payment is enforced in Calendars_Event::going() when type='required'
// Publishers and admins bypass payment automatically
```

---

## 7. CSV Import

```php
// Import events from CSV via task stream
Calendars_Event::import($taskStream);
// $taskStream->instructions = JSON array of CSV rows
// Required columns: event_title, interest, venue_address, start_time
// Optional: end_time, venue_name, venue_area, event_image_url, contact,
//           event_description, tickets_url, speaker, leader
// Multiple start_time values (newline-separated) create multiple events
// Duplicate detection: same title + location + startTime = update, not create
// Posts Streams/task/progress messages during processing
```

---

## 8. Reminders & Calendar Export

```php
// Reminder config (seconds before event):
// 86400 (24hr), 18000 (5hr), 7200 (2hr), 3600 (1hr), 600 (5min)
// Cron: scripts/Calendars/reminders.php posts Calendars/reminder messages

// ICS export routes:
// {publisherId}/{eventId}/add.ics → single event ICS file
// {publisherId}/{eventId}/add.gcal → Google Calendar link
// Calendars/personal/{userId}.ics → full personal calendar (capability-protected)

// Generate RRULE for recurring event
$rrule = Calendars_Event::recurrenceRule($publisherId, $streamName, $userId);
// Returns: "RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR" or null

// Reschedule an event (shifts affected events in the calendar)
$event = Calendars_Event::reschedule($publisherId, $streamName, $newStartTime, array(
    'asUserId' => $userId
));
// Updates startTime/endTime on the event AND shifts other events
// in the same calendar that fall between old and new times
```

---

## 9. WebRTC & Livestream

```php
// Events with teleconference=true get a Media/webrtc room auto-created
// Related via 'Calendars/event/webrtc'

// Post notification to event about teleconference state
Calendars_Event::postMessage($webrtcStream, 'join');   // first join → started
Calendars_Event::postMessage($webrtcStream, 'leave');  // last leave → ended
// Message types: Calendars/event/webrtc/started, Calendars/event/webrtc/ended
//                Calendars/event/livestream/started, Calendars/event/livestream/ended
```

---

## 10. Utility Methods

```php
// Default event duration from config
$seconds = Calendars_Event::defaultDuration();  // default 7200 (2 hours)

// Calculate start time from local datetime + location
$timestamp = Calendars_Event::calculateStartTime('2024-03-15 18:00', $locationStream);
// Uses location's timeZone attribute for conversion

// Calculate duration
$seconds = Calendars_Event::calculateDuration('2024-03-15 18:00', '2024-03-15 20:00');

// Get event interests (related Streams/interest streams)
$interests = Calendars_Event::getInterests($eventStream);
// Returns array of {publisherId, name, title}

// Get event location (from related Places/location + Places/area)
$location = Calendars_Event::getLocation($eventStream);
// Returns: publisherId, name, venue, address, latitude, longitude, timeZone, area

// Get availability from event
$availability = Calendars_Event::getAvailability($eventStream);
// Get service from event (via availability)
$service = Calendars_Event::getService($eventStream);

// Get nearest date from time slots
$dates = Calendars_Event::getNearestDate($timeSlots, $locationStream);
// Returns [startTimestamp, endTimestamp] for next matching slot

// Relate event to community calendar
Calendars_Event::relateToCommunity($eventStream, $communityId);
```

---

## 11. Common Mistakes

| Wrong | Right |
|-------|-------|
| Creating events with `Streams::create()` directly | Use `Calendars_Event::create()` — handles location, interests, calendar relations, recurring, payment, icon import |
| Setting going state by modifying participant extra | Use `Calendars_Event::going()` — handles payment, capacity, roles, recurring, subscriptions |
| Using `startTime` in local timezone | `startTime`/`endTime` are always UTC unix timestamps; use `localStartDateTime` + `placeId` for timezone conversion |
| Forgetting `timezoneName` when no `placeId` | If no location, must pass `timezoneName` (e.g. "America/New_York") |
| Creating recurring events manually | Use `Calendars_Recurring::makeRecurring()` — creates category stream, sets up participant preferences |
| Checking payment status on participant directly | Use `Assets_Credits::getPaymentsInfo($userId, $stream)` — the canonical payment check |
| Accessing `calendars_event` table directly for location | Use `Calendars_Event::getLocation()` or `Places_Location::fromStream()` — the table is a denormalized cache |
| Creating availabilities without Assets/service template | Availability requires a `template` param pointing to an `Assets/service` stream |
| Assuming `going('yes')` always sets going to 'yes' | If payment required and insufficient credits, going is set to 'maybe' with a paymentIntent |

---

## 12. Key Schema

### calendars_event (extends Calendars/event streams)
```sql
publisherId  varbinary(31)   PK
streamName   varbinary(255)  PK
interests    varchar(2046)   NULL  -- JSON: [{publisherId, name, title}, ...]
location     varchar(1023)   NULL  -- JSON: {publisherId, name, venue, address, lat, lon, timeZone, area}
```

**No other custom tables.** All other data is stored in:
- **Stream attributes:** startTime, endTime, timezoneName, venue, payment, peopleMin/Max, timeSlots, location
- **Participant extras:** going (yes/no/maybe), startTime, period, days, startDate, endDate, relatedParticipants, role
- **Relations:** events→calendar (weight=startTime), events→recurring, events→availability, events→location, events→interest

---

## 13. Configuration Reference

```
Calendars.events.defaults.duration = 7200        — default event duration (seconds)
Calendars.events.defaults.peopleMin = 0          — default min attendees
Calendars.events.defaults.peopleMax = 100        — default max attendees
Calendars.events.defaults.payment.*              — amountMin, amountMax, currency
Calendars.events.admins                          — roles that can manage events
Calendars.event.reminders                        — reminder intervals {seconds: {selected: bool}}
Calendars.event.templateStyle                    — 'classic', 'tall', or 'square'
Calendars.event.hideLocationIfNotPaid            — hide venue until user pays
Calendars.event.icon.search                      — image search services for event icons
Calendars.newEvent.location                      — show location picker in composer
Calendars.newEvent.teleconference                — show teleconference toggle
Calendars.user.calendars.alerts.minutes          — personal calendar alert lead time
```