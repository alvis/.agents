# Page side-by-side

Use this pattern for two peer views that benefit from directional continuity. Both views remain mounted, while only the selected view participates in focus and accessibility navigation.

Keep both views mounted for continuity; expose only the active view to focus and assistive technology.

Import [`motion.css`](assets/transitions/motion.css) after Tailwind CSS 4.3+.

[Complete code example](examples/transitions/layout/page-side-by-side.md).

## Check

| Stage | Expected result |
| --- | --- |
| Initial | Overview is selected, Details is inert and `aria-hidden`, and the track starts at zero. |
| Action | Clicking either tab slides the matching page into place and updates tab and panel semantics. |
| Keyboard | Left/Home select Overview; Right/End select Details and move focus to the selected tab. |
| Rapid reversal | Repeated selection reverses the transform from its rendered position with no stale timer. |
| Reduced motion | The chosen page replaces its peer immediately while the same semantic state updates. |
| Cleanup | Calling the returned function removes click and key listeners; the selected page remains readable. |
