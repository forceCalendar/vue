// Client-side behaviour under jsdom. The DOM globals must exist before the
// Vue runtime is imported (it captures `document` at load time), and
// @forcecalendar/interface is replaced by the recording stub element via a
// module resolution hook so the adapter's own loading path is exercised.
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
const { window } = dom;
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'SVGElement',
  'Element',
  'Node',
  'Text',
  'Comment',
  'DocumentFragment',
  'Event',
  'CustomEvent',
  'customElements',
  'MutationObserver',
  'getComputedStyle',
]) {
  Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
}

register('./helpers/interface-hooks.mjs', import.meta.url);

const { createApp, h, nextTick, reactive, ref, KeepAlive } = await import('vue');
const { ForceCalendar } = await import('../dist/index.js');

const DOM_EVENTS = {
  'calendar-event-added': 'onEventAdded',
  'calendar-event-updated': 'onEventUpdated',
  'calendar-event-deleted': 'onEventDeleted',
  'calendar-date-select': 'onDateSelect',
  'calendar-view-change': 'onViewChange',
  'calendar-navigate': 'onNavigate',
  'calendar-events-set': 'onEventsSet',
  'calendar-range-change': 'onRangeChange',
  'calendar-range-select': 'onRangeSelect',
};

const snapshot = () => [
  { id: '1', title: 'Standup', start: '2026-08-31T09:00:00Z' },
  { id: '2', title: 'Review', start: '2026-09-01T14:00:00Z' },
];

/** Mounts <ForceCalendar> with reactive props; returns the element and the template ref. */
function mount(initialProps = {}, { keepAlive = false } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const props = reactive(initialProps);
  const handle = ref(null);
  const show = ref(true);
  const app = createApp({
    setup() {
      return () => {
        const calendar = show.value ? h(ForceCalendar, { key: 'cal', ref: handle, ...props }) : h('p');
        return keepAlive ? h(KeepAlive, null, [calendar]) : calendar;
      };
    },
  });
  app.mount(host);
  return {
    app,
    host,
    props,
    handle,
    show,
    el: host.querySelector('forcecal-main'),
    unmount() {
      app.unmount();
      host.remove();
    },
  };
}

/** Collects emitted payloads per listener prop. */
function collectors(names = Object.values(DOM_EVENTS)) {
  const received = {};
  const listeners = {};
  for (const name of names) {
    received[name] = [];
    listeners[name] = detail => received[name].push(detail);
  }
  return { received, listeners };
}

// Readiness resolves in a microtask and may schedule a fallback timer after
// the first task was queued by a test. Drain both turns before counting emits.
const settle = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

// This test must run first: it relies on `forcecal-main` not being defined yet.
test('applies the events snapshot as a property before upgrade and never as an attribute', async () => {
  assert.equal(customElements.get('forcecal-main'), undefined);
  const { received, listeners } = collectors(['onRangeChange']);
  const { el, handle, unmount } = mount({ view: 'week', events: snapshot(), ...listeners });

  // Not upgraded yet: the adapter fell back to a plain property.
  assert.equal(typeof el.setEvents, 'undefined');
  assert.equal(el.hasAttribute('events'), false);
  assert.ok(Object.prototype.hasOwnProperty.call(el, 'events'));
  assert.deepEqual(el.events, snapshot());
  assert.equal(received.onRangeChange.length, 0);

  // Once the (stub) interface loads, the upgrade re-applies the snapshot.
  const ready = await handle.value.whenReady();
  assert.equal(ready, el);
  assert.equal(typeof el.setEvents, 'function');
  assert.equal(el.hasAttribute('events'), false);
  assert.deepEqual(el.callsTo('setEvents').map(c => c.args[0]), [snapshot()]);
  assert.deepEqual(el.getEvents(), snapshot());

  // The range announced during the upgrade reached the listener attached
  // before the import, and is not reported a second time.
  await settle();
  assert.equal(received.onRangeChange.length, 1);
  assert.equal(received.onRangeChange[0].view, 'week');
  assert.equal(el.callsTo('getVisibleRange').length, 0);
  unmount();
});

