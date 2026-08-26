// the repository's only test configuration. it exists so that mock cleanup is
// a property of the runner rather than a line every spec has to remember:
// `coding:standards/testing` (TST-MOCK-10) bans hand-written
// `vi.restoreAllMocks()` and `mockRestore()` hooks, because a spec that
// forgets one leaks a live spy into the next file and the failure surfaces
// somewhere else entirely.
//
// there is no package.json and no node_modules here — vitest arrives through
// `bunx --bun vitest@^4.0.0 run`, the single command ci runs — so this file
// cannot import `defineConfig` from "vitest/config". a plain object is the
// whole contract.
export default {
  test: {
    // return every `vi.spyOn` target to its original before each test. no spec
    // installs a spy at file scope, so nothing depends on one outliving the
    // test that made it.
    restoreMocks: true,
    // and clear every `vi.fn()` call log and implementation the same way.
    mockReset: true,
    // the same guarantee for the two stub families. no spec calls
    // `vi.stubGlobal` today — that setting is here so the first one cannot
    // leak into the next file.
    unstubGlobals: true,
    unstubEnvs: true,
  },
};
