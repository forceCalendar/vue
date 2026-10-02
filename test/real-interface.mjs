// Integration coverage uses the installed, built interface package rather
// than the recording stub. Node's test runner isolates this registry from
// dom.mjs, so the first mount exercises the adapter's lazy import and upgrade.
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
const { window } = dom;
for (const key of [
  'window', 'document', 'navigator', 'HTMLElement', 'SVGElement', 'Element',
  'Node', 'Text', 'Comment', 'DocumentFragment', 'Event', 'CustomEvent',
  'customElements', 'MutationObserver', 'getComputedStyle',
]) {
  Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
}

const { createApp, h, nextTick, reactive, ref, KeepAlive } = await import('vue');
const { ForceCalendar } = await import('../dist/index.js');

const settle = async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  await new Promise(resolve => setTimeout(resolve, 0));
};

function mount({ keepAlive = false } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const handle = ref(null);
  const show = ref(true);
  const received = [];
  const props = reactive({ view: 'month', date: '2026-08-30T12:00:00.000Z' });
  const app = createApp({
    setup() {
      return () => {
        const calendar = show.value
          ? h(ForceCalendar, { ref: handle, ...props, onRangeChange: detail => received.push(detail) })
          : h('p');
        return keepAlive ? h(KeepAlive, null, [calendar]) : calendar;
      };
    },
  });
  app.mount(host);
  const el = host.querySelector('forcecal-main');
  return {
    handle, show, received, props,
    el,
    unmount() {
      app.unmount();
      // Detachment preserves state for KeepAlive. These test elements will
      // never be reattached, so release their core timers explicitly as well
      // (legacy interface releases did not delegate full teardown to core).
      el.stateManager?.calendar?.destroy();
      el.destroy();
      host.remove();
    },
  };
}

test('real interface emits once on lazy upgrade and preserves later navigation', async () => {
  assert.equal(customElements.get('forcecal-main'), undefined);
  const mounted = mount();
  try {
    await mounted.handle.value.whenReady();
    await settle();
    assert.equal(mounted.received.length, 1);
    assert.equal(mounted.received[0].view, 'month');
    assert.ok(mounted.received[0].start instanceof Date);

    mounted.handle.value.next();
    assert.equal(mounted.received.length, 2);
    mounted.handle.value.previous();
    assert.equal(mounted.received.length, 3);
    assert.equal(mounted.received[2].start.getTime(), mounted.received[0].start.getTime());
  } finally {
    mounted.unmount();
  }
});

test('real interface emits once on warm and repeated mounts', async () => {
  assert.ok(customElements.get('forcecal-main'));
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const mounted = mount();
    try {
      await mounted.handle.value.whenReady();
      await settle();
      assert.equal(mounted.received.length, 1);

      mounted.props.view = 'week';
      await nextTick();
      assert.equal(mounted.received.length, 2);
      assert.equal(mounted.received[1].view, 'week');
    } finally {
      mounted.unmount();
    }
  }
});

test('real interface emits nothing after unmount before its initial timer', async () => {
  const mounted = mount();
  await mounted.handle.value.whenReady();
  mounted.unmount();
  await settle();
  assert.equal(mounted.received.length, 0);
});

test('real interface keeps range events working after a KeepAlive round-trip', async () => {
  const mounted = mount({ keepAlive: true });
  try {
    await mounted.handle.value.whenReady();
    await settle();
    assert.equal(mounted.received.length, 1);
    mounted.show.value = false;
    await nextTick();
    assert.equal(mounted.el.isConnected, false);
    mounted.show.value = true;
    await nextTick();
    await settle();
    assert.equal(mounted.handle.value.element, mounted.el);
    assert.equal(mounted.received.length, 2);
    mounted.handle.value.next();
    assert.equal(mounted.received.length, 3);
  } finally {
    mounted.unmount();
  }
});

test('real interface resumes an interrupted initial KeepAlive activation once', async () => {
  const mounted = mount({ keepAlive: true });
  try {
    await mounted.handle.value.whenReady();
    mounted.show.value = false;
    await nextTick();
    await settle();
    assert.equal(mounted.received.length, 0, 'no initial callback while deactivated');

    mounted.show.value = true;
    await nextTick();
    await settle();
    assert.equal(mounted.handle.value.element, mounted.el);
    assert.equal(mounted.received.length, 1);
    mounted.handle.value.next();
    assert.equal(mounted.received.length, 2);
  } finally {
    mounted.unmount();
  }
});
