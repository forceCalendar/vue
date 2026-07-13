# @forcecalendar/vue

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Thin Vue 3 adapter for [forceCalendar](https://forcecalendar.org) — enterprise calendar Web Components that run under Salesforce Locker Service and strict CSP.

Maps props to the `<forcecal-main>` element's attributes and its DOM events to Vue emits. SSR-safe (custom elements register client-side only), so it works with Nuxt out of the box.

## Install

```bash
npm install @forcecalendar/vue @forcecalendar/core @forcecalendar/interface
```

## Use

```vue
<script setup>
import { ForceCalendar } from '@forcecalendar/vue';
</script>

<template>
  <ForceCalendar
    view="month"
    timezone="America/New_York"
    height="600px"
    @date-select="d => console.log('selected', d)"
    @event-added="e => console.log('added', e)"
  />
</template>
```

Props: `view`, `date`, `locale`, `timezone`, `weekStartsOn`, `height`. Emits: `event-added`, `event-updated`, `event-deleted`, `date-select`, `view-change`, `navigate`.

Docs: [docs.forcecalendar.org](https://docs.forcecalendar.org) · License: [MIT](LICENSE)