test('renders theme and attributes and keeps them reactive', async () => {
  const { el, props, unmount } = mount({
    view: 'day',
    theme: 'slds',
    weekStartsOn: 1,
    height: '400px',
    date: new Date('2026-08-30T00:00:00.000Z'),
    events: snapshot(),
  });
  assert.equal(el.getAttribute('theme'), 'slds');
  assert.equal(el.getAttribute('view'), 'day');
  assert.equal(el.getAttribute('week-starts-on'), '1');
  assert.equal(el.getAttribute('height'), '400px');
  assert.equal(el.getAttribute('date'), '2026-08-30T00:00:00.000Z');
  assert.equal(el.hasAttribute('events'), false);
  assert.equal(el.hasAttribute('remove-missing-events'), false);
  assert.equal(el.outerHTML.includes('[object Object]'), false);

  props.theme = 'custom';
  props.view = 'month';
  await nextTick();
  assert.equal(el.getAttribute('theme'), 'custom');
  assert.equal(el.getAttribute('view'), 'month');
  unmount();
});

test('forwards all nine calendar events as emits carrying event.detail', async () => {
  const { received, listeners } = collectors();
  const { el, unmount } = mount({ view: 'month', ...listeners });
  await settle();
  const initialRangeChanges = received.onRangeChange.length;

  for (const [domName, emitProp] of Object.entries(DOM_EVENTS)) {
    const detail = { marker: domName };
    el.dispatch(domName, detail);
    const payloads = received[emitProp];
    assert.equal(payloads[payloads.length - 1], detail, `${domName} -> ${emitProp}`);
  }
  assert.equal(received.onRangeChange.length, initialRangeChanges + 1);
  for (const emitProp of Object.values(DOM_EVENTS)) {
    if (emitProp !== 'onRangeChange') assert.equal(received[emitProp].length, 1, emitProp);
  }

  // Legacy aliases are deliberately not mapped, so handlers fire once per operation.
  el.dispatch('calendar-event-add', { event: {} });
  el.dispatch('calendar-event-remove', { eventId: '1' });
  assert.equal(received.onEventAdded.length, 1);
  assert.equal(received.onEventDeleted.length, 1);
  unmount();
});

test('removes every listener on unmount', async () => {
  const { el, unmount } = mount({ view: 'month' });
  const added = el.listenerLog.filter(([kind]) => kind === 'add').map(([, type]) => type);
  assert.deepEqual(added.sort(), Object.keys(DOM_EVENTS).sort());

  unmount();
  const removed = el.listenerLog.filter(([kind]) => kind === 'remove').map(([, type]) => type);
  assert.equal(removed.length, 9);
  assert.deepEqual(removed.sort(), Object.keys(DOM_EVENTS).sort());
});

test('events prop goes through setEvents with removeMissing', async () => {
  const first = snapshot();
  const { el, props, unmount } = mount({ view: 'month', events: first });
  assert.equal(el.hasAttribute('events'), false);
  assert.deepEqual(el.callsTo('setEvents').map(c => c.args), [[first, { removeMissing: true }]]);

  const second = [...first, { id: '3', title: 'Retro', start: '2026-09-02T16:00:00Z' }];
  props.events = second;
  await nextTick();
  assert.deepEqual(el.callsTo('setEvents').at(-1).args, [second, { removeMissing: true }]);

  props.removeMissingEvents = false;
  await nextTick();
  assert.equal(el.callsTo('setEvents').length, 2, 'toggling removeMissingEvents alone does not re-apply');

  const third = second.slice(1);
  props.events = third;
  await nextTick();
  assert.deepEqual(el.callsTo('setEvents').at(-1).args, [third, { removeMissing: false }]);

  props.events = undefined;
  await nextTick();
  assert.equal(el.callsTo('setEvents').length, 3, 'clearing the prop leaves the calendar alone');
  unmount();
});

test('does not touch events when the prop is omitted', async () => {
  const { el, unmount } = mount({ view: 'month' });
  await settle();
  assert.equal(el.callsTo('setEvents').length, 0);
  unmount();
});

