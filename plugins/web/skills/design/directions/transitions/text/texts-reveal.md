# Texts reveal

Use this recipe to stage a short heading and supporting line as one message enters a hero, empty state, or onboarding step. The entrance rises in sequence while dismissal stays a quiet fade, so hiding the message does not replay the reveal backward.

Import `assets/transitions/motion.css` after Tailwind CSS in a Tailwind 4.3 or newer stylesheet, then use the complete [code example](examples/transitions/text/texts-reveal.md), including its recipe CSS. Add more lines by assigning each a zero-based `--line-index`; keep the total stagger short enough that the last line does not feel delayed.

## Checks

- Initial: the heading enters first and the supporting line follows 40ms later; both finish sharp at their natural positions.
- Action: **Hide message** fades both lines together and then removes the message from accessibility and layout; **Replay reveal** restores and restages it.
- Final: the shown state contains normal semantic text with no visual clone; the hidden state uses the native `hidden` attribute.
- Replay and cleanup: rapid show/hide actions cancel the stale hide timer; cleanup cancels it and removes listeners.
- Reduced motion: enabling the preference during dismissal immediately applies the intended shown or hidden state; subsequent actions do not animate.
- Accessibility: the heading and paragraph retain their semantics, buttons have 44px targets and visible focus, and the live region announces a restored message as a unit.
