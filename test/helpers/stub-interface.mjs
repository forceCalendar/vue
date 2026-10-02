// Stand-in for @forcecalendar/interface used by the DOM tests: registers a
// <forcecal-main> that records every call and listener change, and mimics the
// two behaviours of the real element the adapter depends on — re-applying an
// `events` snapshot assigned before upgrade, and announcing the initial
// visible range synchronously (interface 1.6) or deferred (interface 1.7).
//
// The module is a no-op without DOM globals so the test runner can load it
// on its own without failing.
if (typeof HTMLElement !== 'undefined' && !customElements.get('forcecal-main')) {
  const VISIBLE_RANGE = {
    start: new Date('2026-08-01T00:00:00.000Z'),
    end: new Date('2026-09-05T23:59:59.999Z'),
  };

  class StubForceCalendar extends HTMLElement {
    static instances = [];
    static initialRangeTiming = 'sync';

    constructor() {
      super();
      this.calls = [];
      this.listenerLog = [];
      this.connectCount = 0;
      this._events = [];
      StubForceCalendar.instances.push(this);
    }

    connectedCallback() {
      this.connectCount += 1;
      // Same recovery the real element performs in initialize().
      if (Object.prototype.hasOwnProperty.call(this, 'events')) {
        const value = this.events;
        delete this.events;
        this.events = value;
      }
      const dateAttr = this.getAttribute('date');
      const detail = {
        ...VISIBLE_RANGE,
        view: this.getAttribute('view') || 'month',
        date: dateAttr ? new Date(dateAttr) : new Date(),
      };
      if (StubForceCalendar.initialRangeTiming === 'none') return;
      if (StubForceCalendar.initialRangeTiming === 'deferred') {
        this.initialRangeTimer = setTimeout(() => {
          this.initialRangeTimer = undefined;
          this.dispatch('calendar-range-change', detail);
        }, 0);
      } else {
        this.dispatch('calendar-range-change', detail);
      }
    }

    disconnectedCallback() {
      clearTimeout(this.initialRangeTimer);
      this.initialRangeTimer = undefined;
    }

    dispatch(name, detail) {
      this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
    }

    addEventListener(type, listener, options) {
      this.listenerLog.push(['add', type]);
      super.addEventListener(type, listener, options);
    }

    removeEventListener(type, listener, options) {
      this.listenerLog.push(['remove', type]);
      super.removeEventListener(type, listener, options);
    }

    callsTo(name) {
      return this.calls.filter(call => call.name === name);
    }

    record(name, args) {
      this.calls.push({ name, args });
    }

    setEvents(events, options = {}) {
      const snapshot = Array.from(events);
      this.record('setEvents', [snapshot, options]);
      this._events = snapshot;
      return { events: snapshot, added: snapshot, updated: [], removed: [], unchanged: [] };
    }

    get events() {
      return this._events;
    }

    set events(events) {
      this.setEvents(events ?? []);
    }

    getVisibleRange() {
      this.record('getVisibleRange', []);
      return { ...VISIBLE_RANGE };
    }

    getEvents() {
      this.record('getEvents', []);
      return this._events;
    }

    addEvent(event) {
      this.record('addEvent', [event]);
      return { ...event };
    }

    updateEvent(id, updates) {
      this.record('updateEvent', [id, updates]);
      return { id, ...updates };
    }

    deleteEvent(id) {
      this.record('deleteEvent', [id]);
      return true;
    }

    setView(view) {
      this.record('setView', [view]);
    }

    setDate(date) {
      this.record('setDate', [date]);
    }

    next() {
      this.record('next', []);
    }

    previous() {
      this.record('previous', []);
    }

    today() {
      this.record('today', []);
    }
  }

  customElements.define('forcecal-main', StubForceCalendar);
  globalThis.__forcecalStub = StubForceCalendar;
}

export {};