test('reports the initial visible range when the element was defined before mount', async () => {
  const { received, listeners } = collectors(['onRangeChange']);
  const { el, handle, unmount } = mount({
    view: 'week',
    date: '2026-08-30T00:00:00.000Z',
    ...listeners,
  });
  // The element announced its range while connecting, before onMounted ran.
  assert.equal(received.onRangeChange.length, 0);

  await handle.value.whenReady();
  await settle();
  assert.equal(received.onRangeChange.length, 1);
  const detail = received.onRangeChange[0];
  assert.ok(detail.start instanceof Date && detail.end instanceof Date);
  assert.equal(detail.start.toISOString(), '2026-08-01T00:00:00.000Z');
  assert.equal(detail.view, 'week');
  assert.equal(detail.date.toISOString(), '2026-08-30T00:00:00.000Z');
  assert.equal(el.callsTo('getVisibleRange').length, 1);
  unmount();
});

test('waits for a deferred initial DOM range event instead of duplicating it', async () => {
  globalThis.__forcecalStub.initialRangeTiming = 'deferred';
  const { received, listeners } = collectors(['onRangeChange']);
  const { el, handle, unmount } = mount({ view: 'week', ...listeners });
  try {
    await handle.value.whenReady();
    assert.equal(received.onRangeChange.length, 0, 'no synthetic emit before the DOM event');
    await settle();
    assert.equal(received.onRangeChange.length, 1);
    assert.equal(el.callsTo('getVisibleRange').length, 0, 'the real announcement wins');

    // Identical later events are real events, not duplicate readiness notices.
    const detail = received.onRangeChange[0];
    el.dispatch('calendar-range-change', detail);
    el.dispatch('calendar-range-change', detail);
    assert.deepEqual(received.onRangeChange, [detail, detail, detail]);
  } finally {
    unmount();
    globalThis.__forcecalStub.initialRangeTiming = 'sync';
  }
});

test('a real range event cancels a pending legacy readiness fallback', async () => {
  const { received, listeners } = collectors(['onRangeChange']);
  const { el, handle, unmount } = mount({ view: 'month', ...listeners });
  try {
    await handle.value.whenReady();
    const detail = { start: new Date('2026-09-01'), end: new Date('2026-09-30'), view: 'month', date: new Date('2026-09-01') };
    el.dispatch('calendar-range-change', detail);
    await settle();
    assert.deepEqual(received.onRangeChange, [detail]);
    assert.equal(el.callsTo('getVisibleRange').length, 0);
  } finally {
    unmount();
  }
});

test('reports a fallback range when the element emits no initial announcement', async () => {
  globalThis.__forcecalStub.initialRangeTiming = 'none';
  const { received, listeners } = collectors(['onRangeChange']);
  const { el, unmount } = mount({ view: 'day', ...listeners });
  try {
    await settle();
    assert.equal(received.onRangeChange.length, 1);
    assert.equal(received.onRangeChange[0].view, 'day');
    assert.equal(el.callsTo('getVisibleRange').length, 1);
  } finally {
    unmount();
    globalThis.__forcecalStub.initialRangeTiming = 'sync';
  }
});

test('cancels the legacy readiness fallback on unmount, including repeated mounts', async () => {
  const { received, listeners } = collectors(['onRangeChange']);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { el, handle, unmount } = mount({ view: 'month', ...listeners });
    await handle.value.whenReady();
    unmount();
    await settle();
    assert.equal(received.onRangeChange.length, 0);
    assert.equal(el.callsTo('getVisibleRange').length, 0);
  }
  const mounted = mount({ view: 'month', ...listeners });
  try {
    await settle();
    assert.equal(received.onRangeChange.length, 1, 'a later mount still receives its fallback');
    assert.equal(mounted.el.callsTo('getVisibleRange').length, 1);
  } finally {
    mounted.unmount();
  }
});

test('does not schedule a fallback when unmounted before readiness resolves', async () => {
  const { received, listeners } = collectors(['onRangeChange']);
  const { el, unmount } = mount({ view: 'month', ...listeners });
  unmount();
  await settle();
  assert.equal(received.onRangeChange.length, 0);
  assert.equal(el.callsTo('getVisibleRange').length, 0);
});

