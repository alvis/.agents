# Transition recipe author validation

Load this guide only when authoring or verifying the shipped transition recipes, shared motion asset, fence contract, fixture builder, or behavior checker. Consumer selection and implementation do not need it.

## Build deterministic fixtures

Run from the design skill root. Point the build only at an absolute disposable consumer whose `node_modules` already contains `tailwindcss@4.3.3` and `@tailwindcss/cli@4.3.3`; the author harness deliberately pins both packages even though consumer guidance accepts versions at or above 4.3. The build replaces the consumer's `fixtures/` directory, so never target an application workspace or a directory containing evidence that must survive.

```sh
bun scripts/transitions.ts self-check
bun scripts/transitions.ts build --consumer /absolute/disposable/consumer
```

`self-check` must exit zero with one JSON line reporting `status: "success"` and `cases: 4`. `build` discovers every recipe beneath `examples/transitions/`, validates its fence contract, compiles it, replaces `<consumer>/fixtures/`, and exits zero with one JSON line containing `status`, the discovered example count, and the absolute manifest path. It writes the gallery plus each recipe's `index.html`, `input.css`, and `output.css`; there is no per-recipe build selector.

A precondition, schema, or compiler failure exits one with `TransitionFixtureError` on standard error. Treat every partial fixture from a failed build as invalid and do not claim a manifest or preserve it as evidence.

## Exercise behavior

Serve the generated fixtures in a working native browser context. Read `manifest.json` and verify the SHA-256 of every file in `behavior_checks`. For every fixture and each of `primary`, `replay`, `disposed`, `controlled_js_reduce`, `controlled_css_reduce`, and `native_reduce`, open or reload a fresh `fixture_url`, evaluate the listed harness and five domain registration modules, then call `await globalThis.__runTransitionChecks({ phase })`; registration order is not significant. Repeat the overflow assertion from a fresh fixture at 375, 768, and 1280 CSS pixels. Record every returned failure and the browser context used instead of substituting visual judgment for a phase.

Run `native_reduce` against the browser's actual reduced-motion preference, independently of the controlled probes. If the active browser context cannot emulate that preference, report the unsupported capability explicitly. When native `matchMedia` is false, `native_reduce` must report `unverified`; it is not evidence that the native media branch ran. `controlled_js_reduce` replaces only that query before remount and flips false to true, proving the recipe's live JavaScript branch, final semantics, and listener cleanup without proving browser preference emulation. `controlled_css_reduce` extracts matching compiled `CSSMediaRule` contents into a trailing style, proving the fallback declarations affect the fixture without proving native media-query activation. Normal native phases plus both controlled probes are the bounded evidence; report the native branch as unverified rather than upgrading that claim.

## Bind the receipt

Bind the behavior results to the manifest's `aggregate_sha256`; every `behavior_checks` path and SHA-256; compiler package versions; shared motion path and hash; and each exercised entry's source, source hash, fence hashes, fixture URL, kind, and compiled input/output hashes. A later checker, source, asset, compiler, or generated-output change invalidates evidence bound to the changed hash; rebuild and rerun the affected behavior before reporting current validation.
