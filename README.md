# Calendars Plugin

Events, recurring schedules, service availabilities, reminders, and calendar exports for the Qbix platform. Calendars builds on Streams, Places, and Assets to provide a complete event lifecycle — creation with location and payment, RSVP with going states, recurring event generation, availability-based booking, CSV import, WebRTC teleconferencing, livestream integration, reminders, and ICS/GCal export.

## Core Concepts

### Events

A `Calendars/event` stream represents a scheduled happening with a start time, end time, location, and participant list. Events are extended via the `Calendars_Event` class (stored in `calendars_event` table) which caches denormalized interests and location JSON for efficient querying.

Key event attributes (stored in stream `attributes`): `startTime` (unix timestamp), `endTime`, `timezoneName`, `venue`, `communityId`, `peopleMin`, `peopleMax`, `labels` (access restriction), `teleconference` (boolean), `payment` (type/amount/currency), `eventUrl`, `ticketsUrl`, `contact`, `userId` (creator).

Events are related to their community's `Calendars/calendar/main` category stream via `Calendars/events` relation type, with `weight` set to `startTime` for chronological ordering. They can also be related to Places/location streams, interest streams, Places/area streams, and Places/nearby streams for geographic discovery.

### Going States

The `Calendars_Event::going()` method is the central RSVP mechanism. Each participant's going state is stored in `Streams_Participant.extra.going` with three values:

`yes` — User is confirmed attending. Checks `peopleMax` capacity, handles payment if required, subscribes to the event stream, and grants the `registered` participant role.

`maybe` — User is interested but not committed. Used as an intermediate state when payment is required but not yet completed. Grants the `requested` participant role.

`no` — User declines. Leaves the event stream, unrelates any related participant streams (pets, equipment), unsubscribes from the recurring category, and revokes roles.

Participant roles follow grouped exclusion: `(rejected, requested, registered)` and `(attendee, arrived)` are groups where granting one revokes siblings.

### Payment Integration

Events can require payment via the `payment` attribute with `type` = "required" or "optional". When `going('yes')` is called on a paid event, the system calls `Assets::pay()`. If the user has sufficient credits, payment succeeds immediately and going is set to "yes". If not, going is set to "maybe" with a `paymentIntent` attached, and the user is prompted to buy credits. The `Calendars/after/Assets_credits_spend` hook then upgrades going from "maybe" to "yes" after successful payment.

Publishers and admins (roles in `Calendars.events.admins`) bypass payment.

### Recurring Events

`Calendars/recurring` streams serve as category streams that group recurring instances of the same event. When an event is made recurring via `Calendars_Recurring::makeRecurring()`, a `Calendars/recurring` stream is created with `period` (e.g. "weekly") and `days` (e.g. `{"Mon": [], "Wed": [["9:00","10:00"]], "Fri": []}`) stored in attributes.

Each participant in the recurring category has their own day/time-slot preferences stored in `Streams_Participant.extra`: `period`, `days` (which days they attend), `startDate`, `endDate`, and `relatedParticipants`. This per-participant customization means different users can attend different days of the same recurring series.

`Calendars_Recurring::calculateTime()` computes the next occurrence timestamp given the current time and recurring rules. The `recurring.php` cron script creates future event instances from recurring categories.

### Availabilities

`Calendars/availability` streams define bookable time slots linked to an `Assets/service` template. An availability specifies which days and times are available (`timeSlots` attribute, keyed by weekday abbreviation with arrays of `[startTime, endTime]` pairs), a location (via Places), capacity limits (`peopleMin`, `peopleMax`), and payment configuration inherited from the service template.

`Calendars_Availability::aggregate()` creates or updates an availability. `Calendars_Availability::createEvents()` generates actual `Calendars/event` streams from the availability's time slots, relates them to the availability and its recurring category, and handles payment checking and staff auto-joining.

