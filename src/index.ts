/**
 * @forcecalendar/vue — thin Vue 3 adapter for the forceCalendar
 * Web Component. Maps props to attributes and DOM events to typed emits
 * that deliver `event.detail`. No dependencies beyond the peer Vue and
 * forceCalendar packages.
 */
import { defineComponent, h, onBeforeUnmount, onMounted, ref, type PropType } from 'vue';
import type { CalendarView, ForceCalendarElement, ForceCalendarEventMap } from './dom-types';

export type {
  CalendarEvent,
  CalendarTheme,
  CalendarView,
  EventsSetOptions,
  EventsSetResult,
  EventsSetUpdate,
  ForceCalendarElement,
  ForceCalendarEventMap,
  VisibleRange,
} from './dom-types';

const TAG = 'forcecal-main';

export type NavigateDetail = ForceCalendarEventMap['calendar-navigate'];
export type ViewChangeDetail = ForceCalendarEventMap['calendar-view-change'];
export type DateSelectDetail = ForceCalendarEventMap['calendar-date-select'];
export type EventDetail = ForceCalendarEventMap['calendar-event-added'];
export type EventDeletedDetail = ForceCalendarEventMap['calendar-event-deleted'];
export type EventsSetDetail = ForceCalendarEventMap['calendar-events-set'];
export type RangeChangeDetail = ForceCalendarEventMap['calendar-range-change'];
export type RangeSelectDetail = ForceCalendarEventMap['calendar-range-select'];

/**
 * DOM event → emit. Only the "-added/-updated/-deleted" lifecycle events are
 * mapped; the element also dispatches legacy "-add/-update/-remove" aliases
 * for the same operations and forwarding both would fire every handler twice.
 */
const EVENT_MAP = {
  'calendar-event-added': 'eventAdded',
  'calendar-event-updated': 'eventUpdated',
  'calendar-event-deleted': 'eventDeleted',
  'calendar-date-select': 'dateSelect',
  'calendar-view-change': 'viewChange',
  'calendar-navigate': 'navigate',
  'calendar-events-set': 'eventsSet',
  'calendar-range-change': 'rangeChange',
  'calendar-range-select': 'rangeSelect',
} as const;

type DomEventName = keyof typeof EVENT_MAP;
type EmitName = (typeof EVENT_MAP)[DomEventName];

const EVENT_PAIRS = Object.entries(EVENT_MAP) as Array<[DomEventName, EmitName]>;

/** Object-form emits: every listener receives the DOM event's `detail`. */
const emits = {
  eventAdded: (_detail: EventDetail) => true,
  eventUpdated: (_detail: EventDetail) => true,
  eventDeleted: (_detail: EventDeletedDetail) => true,
  dateSelect: (_detail: DateSelectDetail) => true,
  viewChange: (_detail: ViewChangeDetail) => true,
  navigate: (_detail: NavigateDetail) => true,
  eventsSet: (_detail: EventsSetDetail) => true,
  rangeChange: (_detail: RangeChangeDetail) => true,
  rangeSelect: (_detail: RangeSelectDetail) => true,
};

function toDateAttribute(date: Date | string | undefined): string | undefined {
  return date instanceof Date ? date.toISOString() : date;
}

export const ForceCalendar = defineComponent({
  name: 'ForceCalendar',
  props: {
    view: { type: String as PropType<CalendarView>, default: undefined },
    date: { type: [Date, String] as PropType<Date | string>, default: undefined },
    locale: { type: String, default: undefined },
    timezone: { type: String, default: undefined },
    weekStartsOn: { type: Number as PropType<0 | 1 | 2 | 3 | 4 | 5 | 6>, default: undefined },
    height: { type: String, default: undefined },
  },
  emits,
  setup(props, { emit }) {
    const el = ref<ForceCalendarElement | null>(null);
    const listeners: Array<[DomEventName, EventListener]> = [];

    // Vue types `emit` as an intersection of one signature per event, which a
    // union of names cannot satisfy; the map above is the single source of truth.
    const forward = emit as unknown as (name: EmitName, detail: unknown) => void;

    onMounted(() => {
      // Register the custom elements client-side only — safe under SSR
      import('@forcecalendar/interface');
      const node = el.value;
      if (!node) return;
      for (const [domName, emitName] of EVENT_PAIRS) {
        const listener: EventListener = event => {
          forward(emitName, (event as CustomEvent).detail ?? {});
        };
        node.addEventListener(domName, listener);
        listeners.push([domName, listener]);
      }
    });

    onBeforeUnmount(() => {
      const node = el.value;
      if (!node) return;
      for (const [domName, listener] of listeners) {
        node.removeEventListener(domName, listener);
      }
      listeners.length = 0;
    });

    return () =>
      h(TAG, {
        ref: el,
        view: props.view,
        date: toDateAttribute(props.date),
        locale: props.locale,
        timezone: props.timezone,
        'week-starts-on': props.weekStartsOn,
        height: props.height,
      });
  },
});

export default ForceCalendar;

declare module 'vue' {
  export interface GlobalComponents {
    ForceCalendar: typeof ForceCalendar;
  }
}
