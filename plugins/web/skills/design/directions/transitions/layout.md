# Layout transitions

Load this guide when motion changes the size, position, or depth of a page region. Import [`motion.css`](assets/transitions/motion.css) after Tailwind CSS 4.3+, then load only the selected recipe.

## Choose the pattern

| Pattern | Choose it when | Avoid it when | Recipe |
| --- | --- | --- | --- |
| Card resize | One card reveals or conceals its own supporting content. | The entering content is a separate surface or peer page. | [Card resize](examples/transitions/layout/card-resize.md) |
| Panel reveal | A distinct supporting surface enters a bounded region without blocking the page. | The surface requires modal focus containment. | [Panel reveal](examples/transitions/layout/panel-reveal.md) |
| Page side-by-side | Two peer views need directional continuity, such as overview and detail. | The change is only text or one control state. | [Page side-by-side](examples/transitions/layout/page-side-by-side.md) |
| Banner stacking | User-triggered notices can overlap and the newest must remain dominant. | Only one notice can exist at a time. | [Banner stacking](examples/transitions/layout/banner-stacking.md) |

## Setup differences

- Card resize animates a contained grid track; keep controls outside the collapsing track and make closed content inert.
- Panel reveal moves a separate region; preserve the trigger, reading order, and a non-modal path to every action.
- Page side-by-side keeps both views mounted for continuity; expose only the active view to focus and assistive technology.
- Banner stacking needs JavaScript for queue order, measured spread positions, cancellable removal, resize updates, and live announcements.

## Acceptance

- Import the shared motion asset once and keep every transition property explicit.
- Confirm initial, active, reversed, replayed, resized, and cleanup states without stale timers or listeners.
- Switch `prefers-reduced-motion` while motion is active; the interface must settle immediately in the intended final state.
- Keep focus order and reading order stable, make visually unavailable content inert, and provide a keyboard path for every pointer-only enhancement.
- Check surrounding layout at 320px and 1440px widths; resizing may move following content only when expansion itself communicates the state change.
- Profile filters and layout transitions in the delivered context; simplify the effect if it misses the project's performance budget.
