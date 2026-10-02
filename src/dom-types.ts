/**
 * Structural types for the `<forcecal-main>` element shipped by
 * @forcecalendar/interface (>= 1.6.0). These remain structural so plain event
 * objects and legacy interface releases are supported. The interface package
 * owns the global DOM tag declarations; the adapter exports its own public
 * surface without introducing a conflicting HTMLElementTagNameMap entry.
 */

export type CalendarView = 'month' | 'week' | 'day';

/** Built-in theme presets plus any custom theme name. */
export type CalendarTheme = 'slds' | (string & {});

/** Minimal shape of a calendar event as accepted and returned by the element. */
export interface CalendarEvent {
  id: string;
  title?: string;
  start: Date | string;
  end?: Date | string;
  allDay?: boolean;
  backgroundColor?: string;
  textColor?: string;
  description?: string;
  location?: string;
  recurrenceRule?: string;
  [key: string]: unknown;
}

export interface EventsSetOptions {
  /** Remove stored events that are absent from the snapshot. Defaults to true. */
  removeMissing?: boolean;
}

export interface EventsSetUpdate {
  /** Event now held by the calendar. */
  event: CalendarEvent;
  /** Event instance it replaced. */
  oldEvent: CalendarEvent;
}

/** Change set produced by `setEvents()` / the `events` property. */
export interface EventsSetResult {
  events: CalendarEvent[];
  added: CalendarEvent[];
  updated: EventsSetUpdate[];
  removed: CalendarEvent[];
  unchanged: CalendarEvent[];
}

/** Window of dates covered by the current view; `end` is inclusive. */
export interface VisibleRange {
  start: Date;
  end: Date;
}

/** DOM event name → `event.detail` payload for every event the element dispatches. */
export interface ForceCalendarEventMap {
  'calendar-navigate': { action: 'next' | 'previous' | 'today' | 'goto'; date: Date };
  'calendar-view-change': { view: CalendarView };
  'calendar-date-select': { date: Date };
  'calendar-event-add': { event: CalendarEvent };
  'calendar-event-added': { event: CalendarEvent };
  'calendar-event-update': { event: CalendarEvent };
  'calendar-event-updated': { event: CalendarEvent };
  'calendar-event-remove': { eventId: string };
  'calendar-event-deleted': { eventId: string };
  'calendar-events-set': EventsSetResult;
  'calendar-range-change': VisibleRange & { view: CalendarView; date: Date };
  'calendar-range-select': { start: Date; end: Date };
}

/** The upgraded `<forcecal-main>` element. */
export interface ForceCalendarElement extends HTMLElement {
  /** Declarative form of `setEvents(events)`; reading returns the events currently held. */
  events: CalendarEvent[];
  setEvents(events: Iterable<CalendarEvent>, options?: EventsSetOptions): EventsSetResult | null;
  getVisibleRange(): VisibleRange | null;
  getEvents(): CalendarEvent[];
  addEvent(event: Partial<CalendarEvent>): CalendarEvent | null;
  updateEvent(id: string, updates: Partial<CalendarEvent>): CalendarEvent | null;
  deleteEvent(id: string): boolean;
  setView(view: CalendarView): void;
  setDate(date: Date | string): void;
  next(): void;
  previous(): void;
  today(): void;
  addEventListener<K extends keyof ForceCalendarEventMap>(
    type: K,
    listener: (this: ForceCalendarElement, ev: CustomEvent<ForceCalendarEventMap[K]>) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener<K extends keyof ForceCalendarEventMap>(
    type: K,
    listener: (this: ForceCalendarElement, ev: CustomEvent<ForceCalendarEventMap[K]>) => void,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions,
  ): void;
}
