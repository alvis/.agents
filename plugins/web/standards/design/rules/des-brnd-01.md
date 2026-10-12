# DES-BRND-01: Brand Personality

## Intent

The product's identity is expressed consistently and on purpose through its decisions: color roles, typography, imagery, composition, information design, interaction, and tone. The expression fits the brief and audience; restraint and exuberance are both valid when chosen. A surface fails this rule when its appearance comes from an unexamined template default rather than a decision.

## Fix

- Name the brand's character and the decisions that carry it (type, color roles, imagery treatment, tone of voice, composition)
- Apply those decisions consistently across pages and components through shared tokens
- Replace inherited template defaults that no decision justifies
- Keep conventions where users rely on them; express identity where it helps meaning

## Code Superpowers

- Check brand token usage (`--ui-primary`, `--ui-accent`, `--font-display`) across components
- Verify consistent font-family usage across pages
- Flag framework or library default styling that nothing in the design contract chose

## Common Mistakes

1. Generic template appearance with no decision behind it (unmodified library defaults)
2. Brand colors or type used inconsistently across screens
3. Decoration unrelated to the subject standing in for identity
4. Rejecting a familiar pattern only to look different, at the cost of usability

## Edge Cases

- Some industries (banking, healthcare) intentionally use conservative design — it still reads as chosen, not inherited
- Retro, maximal, or expressive styles are valid brand expression when applied consistently

## Related

DES-BRND-02, DES-COLR-01, DES-TYPO-01