test('KeepAlive cancels an interrupted initial fallback and resumes it on activation', async () => {
  for (const timing of ['sync', 'deferred', 'none']) {
    globalThis.__forcecalStub.initialRangeTiming = timing;
    const { received, listeners } = collectors(['onRangeChange']);
    const mounted = mount({ view: 'month', ...listeners }, { keepAlive: true });
    try {
      await mounted.handle.value.whenReady();
      mounted.show.value = false;
      await nextTick();
      await settle();
      assert.equal(received.onRangeChange.length, 0, `${timing}: no emit while deactivated`);
      assert.equal(mounted.el.callsTo('getVisibleRange').length, 0);

      mounted.show.value = true;
      await nextTick();
      await settle();
      assert.equal(mounted.handle.value.element, mounted.el);
      assert.equal(received.onRangeChange.length, 1, `${timing}: initial range after reactivation`);
      assert.equal(mounted.el.callsTo('getVisibleRange').length, timing === 'none' ? 1 : 0);
    } finally {
      mounted.unmount();
      globalThis.__forcecalStub.initialRangeTiming = 'sync';
    }
  }
});

test('exposed handle proxies methods to the element', async () => {
  const { el, handle, unmount } = mount({ view: 'month' });
  const cal = handle.value;
  assert.equal(cal.element, el);
  assert.equal(cal.$el, el);
  assert.equal(await cal.whenReady(), el);

  cal.next();
  cal.previous();
  cal.today();
  cal.setView('day');
  cal.setDate('2026-09-01');
  assert.deepEqual(cal.addEvent({ id: 'x', start: '2026-09-01' }), { id: 'x', start: '2026-09-01' });
  assert.deepEqual(cal.updateEvent('x', { title: 'X' }), { id: 'x', title: 'X' });
  assert.equal(cal.deleteEvent('x'), true);
  assert.equal(cal.getVisibleRange().start.toISOString(), '2026-08-01T00:00:00.000Z');
  const result = cal.setEvents(snapshot(), { removeMissing: false });
  assert.equal(result.added.length, 2);
  assert.deepEqual(cal.getEvents(), snapshot());

  const names = el.calls.map(c => c.name);
  for (const name of ['next', 'previous', 'today', 'setView', 'setDate', 'addEvent', 'updateEvent', 'deleteEvent', 'getVisibleRange', 'setEvents', 'getEvents']) {
    assert.ok(names.includes(name), name);
  }
  assert.deepEqual(el.callsTo('setView')[0].args, ['day']);
  assert.deepEqual(el.callsTo('setEvents')[0].args, [snapshot(), { removeMissing: false }]);
  unmount();
});

test('exposed methods warn instead of throwing when the element lacks them', async () => {
  const { el, handle, unmount } = mount({ view: 'month' });
  const warnings = [];
  const original = console.warn;
  console.warn = message => warnings.push(String(message));
  try {
    Object.defineProperty(el, 'setView', { value: undefined, configurable: true });
    assert.equal(handle.value.setView('day'), undefined);
  } finally {
    console.warn = original;
    delete el.setView;
  }
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /setView\(\)/);
  assert.match(warnings[0], /1\.6\.0/);
  unmount();
});

test('listeners and state survive a KeepAlive round-trip', async () => {
  const { received, listeners } = collectors(['onDateSelect', 'onRangeChange']);
  const { el, host, show, unmount } = mount(
    { view: 'month', events: snapshot(), ...listeners },
    { keepAlive: true },
  );
  await settle();
  assert.equal(el.connectCount, 1);
  const rangeChangesBefore = received.onRangeChange.length;

  show.value = false;
  await nextTick();
  assert.equal(el.isConnected, false);
  assert.equal(host.querySelector('forcecal-main'), null);
  assert.equal(el.listenerLog.filter(([kind]) => kind === 'remove').length, 0);

  show.value = true;
  await nextTick();
  assert.equal(host.querySelector('forcecal-main'), el, 'same element instance is re-attached');
  assert.equal(el.connectCount, 2);
  assert.equal(received.onRangeChange.length, rangeChangesBefore + 1, 'listener still attached');
  assert.deepEqual(el.events, snapshot());
  assert.equal(el.callsTo('setEvents').length, 1, 'snapshot not re-applied');

  const detail = { date: new Date('2026-09-03') };
  el.dispatch('calendar-date-select', detail);
  assert.equal(received.onDateSelect.at(-1), detail);

  unmount();
  assert.equal(el.listenerLog.filter(([kind]) => kind === 'remove').length, 9);
});
