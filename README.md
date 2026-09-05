# portfolio-os
Portfolio Dashboard

## Design

The shared visual system is in `styles.css`: colors and spacing in `:root`,
component styles below, and tablet/mobile rules at the end. System fonts keep
the PWA independent of external font services. Calculations and sync stay in
`index.html`.

When changing the stylesheet, update its version query in `index.html` and the
matching asset URL in `sw.js`, then bump the service-worker cache version. This
keeps the cached HTML and CSS together for offline use.

Run the lightweight maintenance checks before app updates:

```bash
node tests/smoke-test.js
node tests/design-test.js
```

The design check executes the render functions with a minimal DOM test double
and tests offline HTML/CSS caching. Pass a git ref (for example,
`node tests/design-test.js origin/main`) to also verify that business functions
and forecast results have not changed. It does not replace visual browser QA.

The smoke test also validates the JSON fixtures in `tests/fixtures/` for Growth KPI precedence, N/A coverage handling, legacy growth fallback, and backup schema safety.
