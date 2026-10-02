// Server-side rendering: no DOM, no custom element registry. The component
// must render its attributes and never serialise props that only make sense
// as DOM properties.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { ForceCalendar } from '../dist/index.js';

async function render(props) {
  const app = createSSRApp({ render: () => h(ForceCalendar, props) });
  return renderToString(app);
}

test('renders the element with its attributes under SSR', async () => {
  const html = await render({ view: 'week', height: '500px' });
  assert.match(html, /<forcecal-main/);
  assert.match(html, /view="week"/);
  assert.match(html, /height="500px"/);
});

test('renders theme and fallthrough attributes', async () => {
  const html = await render({
    id: 'cal',
    class: 'shell',
    view: 'month',
    theme: 'slds',
    weekStartsOn: 1,
    date: new Date('2026-08-30T00:00:00.000Z'),
  });
  assert.match(html, /theme="slds"/);
  assert.match(html, /id="cal"/);
  assert.match(html, /class="shell"/);
  assert.match(html, /week-starts-on="1"/);
  assert.match(html, /date="2026-08-30T00:00:00\.000Z"/);
});

test('never serialises the events snapshot or listener props', async () => {
  const html = await render({
    view: 'month',
    events: [{ id: '1', title: 'Standup', start: '2026-08-31T09:00:00Z' }],
    removeMissingEvents: false,
    onRangeChange: () => undefined,
    onEventsSet: () => undefined,
  });
  assert.doesNotMatch(html, /\[object Object\]/);
  assert.doesNotMatch(html, /\sevents=/);
  assert.doesNotMatch(html, /remove-missing-events/i);
  assert.doesNotMatch(html, /range-change|events-set/i);
});

for (const readOnly of [true, false, undefined]) {
  test(`SSR readOnly=${readOnly} uses boolean attribute presence`, async () => {
    const html = await render({ readOnly });
    if (readOnly) assert.match(html, /\sreadonly(?:="")?(?:\s|>)/i);
    else assert.doesNotMatch(html, /\sreadonly(?:=|\s|>)/i);
  });
}
