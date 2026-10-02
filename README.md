# @forcecalendar/vue

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Thin Vue 3 adapter for [forceCalendar](https://forcecalendar.org) — enterprise calendar Web Components that run under Salesforce Locker Service and strict CSP.

Maps props to the `<forcecal-main>` element's attributes, its DOM events to typed Vue emits, feeds an `events` snapshot through the element's `setEvents()` API and exposes the element's methods on a template ref. SSR-safe (custom elements register client-side only), so it works with Nuxt out of the box.

## Install

```bash
npm install @forcecalendar/vue @forcecalendar/core @forcecalendar/interface
```

Peers: `vue >= 3.3`, `@forcecalendar/interface >= 1.6.0 < 2`, `@forcecalendar/core >= 2.0.0 < 3`.

## Use

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { ForceCalendar, type CalendarEvent, type RangeChangeDetail } from '@forcecalendar/vue';

const events = ref<CalendarEvent[]>([
  { id: '1', title: 'Standup', start: '2026-08-31T09:00:00Z', end: '2026-08-31T09:15:00Z' },
]);

async function loadRange({ start, end }: RangeChangeDetail) {
  // Replace the array; the calendar diffs the snapshot against what it holds.
  events.value = await fetchEvents(start, end);
}
</script>

<template>
  <ForceCalendar
    view="month"
    theme="slds"
    timezone="America/New_York"
    height="600px"
    :events="events"
    @range-change="loadRange"
    @date-select="({ date }) => console.log('selected', date)"
    @event-added="({ event }) => console.log('added', event)"
  />
</template>
```

## Props

| Prop | Type | Notes |
| --- | --- | --- |
| `view` | `'month' \| 'week' \| 'day'` | Rendered as the `view` attribute. |
| `date` | `Date \| string` | A `Date` is serialised with `toISOString()`. |
| `locale` | `string` | BCP 47 tag, e.g. `en-AU`. |
| `timezone` | `string` | IANA zone, e.g. `Australia/Sydney`. |
| `weekStartsOn` | `0 \| 1 \| 2 \| 3 \| 4 \| 5 \| 6` | Rendered as `week-starts-on`. |
| `height` | `string` | Any CSS length. |
| `theme` | `'slds' \| string` | Built-in preset or a custom theme name. |
| `events` | `CalendarEvent[]` | Complete snapshot of the calendar's events; see below. |
| `removeMissingEvents` | `boolean` (default `true`) | Whether events absent from the next `events` snapshot are removed. |

Anything else — `class`, `id`, `aria-*`, `data-*`, an object `:style` — falls through to `<forcecal-main>`.

### The `events` prop

The snapshot is applied imperatively with `element.setEvents(events, { removeMissing })` and is never rendered as an attribute. Details worth knowing:

- Replace the array to update the calendar (`events.value = [...]`). The prop is watched by identity, not deeply; the element then diffs the snapshot, so unchanged events keep their instances and the view re-renders at most once.
- A snapshot load emits one `events-set` describing the change set (`added`, `updated`, `removed`, `unchanged`). It does **not** emit per-event `event-added` / `event-updated` / `event-deleted`; those fire for changes made through the element's own UI or `addEvent()` / `updateEvent()` / `deleteEvent()`.
- Keep the array in a `ref` or `computed`. An inline literal in the template is a new array every render, which re-applies the snapshot (cheap, but `events-set` fires with everything `unchanged`).
- `undefined` (or `null`) leaves the calendar's events alone — use it when you manage events through the exposed methods instead. Pass `[]` to clear.
- `removeMissingEvents` is read when the next snapshot is applied; toggling it alone does nothing.
- When the component mounts before `@forcecalendar/interface` has registered the element, the snapshot is stored on the element and applied as soon as it upgrades (interface 1.6.0 and later).

### Styling caveat

A string `style` attribute replaces the element's inline `style` wholesale and wipes the `--fc-*` theme tokens the calendar sets there. Use the object form (`:style="{ borderRadius: '8px' }"`), which Vue merges property by property.

## Emits

All emits deliver the DOM event's `detail` as their single argument and are fully typed. Use the kebab-case spelling in templates (`@events-set`, `@range-change`, `@range-select`, …) or the `onXxx` form with `h()` / TSX.

| Emit | Payload | Fires when |
| --- | --- | --- |
| `@navigate` | `{ action: 'next' \| 'previous' \| 'today' \| 'goto'; date: Date }` | The visible date changes through navigation. |
| `@view-change` | `{ view: CalendarView }` | The view switches. |
| `@date-select` | `{ date: Date }` | A day is selected. |
| `@range-select` | `{ start: Date; end: Date }` | A range is selected by dragging. |
| `@range-change` | `{ start: Date; end: Date; view: CalendarView; date: Date }` | The visible window changes — also once after mount with the initial window, so you can load data for it. |
| `@event-added` | `{ event: CalendarEvent }` | An event was added. |
| `@event-updated` | `{ event: CalendarEvent }` | An event was changed. |
| `@event-deleted` | `{ eventId: string }` | An event was removed. |
| `@events-set` | `EventsSetResult` | A snapshot was applied through `events` / `setEvents()`. |

> **Listen through the emits, not the raw DOM events.** `<forcecal-main>` dispatches `calendar-range-change`, `calendar-events-set` and friends; because they are undeclared, a `@calendar-range-change` listener still falls through to the element and receives the raw `CustomEvent`, untyped, with the payload on `.detail`. That path is not supported and may stop working — use `@range-change`.

The element's legacy `calendar-event-add` / `-update` / `-remove` aliases are intentionally not mapped: each operation already fires its `-added` / `-updated` / `-deleted` event, and mapping both would run every handler twice.

## Methods (template ref)

A template ref resolves to a `ForceCalendarHandle`: the element's public methods, the element itself, and `whenReady()`, which resolves once the component is mounted and `forcecal-main` is defined. Until then (or with an `@forcecalendar/interface` older than 1.6.0) a method call logs a warning and returns `undefined` rather than throwing.

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ForceCalendar, type ForceCalendarHandle } from '@forcecalendar/vue';

const calendar = ref<ForceCalendarHandle | null>(null);

onMounted(async () => {
  const el = await calendar.value!.whenReady();
  const range = el.getVisibleRange(); // { start, end } — end is inclusive
  const result = calendar.value!.setEvents(await fetchEvents(range!.start, range!.end), {
    removeMissing: true,
  });
  console.log(result?.added.length, 'events added');
});
</script>

<template>
  <ForceCalendar ref="calendar" view="week" />
  <button @click="calendar?.today()">Today</button>
</template>
```

| Method | Returns |
| --- | --- |
| `element` | The `<forcecal-main>` element (`null` before mount). |
| `whenReady()` | `Promise<ForceCalendarElement>` |
| `addEvent(event)` | `CalendarEvent \| null` |
| `updateEvent(id, updates)` | `CalendarEvent \| null` |
| `deleteEvent(id)` | `boolean` |
| `getEvents()` | `CalendarEvent[]` |
| `setEvents(events, { removeMissing? })` | `EventsSetResult \| null` (null when applied before initialisation) |
| `getVisibleRange()` | `{ start: Date; end: Date } \| null` |
| `setView(view)`, `setDate(date)`, `next()`, `previous()`, `today()` | `void` |

`$el` still resolves to the element for anyone relying on the Vue instance API.

## Types

Registering the component globally (`app.component('ForceCalendar', ForceCalendar)`) is typed in templates through Vue's `GlobalComponents` augmentation. The package also exports `CalendarEvent`, `CalendarView`, `CalendarTheme`, `VisibleRange`, `EventsSetOptions`, `EventsSetResult`, `EventsSetUpdate`, `ForceCalendarElement`, `ForceCalendarEventMap`, `ForceCalendarHandle` and one `*Detail` type per emit. Event inputs remain structural, so plain objects are accepted.

`@forcecalendar/interface` 1.7 and later owns the global `HTMLElementTagNameMap` declaration for `forcecal-main`. Load its declarations with `import type {} from '@forcecalendar/interface'` to get automatic typing for direct DOM queries. The adapter does not redeclare it, avoiding conflicts when both packages' types are loaded. When using interface 1.6, import `ForceCalendarElement` from this adapter and annotate direct DOM queries explicitly, for example `document.querySelector<ForceCalendarElement>('forcecal-main')`. Component props, emits and template refs keep the same types on both versions.

## SSR

`renderToString` produces `<forcecal-main …>` with its attributes; the custom elements are registered on the client by importing `@forcecalendar/interface` in `onMounted`. If that import fails the error is logged with a `[@forcecalendar/vue]` prefix instead of being swallowed.

## Upgrading from 0.2

- `@forcecalendar/interface` 1.6.0 or later is required.
- Emits are declared as an object with typed validators. Templates that relied on the previous string-array typing to accept arbitrary `onXxx` listeners or payload types now get type errors — the intended fix is to use one of the nine emits above.
- `@range-change`, `@range-select` and `@events-set` are new (in 0.2 they silently never fired).

Docs: [docs.forcecalendar.org](https://docs.forcecalendar.org) · License: [MIT](LICENSE)

### Read-only calendars

Pass the boolean `readOnly` prop to disable interactive editing (requires
`@forcecalendar/interface >= 1.8.0`). `false` or omission keeps editing enabled.
The adapter maps this to the `readonly` boolean attribute consistently during
server rendering, lazy element registration, and later prop changes.
Programmatic event methods remain available in read-only mode.
