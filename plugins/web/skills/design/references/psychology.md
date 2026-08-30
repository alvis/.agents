# Design Psychology Reference

## HCI Laws (Practical Rules)

### Fitts's Law
- Primary CTA: largest interactive element, near visual focus
- Destructive actions: small, spatially separated from primary CTA
- Touch targets: min 44x44 CSS px (web) / 48x48 dp (mobile)
- Screen edges are infinite-size targets — use for key navigation

### Hick's Law
- Limit visible choices to ~7; add grouping/search/filtering beyond that
- Use smart defaults to eliminate decisions
- Progressive disclosure: basic first, advanced on demand

### Miller's Law
- Working memory holds ~7+-2 items
- Navigation: <=7 top-level items; group the rest
- Forms: chunk into groups of <=5-7 fields
- Don't force users to remember across screens — carry context forward

## Cognitive Biases

- **Anchoring** — first value/option seen sets the reference. Place recommended option first. Pre-fill forms carefully.
- **Default effect** — users stick with defaults. Defaults are the most powerful design decision.
- **Peak-end rule** — experience judged by its peak moment and ending. Invest in delightful completion moments.
- **Loss aversion** — losses feel ~2x stronger than equivalent gains. Frame destructive actions as losses; use confirmation.
- **Inattentional blindness** — users miss things outside their focus. Place critical info in the user's task flow, not in banners.

## Design Psychology (Norman)

- **Affordance** — what an object allows a person to do. In UI: manage perceived affordances.
- **Signifier** — cue indicating possible action (button shape, link styling, cursor change). Use smallest signifier that removes ambiguity.
- **Mapping** — relationship between control and effect. Put controls near what they affect; use spatial grouping.
- **Constraint** — limits on possible actions. Prefer constraints + defaults over warnings.
- **Conceptual model** — user's internal model of how the system works. Use consistent nouns/labels and show cause-effect clearly.
- **Feedback** — what happened after an action. Always provide immediate feedback; show progress for slow operations.
- **Execution gulf** — user can't figure out how to do what they want. Fix: clearer CTA, better signifiers, fewer choices.
- **Evaluation gulf** — user can't tell what happened. Fix: loading states, progress indicators, clear result messages.
- **Slip** — correct goal, wrong execution (fat-finger, misclick). Fix: undo, confirmation for destructive actions, larger targets.
- **Mistake** — wrong mental model/goal. Fix: better labels, clearer mapping, conceptual model alignment.
