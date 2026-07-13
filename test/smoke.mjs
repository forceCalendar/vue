import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { ForceCalendar } from '../dist/index.js';

const app = createSSRApp({ render: () => h(ForceCalendar, { view: 'week', height: '500px' }) });
const html = await renderToString(app);
if (!html.includes('forcecal-main') || !html.includes('view="week"')) {
  throw new Error('unexpected SSR output: ' + html);
}
console.log('smoke test passed:', html.slice(0, 80));
