# Calendar – neo.mjs UI

Port of the GOUI calendar (`../goui/script`) to the neo webclient (`www/views/neo`).
Styles: theme-go, `www/views/neo/resources/scss/src/apps/go/calendar/` (class
`GO.calendar.X` → `X.scss`, `GO.calendar.field.X` → `field/X.scss`; shared mixins in
`_cal.scss`). Rebuild with `npm run build-themes` in `www/views/neo`.

## Files

| Path | GOUI | What |
|---|---|---|
| `Index.mjs` | `Index.ts` | ModuleRegistry entry: routes (`CalendarEvent` → `event/<id>`), quick add, My account card |
| `data.mjs` | `Index.ts` stores | user (`calendarPreferences`, time zone, first weekday, e-mail aliases), module rights (session capability), subscribed calendars (+ owner principals), categories, views, resource groups; reloads on push, fires `change` |
| `util/date.mjs` | `DateTime`, `DateInterval` | local "wall time" dates, ISO durations (`addDuration`, `diffDuration`), ISO weeks, user time zone conversion (`toUserTime`) |
| `util/Recurrence.mjs` | core `Recurrence` (ical.js) | own RRULE expander: daily/weekly/monthly/yearly, interval, count, until, byDay (nth), byMonthDay, byMonth, byYearDay, byWeekNo, bySetPosition |
| `CalendarItem.mjs` | `CalendarItem.ts` | view model: expand recurrences/overrides, permissions (`mayChange`, `mayMove`, `calendarPrincipal`), save/patch (this / this and future / all), schedule question, delete, RSVP, cut/copy/paste. Dialogs via `CalendarItem.ui` (set by CalendarMain) |
| `CalendarAdapter.mjs` | `CalendarAdapter.ts` + `Main.registerProviders()` | providers event, holiday, task, birthday; tasks/birthdays open through the other module's route |
| `view/CalendarMain.mjs` | `Main.ts`, `CalendarList.ts` | layout, toolbar, routes, sidebar (MiniCalendar, views, calendars, other, categories, filters), dialog openers |
| `view/CalendarView.mjs` | `CalendarView.ts` | base of the views: event vdom, selection, context menus, day drag (month, all day row) |
| `view/WeekView.mjs`, `MonthView`, `YearView`, `SplitView`, `ListView` | same names | the views |
| `view/EventDialog.mjs`, `EventDetail.mjs`, `EventDetailDialog.mjs`, `ExceptionsDialog.mjs` | `EventWindow`, `EventDetail` | editor and detail |
| `view/field/*` | `AlertField`, `ParticipantField`, `LocationField`, … | form fields (native select, suggestions, chips, colour) |
| `view/CalendarDialog`, `CategoryDialog`, `ViewDialog`, `WebcalDialog`, `SubscribeDialog`, `ImportDialog`, `Resource*Dialog`, `AvailabilityDialog`, `InvitationsDialog`, `PreferencesPanel` | the GOUI windows | admin dialogs |

## Notes

- **Views render plain vdom** and handle all mouse input with delegated DOM listeners
  (`data-uid`, `data-date`, `data-day`, `data-action` attributes). Geometry for drag &
  drop comes from the `rect` of the path nodes neo sends with every mouse event; mousemove
  is a `local: true` listener.
- **Saving an event bypasses `DataSourceForm.submit()`**: `EventDialog.submit()` sends the
  modified values through `CalendarItem` (schedule question, recurring choice,
  `sendSchedulingMessages`).
- **Push**: `CalendarEvent` changes reload the period (adapter). Per-user calendar
  properties (colour, visibility) don't always arrive as a push: dialogs reload
  `calendarData` after saving.
- **Not ported**: e-mail iTIP buttons and `go.openIcs` (ExtJS e-mail module), alert
  panel buttons, swipe gestures, tooltips as HTML popups (a `title` attribute instead),
  the availability drag (click places the event).
- Test user: no calendar admin rights, so categories / views / resources dialogs were
  only checked to open; the server refuses categories without `mayChangeCategories`.
