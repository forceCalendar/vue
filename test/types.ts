// Compile-time assertions against emitted declarations, checked with both
// Bundler and NodeNext module resolution by npm test.
// Each `@ts-expect-error` line fails the build if the following statement
// stops being a type error.
import type { GlobalComponents } from 'vue';
// Load the interface's own global DOM declarations beside the shipped adapter
// declarations. With skipLibCheck disabled this catches conflicting tag maps.
import type {} from '@forcecalendar/interface';
import {
  ForceCalendar,
  type CalendarEvent,
  type EventDetail,
  type ForceCalendarElement,
  type ForceCalendarHandle,
  type RangeChangeDetail,
} from '../dist/index.js';

type Props = InstanceType<typeof ForceCalendar>['$props'];

export const valid: Props = {
  view: 'week',
  weekStartsOn: 1,
  theme: 'slds',
  date: new Date(),
  events: [{ id: '1', title: 'Standup', start: '2026-08-31T09:00:00Z' }],
  removeMissingEvents: false,
  onRangeChange: (detail: RangeChangeDetail) => detail.start.getTime(),
  onEventsSet: detail => detail.added.length + detail.updated[0].oldEvent.id.length,
  onEventAdded: detail => detail.event.id,
  onEventDeleted: detail => detail.eventId.toUpperCase(),
  onDateSelect: detail => detail.date.getTime(),
  onNavigate: detail => detail.action === 'next',
  onViewChange: detail => detail.view === 'day',
  onRangeSelect: detail => detail.end.getTime() - detail.start.getTime(),
};

// @ts-expect-error listeners for events the calendar never emits are rejected
export const madeUpListener: Props = { onTotallyMadeUpEvent: () => undefined };

// @ts-expect-error `view` is limited to the CalendarView literals
export const badView: Props = { view: 'not-a-view' };

// @ts-expect-error `weekStartsOn` is limited to 0-6
export const badWeekStart: Props = { weekStartsOn: 7 };

declare const detail: EventDetail;
// @ts-expect-error an event payload is an object, not a number
export const notANumber: number = detail;

// @ts-expect-error `date` on a range change is a Date, not a string
export const badRangeListener: Props = { onRangeChange: (d: { date: string }) => d };

// Global registration is typed.
export const registered: GlobalComponents['ForceCalendar'] = ForceCalendar;

// The exposed handle and element types line up.
declare const handle: ForceCalendarHandle;
export const element: ForceCalendarElement | null = handle.element;
export const firstVisibleDay: Promise<Date | undefined> = handle
  .whenReady()
  .then(el => el.getVisibleRange()?.start);
export const added: CalendarEvent | null | undefined = handle.addEvent({ id: 'x', start: new Date() });
export const typedListener = (el: ForceCalendarElement): void =>
  el.addEventListener('calendar-range-select', e => e.detail.start.getTime());

// Structural inputs must not become the core's CalendarEvent class type.
export const plainEvent: CalendarEvent = { id: 'plain', start: '2026-09-01', custom: true };
handle.setEvents([plainEvent]);
handle.addEvent({ start: '2026-09-01' });
handle.updateEvent('plain', { title: 'Updated' });
export const queried: ForceCalendarElement | null =
  document.querySelector<ForceCalendarElement>('forcecal-main');