The availability→service→event chain: `Assets/service` (template) → `Calendars/availability` (schedule) → `Calendars/event` (individual booking).

### Calendars

`Calendars/calendar` streams serve as community event directories. Each community has a `Calendars/calendar/main` stream where events are related with `startTime` as the relation weight. Each user has a personal `Calendars/user/calendar` stream.

### Reminders

`Calendars/reminders` streams act as notification channels. Configurable reminder intervals (default: 5min, 1hr, 2hr, 5hr, 24hr) are defined in `Calendars.event.reminders`. The `reminders.php` cron script posts `Calendars/reminder` messages at the configured intervals before each event's start time. Users subscribe to their `Calendars/user/reminders` stream to receive these.

### Teleconferencing & Livestreaming

Events can include a WebRTC room (via `Media_WebRTC::scheduleOrUpdateRoomStream()`) related via `Calendars/event/webrtc`, or a livestream related via `Media/livestream`. When a teleconference starts or stops, `Media_WebRTC::postEventMessage()` posts notification messages (`Calendars/event/webrtc/started`, `Media/livestream/started`, etc.) to the event stream.

### CSV Import

`Calendars_Event::import()` bulk-creates events from CSV data (via a task stream). Required fields: `event_title`, `interest`, `venue_address`, `start_time`. Optional: `end_time`, `venue_name`, `venue_area`, `event_main_url`, `event_image_url`, `contact`, `event_description`, `tickets_url`, `speaker`, `leader`. Duplicate detection compares title + location + startTime.

### ICS & GCal Export

Routes serve calendar data in standard formats: `{publisherId}/{eventId}/{method}.gcal` (Google Calendar link), `{publisherId}/{eventId}/{method}.ics` (iCalendar file), and `Calendars/personal/{userId}.ics` (full personal calendar feed, capability-protected). `Calendars_Event::recurrenceRule()` generates RRULE strings for recurring events.

### Holidays

Per-country holiday JSON files in `config/holidays/{CC}.json` (120+ countries). Used for calendar display and event scheduling awareness.

## Database Schema

### calendars_event (extends Calendars/event streams)
```
publisherId  varbinary(31)   PK
streamName   varbinary(255)  PK
interests    varchar(2046)   NULL  — JSON array of related interest streams
location     varchar(1023)   NULL  — JSON object with venue, address, lat, lon, area
```

No other custom tables — all data lives in Streams infrastructure (stream attributes, participant extras, relations).

## Stream Types

| Type | Purpose |
|---|---|
| `Calendars/calendar` | Community or personal event directory |
| `Calendars/event` | Individual event (extended by Calendars_Event) |
| `Calendars/recurring` | Recurring series category with period/days rules |
| `Calendars/availability` | Bookable time slots linked to a service |
| `Calendars/reminders` | Per-user reminder notification channel |

## User Streams

| Stream Name | Purpose |
|---|---|
| `Calendars/participating/events` | Category tracking events user has joined |
| `Calendars/calendar/main` | Community events calendar |
| `Calendars/user/calendar` | Personal calendar |
| `Calendars/user/reminders` | Personal reminder channel |
| `Calendars/availabilities/main` | Community availabilities category |

## Roles

`Calendars/admins` — Can create/edit/delete events, bypass payment, manage recurring categories. `Calendars/staff` — Can be auto-joined to availability-generated events, limited role management.

## Configuration

```json
{
    "Calendars": {
        "events": {
            "defaults": {
                "duration": 7200,
                "peopleMin": 0,
                "peopleMax": 100,
                "payment": { "amountMin": 1, "amountMax": 1000, "currency": "credits" }
            },
            "admins": ["Calendars/admins", "Users/owners", "Users/admins"]
        },
        "event": {
            "reminders": { "86400": {"selected": true}, "3600": {"selected": true}, "600": {} },
            "templateStyle": "classic",
            "hideLocationIfNotPaid": true
        }
    }
}
```