# Banner stacking

Use this pattern when user-triggered notices can overlap. The newest notice stays dominant, older notices remain available through a keyboard-controlled spread view, and every removal is cancellable.

Use JavaScript for queue order, measured spread positions, cancellable removal, resize updates, and live announcements.

Import [`motion.css`](assets/transitions/motion.css) after Tailwind CSS 4.3+.

[Complete code example](examples/transitions/layout/banner-stacking.md).

## Check

| Stage | Expected result |
| --- | --- |
| Initial | One readable banner is exposed; older depth positions are empty and the live region is quiet. |
| Add and overflow | New banners rise to depth zero, older banners recede, and a fourth addition removes the oldest after its cancellable exit. |
| Expand | Pointer entry, focus within the list, or “Show all” spreads the queue; the button provides the persistent keyboard path. |
| Dismiss and replay | Every visible dismiss button removes its own banner, reflows remaining depths, and later additions still animate from the entry state. |
| Reduced motion | Enabling reduced motion during entry or exit settles positions and completes pending removals immediately. |
| Resize | Changing width recomputes measured spread positions without stale geometry. |
| Cleanup | Calling the returned function aborts listeners, removes the media-query handler, cancels scheduled layout, disconnects resize observation, and settles pending removals. |
