// Module resolution hook (node:module `register`) that swaps the real
// @forcecalendar/interface for the recording stub element, so the DOM tests
// exercise the adapter's loading path without rendering the real calendar.
export async function resolve(specifier, context, nextResolve) {
  if (specifier === '@forcecalendar/interface') {
    return {
      url: new URL('./stub-interface.mjs', import.meta.url).href,
      format: 'module',
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
