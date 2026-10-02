import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body><div id="host"></div></body></html>', {
  url: 'http://localhost/', pretendToBeVisual: true,
});
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'SVGElement',
  'Element', 'Node', 'Text', 'Comment', 'DocumentFragment', 'Event', 'CustomEvent',
  'customElements', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame',
  'cancelAnimationFrame']) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true, writable: true });
}
const warm = process.argv[2] === 'warm';
const initial = process.argv[3] === 'omitted' ? undefined : process.argv[3] === 'true';
if (warm) await import('@forcecalendar/interface');
const { ForceCalendar } = await import('../../dist/index.js');
assert.equal(Boolean(customElements.get('forcecal-main')), warm);
const host = document.getElementById('host');
function check(el, expected) {
  assert.equal(el.hasAttribute('readonly'), Boolean(expected));
  if (expected) assert.equal(el.getAttribute('readonly'), '');
  // Legacy interfaces predate readOnly but must retain the boolean attribute contract.
  if ('readOnly' in el) assert.equal(el.readOnly, Boolean(expected));
  assert.equal(Object.hasOwn(el, 'readOnly'), false, 'no property shadowing before upgrade');
}
const { createApp, h, reactive, ref, nextTick } = await import('vue');
const handle = ref(null);
const props = reactive({ readOnly: initial });
const app = createApp({ render: () => h(ForceCalendar, { ref: handle, ...props }) });
app.mount(host);
const el = host.querySelector('forcecal-main');
try {
  check(el, initial); // Explicitly before lazy import/upgrade resolves.
  await handle.value.whenReady();
  check(el, initial);
  for (const value of [true, false, undefined, true, false]) {
    props.readOnly = value;
    await nextTick();
    check(el, value);
  }
} finally {
  app.unmount();
  el.stateManager?.calendar?.destroy();
  el.destroy?.();
  dom.window.close();
}
