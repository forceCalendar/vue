/**
 * @forcecalendar/vue — thin Vue 3 adapter for the forceCalendar
 * Web Component. Maps props to attributes and DOM events to emits.
 * No dependencies beyond the peer Vue and forceCalendar packages.
 */
import { defineComponent, h, onBeforeUnmount, onMounted, ref } from 'vue';

const EVENT_MAP: Array<[string, string]> = [
  ['calendar-event-added', 'eventAdded'],
  ['calendar-event-updated', 'eventUpdated'],
  ['calendar-event-deleted', 'eventDeleted'],
  ['calendar-date-select', 'dateSelect'],
  ['calendar-view-change', 'viewChange'],
  ['calendar-navigate', 'navigate'],
];

export const ForceCalendar = defineComponent({
  name: 'ForceCalendar',
  props: {
    view: { type: String, default: undefined },
    date: { type: [Date, String], default: undefined },
    locale: { type: String, default: undefined },
    timezone: { type: String, default: undefined },
    weekStartsOn: { type: Number, default: undefined },
    height: { type: String, default: undefined },
  },
  emits: EVENT_MAP.map(([, emitName]) => emitName),
  setup(props, { emit }) {
    const el = ref<HTMLElement | null>(null);
    const listeners: Array<[string, EventListener]> = [];

    onMounted(() => {
      // Register the custom elements client-side only — safe under SSR
      import('@forcecalendar/interface');
      const node = el.value;
      if (!node) return;
      for (const [eventName, emitName] of EVENT_MAP) {
        const listener: EventListener = e =>
          emit(emitName, (e as CustomEvent).detail ?? {});
        node.addEventListener(eventName, listener);
        listeners.push([eventName, listener]);
      }
    });

    onBeforeUnmount(() => {
      const node = el.value;
      if (!node) return;
      for (const [eventName, listener] of listeners) {
        node.removeEventListener(eventName, listener);
      }
    });

    return () =>
      h('forcecal-main', {
        ref: el,
        view: props.view,
        date: props.date instanceof Date ? props.date.toISOString() : props.date,
        locale: props.locale,
        timezone: props.timezone,
        'week-starts-on': props.weekStartsOn,
        height: props.height,
      });
  },
});

export default ForceCalendar;
