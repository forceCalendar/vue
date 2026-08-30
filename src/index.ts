/**
 * @forcecalendar/vue — thin Vue 3 adapter for the forceCalendar
 * Web Component.
 *
 * Props map to the `<forcecal-main>` element's attributes, the element's
 * `calendar-*` DOM events map to typed emits that deliver `event.detail`,
 * the `events` prop is applied through the element's `setEvents()` API and
 * the element's methods are exposed on the component instance. No
 * dependencies beyond the peer Vue and forceCalendar packages.
 */
import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type PropType,
} from 'vue';
import type {
  CalendarEvent,
  CalendarTheme,
  CalendarView,
  EventsSetOptions,
  EventsSetResult,
  ForceCalendarElement,
  ForceCalendarEventMap,
  VisibleRange,
} from './dom-types';

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

/** Oldest @forcecalendar/interface release whose element API this adapter relies on. */
const MIN_INTERFACE_VERSION = '1.6.0';

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Exposed handle
// ---------------------------------------------------------------------------

/**
 * What a template ref to `<ForceCalendar>` resolves to. Every method proxies
 * to the underlying element; until the element is upgraded (or when the
 * installed @forcecalendar/interface predates the method) the call warns and
 * returns `undefined`. Await `whenReady()` to be sure.
 */
export interface ForceCalendarHandle {
  /** The underlying `<forcecal-main>` element, `null` before mount. */
  readonly element: ForceCalendarElement | null;
  /** Resolves once the component is mounted and `forcecal-main` is defined. */
  whenReady(): Promise<ForceCalendarElement>;
  addEvent(event: Partial<CalendarEvent>): CalendarEvent | null | undefined;
  updateEvent(id: string, updates: Partial<CalendarEvent>): CalendarEvent | null | undefined;
  deleteEvent(id: string): boolean | undefined;
  getEvents(): CalendarEvent[] | undefined;
  setEvents(
    events: Iterable<CalendarEvent>,
    options?: EventsSetOptions,
  ): EventsSetResult | null | undefined;
  getVisibleRange(): VisibleRange | null | undefined;
  setView(view: CalendarView): void;
  setDate(date: Date | string): void;
  next(): void;
  previous(): void;
  today(): void;
}

type ElementMethod = Exclude<keyof ForceCalendarHandle, 'element' | 'whenReady'>;

const ELEMENT_METHODS: ElementMethod[] = [
  'addEvent',
  'updateEvent',
  'deleteEvent',
  'getEvents',
  'setEvents',
  'getVisibleRange',
  'setView',
  'setDate',
  'next',
  'previous',
  'today',
];

function warn(message: string): void {
  console.warn(`[@forcecalendar/vue] ${message}`);
}

/** Registers the custom elements; client-side only, so SSR never touches it. */
function loadInterface(): Promise<void> {
  return import('@forcecalendar/interface').then(
    () => undefined,
    (error: unknown) => {
      console.error(
        `[@forcecalendar/vue] failed to load @forcecalendar/interface (>= ${MIN_INTERFACE_VERSION} required)`,
        error,
      );
    },
  );
}

function toDateAttribute(date: Date | string | undefined): string | undefined {
  return date instanceof Date ? date.toISOString() : date;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ForceCalendar = defineComponent({
  name: 'ForceCalendar',
  props: {
    view: { type: String as PropType<CalendarView>, default: undefined },
    date: { type: [Date, String] as PropType<Date | string>, default: undefined },
    locale: { type: String, default: undefined },
    timezone: { type: String, default: undefined },
    weekStartsOn: { type: Number as PropType<0 | 1 | 2 | 3 | 4 | 5 | 6>, default: undefined },
    height: { type: String, default: undefined },
    theme: { type: String as PropType<CalendarTheme>, default: undefined },
    /**
     * Complete snapshot of the calendar's events. Applied through
     * `setEvents()` (never as an attribute) whenever the array identity
     * changes; leave it `undefined` to manage events imperatively instead.
     */
    events: { type: Array as PropType<CalendarEvent[]>, default: undefined },
    /** Whether events absent from the `events` snapshot are removed. */
    removeMissingEvents: { type: Boolean, default: true },
  },
  emits,
  setup(props, { emit, expose }) {
    const el = ref<ForceCalendarElement | null>(null);
    const listeners: Array<[DomEventName, EventListener]> = [];
    let rangeChangeSeen = false;
    let unmounted = false;

    // Vue types `emit` as an intersection of one signature per event, which a
    // union of names cannot satisfy; the map above is the single source of truth.
    const forward = emit as unknown as (name: EmitName, detail: unknown) => void;

    let resolveMounted!: () => void;
    const mounted = new Promise<void>(resolve => {
      resolveMounted = resolve;
    });

    const whenReady = (): Promise<ForceCalendarElement> => {
      if (typeof customElements === 'undefined') {
        return Promise.reject(new Error(`[@forcecalendar/vue] ${TAG} needs a DOM`));
      }
      return Promise.all([customElements.whenDefined(TAG), mounted]).then(() => {
        const node = el.value;
        if (!node) throw new Error(`[@forcecalendar/vue] <${TAG}> is no longer mounted`);
        return node;
      });
    };

    /**
     * Applies an `events` snapshot. Before the element is upgraded the method
     * does not exist yet, so the snapshot is stored as a plain property;
     * @forcecalendar/interface >= 1.6.0 picks it up when it initialises.
     */
    const applyEvents = (events: CalendarEvent[] | undefined | null): void => {
      const node = el.value;
      if (!node || events == null) return;
      if (typeof node.setEvents === 'function') {
        node.setEvents(events, { removeMissing: props.removeMissingEvents });
      } else {
        node.events = events;
      }
    };

    /**
     * The element announces its initial visible window synchronously while it
     * connects. When it was already defined at mount time that happens before
     * our listeners exist, so report the window once the element is ready.
     * `view`/`date` mirror the defaults the element derives from its attributes.
     */
    const reportInitialRange = (node: ForceCalendarElement): void => {
      if (unmounted || rangeChangeSeen || typeof node.getVisibleRange !== 'function') return;
      const range = node.getVisibleRange();
      if (!range) return;
      rangeChangeSeen = true;
      const dateAttr = node.getAttribute('date');
      const detail: RangeChangeDetail = {
        ...range,
        view: (node.getAttribute('view') as CalendarView | null) || 'month',
        date: dateAttr ? new Date(dateAttr) : new Date(),
      };
      forward('rangeChange', detail);
    };

    onMounted(() => {
      const node = el.value;
      if (!node) return;

      // Listeners first, so nothing dispatched while the element upgrades is lost.
      for (const [domName, emitName] of EVENT_PAIRS) {
        const listener: EventListener = event => {
          if (domName === 'calendar-range-change') rangeChangeSeen = true;
          forward(emitName, (event as CustomEvent).detail ?? {});
        };
        node.addEventListener(domName, listener);
        listeners.push([domName, listener]);
      }

      resolveMounted();
      loadInterface();
      applyEvents(props.events);
      whenReady().then(reportInitialRange, () => undefined);
    });

    watch(() => props.events, applyEvents);

    onBeforeUnmount(() => {
      unmounted = true;
      const node = el.value;
      if (!node) return;
      for (const [domName, listener] of listeners) {
        node.removeEventListener(domName, listener);
      }
      listeners.length = 0;
    });

    const handle = {
      get element() {
        return el.value;
      },
      whenReady,
    } as ForceCalendarHandle;

    for (const name of ELEMENT_METHODS) {
      (handle as unknown as Record<ElementMethod, (...args: unknown[]) => unknown>)[name] = (
        ...args: unknown[]
      ) => {
        const node = el.value;
        const method = node ? (node[name] as unknown) : undefined;
        if (typeof method !== 'function') {
          warn(
            `${name}() is not available: <${TAG}> is not upgraded yet (await whenReady()) ` +
              `or @forcecalendar/interface is older than ${MIN_INTERFACE_VERSION}.`,
          );
          return undefined;
        }
        return method.apply(node, args);
      };
    }

    expose(handle);

    return () =>
      h(TAG, {
        ref: el,
        view: props.view,
        date: toDateAttribute(props.date),
        locale: props.locale,
        timezone: props.timezone,
        'week-starts-on': props.weekStartsOn,
        height: props.height,
        theme: props.theme,
      });
  },
});

export default ForceCalendar;

declare module 'vue' {
  export interface GlobalComponents {
    ForceCalendar: typeof ForceCalendar;
  }
}
