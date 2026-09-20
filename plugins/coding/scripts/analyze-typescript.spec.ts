import { spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { analyze, run } from "./analyze-typescript.ts";

const analyzer = resolve(import.meta.dirname, "analyze-typescript.ts");
// bounds pathological inputs while allowing cold parser dependency resolution
const processTimeoutMs = 30_000;

describe("cmd:analyze-typescript", () => {
  it.each([false, true])(
    "should bound the CLI while retaining an oversized report, failure=%s",
    (failure) => {
      const files = Object.fromEntries(
        Array.from({ length: 100 }, (_, index) => [
          `selected-${index}-${"x".repeat(50)}.ts`,
          `export const value${index} = ${index};`,
        ]),
      );
      const fixture = createFixture(files);
      try {
        const selected = failure
          ? ["missing-" + "中".repeat(3000) + ".ts"]
          : Object.keys(files);
        const result = spawnSync(
          "bun",
          [analyzer, "--repository-root", fixture, "--", ...selected],
          { cwd: fixture, encoding: "utf8", timeout: processTimeoutMs },
        );
        const summary = JSON.parse(result.stdout);
        expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(4096);
        expect(summary.exit_code).toBe(result.status);
        expect(summary.original_exit_code).toBe(result.status);
        expect(summary.truncated).toBe(true);
        expect(result.stderr).toBe("");
        const report = readCliReport(result.stdout);
        expect(
          Buffer.byteLength(report.stdout + report.stderr),
        ).toBeGreaterThan(4096);
        if (failure) {
          expect(result.status).not.toBe(0);
          expect(report.stderr + report.stdout).toContain(selected[0]);
        } else {
          expect(result.status).toBe(0);
          expect(
            JSON.parse(report.stdout).packages[0].selected_files,
          ).toHaveLength(100);
        }
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    },
  );
  it("should keep callback settlement through captured executable bodies advisory", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when rejected */
export function captured() { return new Promise<void>((resolve, reject) => { const done = () => resolve(); done(); reject(new RangeError()); }); }
/** @throws {RangeError} when rejected */
export function getter() { return new Promise<void>((resolve, reject) => { const holder = { get done() { resolve(); return 1; } }; holder.done; reject(new RangeError()); }); }
/** @throws {RangeError} when rejected */
export function constructor() { return new Promise<void>((resolve, reject) => { class Done { constructor() { resolve(); } } new Done(); reject(new RangeError()); }); }
/** @throws {RangeError} when rejected */
export function hoistedConstructor() { return new Promise<void>((resolve, reject) => { new Done(); reject(new RangeError()); function Done() { resolve(); } }); }
/** @throws {RangeError} when rejected */
export function hoistedTag() { return new Promise<void>((resolve, reject) => { done\`\`; reject(new RangeError()); function done() { resolve(); } }); }
/** @throws {RangeError} when rejected */
export function parenthesizedCall() { return new Promise<void>((resolve, reject) => { (done)(); reject(new RangeError()); function done() { resolve(); } }); }
/** @throws {RangeError} when rejected */
export function libraryCall() { return new Promise<void>((resolve, reject) => { done.call(null); reject(new RangeError()); function done() { resolve(); } }); }
/** @throws {RangeError} when rejected */
export function reflectedCall() { return new Promise<void>((resolve, reject) => { Reflect.apply(done, null, []); reject(new RangeError()); function done() { resolve(); } }); }
/** @throws {RangeError} when rejected */
export function shorthandCall() { return new Promise<void>((resolve, reject) => { const box = { done }; box.done(); reject(new RangeError()); function done() { resolve(); } }); }
/** @throws {RangeError} when rejected */
export function hoistedWrapper() { return new Promise<void>((resolve, reject) => { wrapper(); reject(new RangeError()); function wrapper() { done(); } function done() { resolve(); } }); }
/** @throws {RangeError} when rejected */
export function capturedShorthand() { return new Promise<void>((resolve, reject) => { done(); reject(new RangeError()); function done() { const box = { resolve }; box.resolve(); } }); }
/** @throws {RangeError} when rejected */
export function priorRejection() { return new Promise<void>((resolve, reject) => { reject(new RangeError()); const holder = { get done() { resolve(); return 1; } }; holder.done; }); }`,
      "runtime.ts": `import { captured, getter, constructor, hoistedConstructor, hoistedTag, parenthesizedCall, libraryCall, reflectedCall, shorthandCall, hoistedWrapper, capturedShorthand, priorRejection } from './selected';
console.log(JSON.stringify(await Promise.all([captured, getter, constructor, hoistedConstructor, hoistedTag, parenthesizedCall, libraryCall, reflectedCall, shorthandCall, hoistedWrapper, capturedShorthand, priorRejection].map(fn => fn().then(() => "fulfilled", error => error.constructor.name)))));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({
        status: runtime.status,
        outcomes: JSON.parse(runtime.stdout),
      }).toEqual({
        status: 0,
        outcomes: [
          "fulfilled",
          "fulfilled",
          "fulfilled",
          "fulfilled",
          "fulfilled",
          "fulfilled",
          "fulfilled",
          "fulfilled",
          "fulfilled",
          "fulfilled",
          "fulfilled",
          "RangeError",
        ],
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            "captured",
            "getter",
            "constructor",
            "hoistedConstructor",
            "hoistedTag",
            "parenthesizedCall",
            "libraryCall",
            "reflectedCall",
            "shorthandCall",
            "hoistedWrapper",
            "capturedShorthand",
          ].map((function_name) =>
            expect.objectContaining({
              function_name,
              documented_error: "RangeError",
              reason: expect.stringMatching(/^(unsupported|unresolved)$/),
            }),
          ),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it(
    "should complete deeply nested fulfilled awaits within the CLI execution budget",
    () => {
      // This modest source depth exposes repeated subtree traversal without stressing parser recursion.
      const expression = Array.from({ length: 32 }).reduce<string>(
        (inner) => `await Promise.resolve(${inner})`,
        "7",
      );
      const fixture = createFixture({
        "selected.ts": `/** @throws {RangeError} when rejected */
export async function nested() { return ${expression}; }`,
        "runtime.ts": `import { nested } from './selected';
console.log(JSON.stringify(await nested()));`,
      });
      try {
        const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
          encoding: "utf8",
          timeout: processTimeoutMs,
        });
        expect({
          status: runtime.status,
          outcome: JSON.parse(runtime.stdout),
        }).toEqual({ status: 0, outcome: 7 });
        const result = runAnalyzer(fixture, ["selected.ts"]);
        expect(result.exitCode, result.stderr).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual(
          expect.objectContaining({
            status: "complete",
            error_documentation_candidates: [
              expect.objectContaining({
                function_name: "nested",
                documented_error: "RangeError",
                reason: "unsupported",
              }),
            ],
          }),
        );
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    },
    processTimeoutMs * 2,
  );

  it("should treat callback alias settlement before direct rejection as advisory", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when rejected */
export function settled() { return new Promise<void>((resolve, reject) => { const done = resolve; done(); reject(new RangeError()); }); }`,
      "runtime.ts": `import { settled } from './selected';
console.log(JSON.stringify(await settled().then(() => "fulfilled", error => error.constructor.name)));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({
        status: runtime.status,
        outcome: JSON.parse(runtime.stdout),
      }).toEqual({ status: 0, outcome: "fulfilled" });
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            expect.objectContaining({
              function_name: "settled",
              documented_error: "RangeError",
              reason: expect.stringMatching(/^(unsupported|unresolved)$/),
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should stop error evidence after a definitely rejecting await", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when invalid
 * @throws {TypeError} when rejected */
export async function stopped() { await Promise.reject(new TypeError()); throw new RangeError(); }`,
      "runtime.ts": `import { stopped } from './selected';
console.log(JSON.stringify(await stopped().then(() => "fulfilled", error => error.constructor.name)));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({
        status: runtime.status,
        outcome: JSON.parse(runtime.stdout),
      }).toEqual({ status: 0, outcome: "TypeError" });
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            expect.objectContaining({
              function_name: "stopped",
              documented_error: "RangeError",
              reason: expect.stringMatching(/^(unsupported|unresolved)$/),
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should retain errors from nested awaits while evaluating returned expressions", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when rejected */
export async function nested() { return (await Promise.reject(new RangeError()), undefined); }`,
      "runtime.ts": `import { nested } from './selected';
console.log(JSON.stringify(await nested().then(() => "fulfilled", error => error.constructor.name)));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({
        status: runtime.status,
        outcome: JSON.parse(runtime.stdout),
      }).toEqual({ status: 0, outcome: "RangeError" });
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({ error_documentation_candidates: [] }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should retain rejecting evaluation in concise async arrow returns", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when rejected */
export const concise = async () => (await Promise.reject(new RangeError()), undefined);`,
      "runtime.ts": `import { concise } from './selected';
console.log(JSON.stringify(await concise().then(() => "fulfilled", error => error.constructor.name)));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({
        status: runtime.status,
        outcome: JSON.parse(runtime.stdout),
      }).toEqual({ status: 0, outcome: "RangeError" });
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({ error_documentation_candidates: [] }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should retain rejecting nested operands while evaluating an outer await", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when rejected */
export async function nestedOperand() { return await Promise.resolve(await Promise.reject(new RangeError())); }`,
      "runtime.ts": `import { nestedOperand } from './selected';
console.log(JSON.stringify(await nestedOperand().then(() => "fulfilled", error => error.constructor.name)));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({
        status: runtime.status,
        outcome: JSON.parse(runtime.stdout),
      }).toEqual({ status: 0, outcome: "RangeError" });
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({ error_documentation_candidates: [] }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should evaluate returned comma values and awaited completion before attributing errors", () => {
    const fixture = createFixture({
      "selected.ts": `declare function unknownError(): unknown;
/** @throws {RangeError} when rejected */
export function comma() { return (0, Promise.reject(new RangeError())); }
/** @throws {RangeError} when rejected */
export async function fulfilledAwait() { return await Promise.resolve(); }
/** @throws {RangeError} when rejected */
export async function rejectedAwait() { return await Promise.reject(new RangeError()); }
/** @throws {RangeError} when rejected */
export async function uncertainAwait() { await Promise.reject(unknownError()); throw new RangeError(); }
/** @throws {RangeError} when rejected */
export async function aliasedAwait() { const result = await Promise.resolve(); return result; }`,
      "runtime.ts": `import { comma, fulfilledAwait, rejectedAwait } from './selected';
console.log(JSON.stringify(await Promise.all([comma, fulfilledAwait, rejectedAwait].map(fn => fn().then(() => "fulfilled", error => error.constructor.name)))));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({
        status: runtime.status,
        outcomes: JSON.parse(runtime.stdout),
      }).toEqual({
        status: 0,
        outcomes: ["RangeError", "fulfilled", "RangeError"],
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            expect.objectContaining({
              function_name: "fulfilledAwait",
              documented_error: "RangeError",
              reason: "unsupported",
            }),
            expect.objectContaining({
              function_name: "uncertainAwait",
              documented_error: "RangeError",
              reason: "unresolved",
            }),
            expect.objectContaining({
              function_name: "aliasedAwait",
              documented_error: "RangeError",
              reason: "unsupported",
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should decline predicate reuse when the predicate parameter has no binding", () => {
    const fixture = createFixture({
      "selected.ts": `export type Guard = (value: unknown) => missing is string;
export function select(check: (item: unknown) => missing is string): void {}`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          reuse_candidates: [],
          extraction_proposals: [],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should distinguish predicate parameter positions and this bindings", () => {
    const fixture = createFixture({
      "selected.ts": `export type FirstGuard = (first: unknown, second: unknown) => first is string;
export type ReceiverGuard = (this: unknown, value: unknown) => this is string;
export function second(check: (first: unknown, second: unknown) => second is string): void {}
export function argument(check: (this: unknown, value: unknown) => value is string): void {}`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          reuse_candidates: [],
          extraction_proposals: [],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should reuse type predicates with renamed bound parameters", () => {
    const fixture = createFixture({
      "selected.ts": `export type Guard = (value: unknown) => value is string;
export function select(check: (item: unknown) => item is string): void {}`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          reuse_candidates: [
            expect.objectContaining({
              candidates: [expect.objectContaining({ name: "Guard" })],
            }),
          ],
          extraction_proposals: [],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should select reachable conditional error values before attributing thrown and rejected identities", () => {
    const fixture = createFixture({
      "selected.ts": `class DeadError extends Error { kind = "dead" as const; }
class LiveError extends Error { kind = "live" as const; }
/** @throws {DeadError} when invalid */
export function thrownFalse() { throw (false ? new DeadError() : new LiveError()); }
/** @throws {DeadError} when invalid */
export function thrownTrue() { throw (true ? new LiveError() : new DeadError()); }
/** @throws {DeadError} when invalid */
export function rejected() { return Promise.reject(false ? new DeadError() : new LiveError()); }
/** @throws {DeadError} when invalid */
export function executor() { return new Promise((resolve, reject) => { reject(false ? new DeadError() : new LiveError()); }); }
/** @throws {DeadError} when invalid */
export function unknownValue() { throw (1 === 2 ? new DeadError() : new LiveError()); }
/** @throws {DeadError} when invalid */
export function aliasedValue() { const error = false ? new DeadError() : new LiveError(); throw error; }
/** @throws {LiveError} when invalid */
export function supported() { throw (false ? new DeadError() : new LiveError()); }`,
      "runtime.ts": `import { thrownFalse, thrownTrue, rejected, executor, unknownValue, aliasedValue, supported } from './selected';
console.log(JSON.stringify(await Promise.all([thrownFalse, thrownTrue, rejected, executor, unknownValue, aliasedValue, supported].map(async fn => { try { await fn(); return "returned"; } catch (error) { return error.constructor.name; } }))));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({
        status: runtime.status,
        outcomes: JSON.parse(runtime.stdout),
      }).toEqual({
        status: 0,
        outcomes: [
          "LiveError",
          "LiveError",
          "LiveError",
          "LiveError",
          "LiveError",
          "LiveError",
          "LiveError",
        ],
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            "thrownFalse",
            "thrownTrue",
            "rejected",
            "executor",
            "unknownValue",
            "aliasedValue",
          ].map((function_name) =>
            expect.objectContaining({
              function_name,
              documented_error: "DeadError",
              reason: expect.stringMatching(/^(unsupported|unresolved)$/),
            }),
          ),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should invalidate callbacks before destructuring defaults invoke overwritten bindings", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when rejected */
export function arrayDefault() { return new Promise<unknown>((resolve, reject) => { let other; [reject, other = reject(new RangeError())] = [resolve, undefined]; }); }
/** @throws {RangeError} when rejected */
export function objectDefault() { return new Promise<unknown>((resolve, reject) => { let other; ({ reject, other = reject(new RangeError()) } = { reject: resolve, other: undefined }); }); }
/** @throws {RangeError} when rejected */
export function priorArrayRejection() { return new Promise<unknown>((resolve, reject) => { let other; reject(new RangeError()); [reject, other = reject(new TypeError())] = [resolve, undefined]; }); }
/** @throws {RangeError} when rejected */
export function priorObjectRejection() { return new Promise<unknown>((resolve, reject) => { let other; reject(new RangeError()); ({ reject, other = reject(new TypeError()) } = { reject: resolve, other: undefined }); }); }`,
      "runtime.ts": `import { arrayDefault, objectDefault, priorArrayRejection, priorObjectRejection } from './selected';
console.log(JSON.stringify(await Promise.all([arrayDefault, objectDefault, priorArrayRejection, priorObjectRejection].map(fn => fn().then(() => "fulfilled", error => error.constructor.name)))));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({
        status: runtime.status,
        outcomes: JSON.parse(runtime.stdout),
      }).toEqual({
        status: 0,
        outcomes: ["fulfilled", "fulfilled", "RangeError", "RangeError"],
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: ["arrayDefault", "objectDefault"].map(
            (function_name) =>
              expect.objectContaining({
                function_name,
                documented_error: "RangeError",
                reason: expect.stringMatching(/^(unsupported|unresolved)$/),
              }),
          ),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should exclude unreachable conditional errors and preserve reachable branch evidence", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when invalid */
export function skippedIf() { if (false) throw new RangeError(); }
/** @throws {RangeError} when invalid */
export function takenIf() { if (true) throw new RangeError(); }
/** @throws {RangeError} when invalid */
export function skippedElse() { if ((true)) return; else throw new RangeError(); }
/** @throws {RangeError} when invalid */
export function takenElse() { if (false) return; else throw new RangeError(); }
/** @throws {RangeError} when invalid */
export function skippedThen() { return false ? Promise.reject(new RangeError()) : Promise.resolve(); }
/** @throws {RangeError} when invalid */
export function takenThen() { return true ? Promise.reject(new RangeError()) : Promise.resolve(); }
/** @throws {RangeError} when invalid */
export function skippedOtherwise() { return true ? Promise.resolve() : Promise.reject(new RangeError()); }
/** @throws {RangeError} when invalid */
export function takenOtherwise() { return false ? Promise.resolve() : Promise.reject(new RangeError()); }`,
      "runtime.ts": `import { skippedIf, takenIf, skippedElse, takenElse, skippedThen, takenThen, skippedOtherwise, takenOtherwise } from './selected';
console.log(JSON.stringify(await Promise.all([skippedIf, takenIf, skippedElse, takenElse, skippedThen, takenThen, skippedOtherwise, takenOtherwise].map(async fn => { try { await fn(); return "returned"; } catch (error) { return error.constructor.name; } }))));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({
        status: runtime.status,
        outcomes: JSON.parse(runtime.stdout),
      }).toEqual({
        status: 0,
        outcomes: [
          "returned",
          "RangeError",
          "returned",
          "RangeError",
          "returned",
          "RangeError",
          "returned",
          "RangeError",
        ],
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            "skippedIf",
            "skippedElse",
            "skippedThen",
            "skippedOtherwise",
          ].map((function_name) =>
            expect.objectContaining({
              function_name,
              documented_error: "RangeError",
              reason: expect.stringMatching(/^(unsupported|unresolved)$/),
            }),
          ),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should invalidate overwritten executor callbacks without losing prior settlement", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when rejected */
export function rejectOverwritten() { return new Promise<unknown>((resolve, reject) => { reject = resolve; reject(new RangeError()); }); }
/** @throws {RangeError} when rejected */
export function resolveOverwritten() { return new Promise<unknown>((resolve, reject) => { resolve = () => {}; resolve(); reject(new RangeError()); }); }
/** @throws {RangeError} when rejected */
export function directReject() { return new Promise<unknown>((resolve, reject) => { reject(new RangeError()); }); }
/** @throws {RangeError} when rejected */
export function priorReject() { return new Promise<unknown>((resolve, reject) => { reject(new RangeError()); reject = resolve; reject(new TypeError()); }); }
/** @throws {RangeError} when rejected */
export function priorResolve() { return new Promise<unknown>((resolve, reject) => { resolve(); resolve = reject; resolve(new RangeError()); }); }`,
      "runtime.ts": `import { rejectOverwritten, resolveOverwritten, directReject, priorReject, priorResolve } from './selected';
console.log(JSON.stringify(await Promise.all([rejectOverwritten, resolveOverwritten, directReject, priorReject, priorResolve].map(fn => fn().then(() => "fulfilled", error => error.constructor.name)))));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({
        status: runtime.status,
        outcomes: JSON.parse(runtime.stdout),
      }).toEqual({
        status: 0,
        outcomes: [
          "fulfilled",
          "RangeError",
          "RangeError",
          "RangeError",
          "fulfilled",
        ],
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            "rejectOverwritten",
            "resolveOverwritten",
            "priorResolve",
          ].map((function_name) =>
            expect.objectContaining({
              function_name,
              documented_error: "RangeError",
              reason: expect.stringMatching(/^(unsupported|unresolved)$/),
            }),
          ),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should keep uncertain conditions advisory and invalidate destructured executor callback writes", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when invalid */
export function unknownIf() { if (1 === 2) throw new RangeError(); }
/** @throws {RangeError} when invalid */
export function unknownTernary() { return 1 === 2 ? Promise.reject(new RangeError()) : Promise.resolve(); }
/** @throws {RangeError} when rejected */
export function destructured() { return new Promise<unknown>((resolve, reject) => { [reject] = [resolve]; reject(new RangeError()); }); }
/** @throws {RangeError} when rejected */
export function objectAssigned() { return new Promise<unknown>((resolve, reject) => { ({ callback: reject } = { callback: resolve }); reject(new RangeError()); }); }
/** @throws {RangeError} when rejected */
export function incremented() { return new Promise<unknown>((resolve, reject) => { reject++; reject(new RangeError()); }); }
/** @throws {RangeError} when rejected */
export function prefixed() { return new Promise<unknown>((resolve, reject) => { ++resolve; resolve(); reject(new RangeError()); }); }
/** @throws {RangeError} when rejected */
export function skippedExecutor() { return new Promise<unknown>((resolve, reject) => { if (false) reject(new RangeError()); resolve(); }); }
/** @throws {RangeError} when rejected */
export function takenExecutor() { return new Promise<unknown>((resolve, reject) => { if (true) reject(new RangeError()); resolve(); }); }`,
      "runtime.ts": `import { unknownIf, unknownTernary, destructured, objectAssigned, incremented, prefixed, skippedExecutor, takenExecutor } from './selected';
console.log(JSON.stringify(await Promise.all([unknownIf, unknownTernary, destructured, objectAssigned, incremented, prefixed, skippedExecutor, takenExecutor].map(async fn => { try { await fn(); return "returned"; } catch (error) { return error.constructor.name; } }))));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({
        status: runtime.status,
        outcomes: JSON.parse(runtime.stdout),
      }).toEqual({
        status: 0,
        outcomes: [
          "returned",
          "returned",
          "returned",
          "returned",
          "TypeError",
          "TypeError",
          "returned",
          "RangeError",
        ],
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            "unknownIf",
            "unknownTernary",
            "destructured",
            "objectAssigned",
            "incremented",
            "prefixed",
            "skippedExecutor",
          ].map((function_name) =>
            expect.objectContaining({
              function_name,
              documented_error: "RangeError",
              reason: expect.stringMatching(/^(unsupported|unresolved)$/),
            }),
          ),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should keep conditional catch reachability and later throw reachability advisory", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when invalid */
export function shortCircuit() { false && (() => { throw new RangeError(); })(); }
/** @throws {RangeError} when invalid */
export function uncertainReturn(flag = true) { if (flag) return; throw new RangeError(); }
/** @throws {RangeError} when invalid */
export function skippedCatch() { try { if (false) throw new TypeError(); } catch { throw new RangeError(); } }
/** @throws {RangeError} when invalid */
export function takenCatch() { try { if (true) throw new TypeError(); } catch { throw new RangeError(); } }
/** @throws {RangeError} when invalid */
export function uncertainCatch() { try { if (1 === 2) throw new TypeError(); } catch { throw new RangeError(); } }
/** @throws {RangeError} when invalid */
export async function takenAwait() { await (true ? Promise.reject(new RangeError()) : Promise.resolve()); }
/** @throws {RangeError} when invalid */
export async function skippedAwait() { await (false ? Promise.reject(new RangeError()) : Promise.resolve()); }
/** @throws {RangeError} when invalid */
export async function conditionalAwaitTrue() { true ? await Promise.reject(new RangeError()) : undefined; }
/** @throws {RangeError} when invalid */
export async function conditionalAwaitFalse() { false ? undefined : await Promise.reject(new RangeError()); }
/** @throws {RangeError} when invalid */
export function harmlessWrite() { return new Promise<unknown>((resolve, reject) => { let count = 0; count++; -count; count = 2; [] = []; reject(new RangeError()); }); }`,
      "runtime.ts": `import { shortCircuit, uncertainReturn, skippedCatch, takenCatch, uncertainCatch, takenAwait, skippedAwait, conditionalAwaitTrue, conditionalAwaitFalse, harmlessWrite } from './selected';
console.log(JSON.stringify(await Promise.all([shortCircuit, uncertainReturn, skippedCatch, takenCatch, uncertainCatch, takenAwait, skippedAwait, conditionalAwaitTrue, conditionalAwaitFalse, harmlessWrite].map(async fn => { try { await fn(); return "returned"; } catch (error) { return error.constructor.name; } }))));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({
        status: runtime.status,
        outcomes: JSON.parse(runtime.stdout),
      }).toEqual({
        status: 0,
        outcomes: [
          "returned",
          "returned",
          "returned",
          "RangeError",
          "returned",
          "RangeError",
          "returned",
          "RangeError",
          "RangeError",
          "RangeError",
        ],
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            "shortCircuit",
            "uncertainReturn",
            "skippedCatch",
            "uncertainCatch",
            "skippedAwait",
          ].map((function_name) =>
            expect.objectContaining({
              function_name,
              documented_error: "RangeError",
              reason: expect.stringMatching(/^(unsupported|unresolved)$/),
            }),
          ),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should invalidate redeclared executor callbacks including hoisted replacements", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when rejected */
export function variableReplacement() { return new Promise<unknown>((resolve, reject) => { var reject = resolve; reject(new RangeError()); }); }
/** @throws {RangeError} when rejected */
export function hoistedReplacement() { return new Promise<unknown>((resolve, reject) => { reject(new RangeError()); function reject(value) { resolve(value); } }); }
/** @throws {RangeError} when rejected */
export function retainedCallback() { return new Promise<unknown>((resolve, reject) => { var reject; function unrelated() {} reject(new RangeError()); }); }`,
      "runtime.ts": `import { variableReplacement, hoistedReplacement, retainedCallback } from './selected';
console.log(JSON.stringify(await Promise.all([variableReplacement, hoistedReplacement, retainedCallback].map(fn => fn().then(() => "fulfilled", error => error.constructor.name)))));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({
        status: runtime.status,
        outcomes: JSON.parse(runtime.stdout),
      }).toEqual({
        status: 0,
        outcomes: ["fulfilled", "fulfilled", "RangeError"],
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            "variableReplacement",
            "hoistedReplacement",
          ].map((function_name) =>
            expect.objectContaining({
              function_name,
              documented_error: "RangeError",
              reason: expect.stringMatching(/^(unsupported|unresolved)$/),
            }),
          ),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should exclude unreachable catch errors and keep guarded rethrows advisory", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when invalid */
export function empty() { try {} catch { throw new RangeError(); } }
/** @throws {RangeError} when invalid */
export function rethrow() { try { throw new RangeError(); } catch (error) { if (error instanceof RangeError) throw error; } }`,
      "runtime.ts": `import { empty, rethrow } from './selected';
console.log(JSON.stringify([empty, rethrow].map(fn => { try { fn(); return "returned"; } catch (error) { return error.constructor.name; } })));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({ status: runtime.status, output: runtime.stdout }).toEqual({
        status: 0,
        output: '["returned","RangeError"]\n',
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            expect.objectContaining({
              function_name: "empty",
              documented_error: "RangeError",
              reason: expect.stringMatching(/^(unsupported|unresolved)$/),
            }),
            expect.objectContaining({
              function_name: "rethrow",
              documented_error: "RangeError",
              reason: "unresolved",
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it.each([false, true])(
    "should prune unreadable Git-ignored directories while retaining negated peers with configuration %s",
    (configured: boolean) => {
      const fixture = createFixture({
        ".gitignore": "cache/\npeers/*\n!peers/kept.ts\n",
        ...(configured
          ? {
              "tsconfig.json": JSON.stringify({
                compilerOptions: { strict: true },
                include: ["**/*.ts"],
              }),
            }
          : {}),
        "selected.ts": "export const first: { value: string } = null!;",
        "cache/hidden.ts": "export const invalid: { = ;",
        "peers/ignored.ts": "export const invalid: { = ;",
        "peers/kept.ts": "export const second: { value: string } = null!;",
      });
      try {
        const initialized = spawnSync("git", ["init", fixture], {
          encoding: "utf8",
        });
        expect(initialized.status, initialized.stderr).toBe(0);
        chmodSync(resolve(fixture, "cache"), 0o000);
        const result = runAnalyzer(fixture, ["selected.ts"]);

        expect(result.exitCode, result.stderr).toBe(0);
        expect(JSON.parse(result.stdout)).toEqual(
          expect.objectContaining({
            packages: [
              expect.objectContaining({
                files: [
                  resolve(fixture, "peers/kept.ts"),
                  resolve(fixture, "selected.ts"),
                ],
              }),
            ],
            extraction_proposals: [
              expect.objectContaining({
                occurrences: [expect.any(Object), expect.any(Object)],
              }),
            ],
          }),
        );
      } finally {
        chmodSync(resolve(fixture, "cache"), 0o755);
        rmSync(fixture, { recursive: true, force: true });
      }
    },
  );

  it("should distinguish uncertain catch reachability from awaited and returned rejections", () => {
    const fixture = createFixture({
      "selected.ts": `function dependency() { throw new RangeError(); }
/** @throws {TypeError} when dependency fails */
export function indirect() { try { dependency(); } catch { throw new TypeError(); } }
/** @throws {TypeError} when rejection is caught */
export async function awaited() { try { await Promise.reject(new RangeError()); } catch { throw new TypeError(); } }
/** @throws {TypeError} when rejection is caught */
export function returned() { try { return Promise.reject(new RangeError()); } catch { throw new TypeError(); } }`,
      "runtime.ts": `import { indirect, awaited, returned } from './selected';
console.log(JSON.stringify(await Promise.all([indirect, awaited, returned].map(async fn => { try { await fn(); return "returned"; } catch (error) { return error.constructor.name; } }))));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({ status: runtime.status, output: runtime.stdout }).toEqual({
        status: 0,
        output: '["TypeError","TypeError","RangeError"]\n',
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: ["indirect", "returned"].map(
            (function_name) =>
              expect.objectContaining({
                function_name,
                documented_error: "TypeError",
                reason: "unresolved",
              }),
          ),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should keep unreachable and uncertain catch paths distinct through no-ops and fulfilled awaits", () => {
    const fixture = createFixture({
      "selected.ts": `function dependency() { throw new RangeError(); }
/** @throws {TypeError} when invalid */
export function noops() { try { ; function nested() { throw new RangeError(); } return; throw new RangeError(); } catch { throw new TypeError(); } }
/** @throws {TypeError} when invalid */
export function declaration() { try { const value = 1; } catch { throw new TypeError(); } }
/** @throws {TypeError} when invalid */
export async function fulfilled() { try { await Promise.resolve(); } catch { throw new TypeError(); } }
/** @throws {TypeError} when invalid */
export function consumed() { try { dependency(); } catch {} }
/** @throws {TypeError} when invalid */
export function uncertainHandler() { try { dependency(); } catch { while (false) {} } }`,
      "runtime.ts": `import { noops, declaration, fulfilled, consumed, uncertainHandler } from './selected';
console.log(JSON.stringify(await Promise.all([noops, declaration, fulfilled, consumed, uncertainHandler].map(async fn => { await fn(); return "returned"; }))));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({ status: runtime.status, output: runtime.stdout }).toEqual({
        status: 0,
        output: '["returned","returned","returned","returned","returned"]\n',
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            ["noops", "unsupported"],
            ["declaration", "unresolved"],
            ["fulfilled", "unresolved"],
            ["consumed", "unsupported"],
            ["uncertainHandler", "unresolved"],
          ].map(([function_name, reason]) =>
            expect.objectContaining({
              function_name,
              documented_error: "TypeError",
              reason,
            }),
          ),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should require review when catch destructuring throws before the handler body", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when invalid */
export function destructured() { try { throw null; } catch ({ message }) { throw new RangeError(); } }
/** @throws {RangeError} when rejected */
export function executor() { return new Promise((resolve, reject) => { try { throw null; } catch ({ message }) { reject(new RangeError()); } }); }
/** @throws {RangeError} when rejected */
export function settled() { return new Promise((resolve, reject) => { reject(new RangeError()); try { throw null; } catch ({ message }) { reject(new TypeError()); } }); }`,
      "runtime.ts": `import { destructured, executor, settled } from './selected';
console.log(JSON.stringify(await Promise.all([destructured, executor, settled].map(async fn => { try { await fn(); return "returned"; } catch (error) { return error.constructor.name; } }))));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({ status: runtime.status, output: runtime.stdout }).toEqual({
        status: 0,
        output: '["TypeError","TypeError","RangeError"]\n',
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);
      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: ["destructured", "executor"].map(
            (function_name) =>
              expect.objectContaining({
                function_name,
                documented_error: "RangeError",
                reason: "unresolved",
              }),
          ),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should exclude errors after definite returns in bodies and finalizers", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when invalid */
export function body() { return; throw new RangeError(); }
/** @throws {TypeError} when finalization fails */
export function finalizer() { try { throw new RangeError(); } finally { return; throw new TypeError(); } }
/** @throws {RangeError} when invalid */
export function switchReturn() { switch (0) { default: return; throw new RangeError(); } }
/** @throws {RangeError} when invalid */
export function loopBreak() { while (true) { break; throw new RangeError(); } }
/** @throws {RangeError} when invalid */
export function labeledBreak() { exit: { break exit; throw new RangeError(); } }`,
      "runtime.ts": `import { body, finalizer, switchReturn, loopBreak, labeledBreak } from './selected';
console.log(JSON.stringify([body(), finalizer(), switchReturn(), loopBreak(), labeledBreak()].map(value => value === undefined)));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({ status: runtime.status, output: runtime.stdout }).toEqual({
        status: 0,
        output: "[true,true,true,true,true]\n",
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            "body",
            "finalizer",
            "switchReturn",
            "loopBreak",
            "labeledBreak",
          ].map((function_name) =>
            expect.objectContaining({
              function_name,
              reason: expect.stringMatching(/^(unsupported|unresolved)$/),
            }),
          ),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should distinguish async and generator executor errors from explicit outer rejection", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when rejected */
export function asyncThrow() { return new Promise<void>(async () => { throw new RangeError(); }); }
/** @throws {RangeError} when rejected */
export function generatorThrow() { return new Promise<void>(function* () { throw new RangeError(); }); }
/** @throws {RangeError} when rejected */
export function asyncReject() { return new Promise<void>(async (resolve, reject) => { reject(new RangeError()); }); }
/** @throws {RangeError} when rejected */
export function labeled() { return new Promise<void>((resolve, reject) => { exit: { break exit; reject(new RangeError()); } }); }`,
      "runtime.ts": `import { asyncThrow, generatorThrow, asyncReject, labeled } from './selected';
const detached: string[] = [];
process.on('unhandledRejection', error => detached.push(error.constructor.name));
const outcomes = ['pending', 'pending', 'pending', 'pending'];
[asyncThrow(), generatorThrow(), asyncReject(), labeled()].forEach((promise, index) => promise.then(() => { outcomes[index] = 'fulfilled'; }, error => { outcomes[index] = error.constructor.name; }));
// allow a full event-loop turn for settlement and unhandled-rejection delivery
setTimeout(() => console.log(JSON.stringify({ outcomes, detached })), 25);`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
        timeout: processTimeoutMs,
      });
      expect({
        status: runtime.status,
        output: JSON.parse(runtime.stdout),
      }).toEqual({
        status: 0,
        output: {
          outcomes: ["pending", "pending", "RangeError", "pending"],
          detached: ["RangeError"],
        },
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            "asyncThrow",
            "generatorThrow",
            "labeled",
          ].map((function_name) =>
            expect.objectContaining({
              function_name,
              reason: expect.stringMatching(/^(unsupported|unresolved)$/),
            }),
          ),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should review replacement promise finalizers while preserving benign finalization", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when rejected */
export function thrown() { return Promise.reject(new RangeError()).finally(() => { throw new TypeError(); }); }
/** @throws {RangeError} when rejected */
export function rejected() { return Promise.reject(new RangeError()).finally(() => Promise.reject(new TypeError())); }
/** @throws {RangeError} when rejected */
export function benign() { return Promise.reject(new RangeError()).finally(() => {}); }
/** @throws {TypeError} when rejected */
export function callbackError() { return Promise.reject(new RangeError()).finally(() => { throw new TypeError(); }); }`,
      "runtime.ts": `import { thrown, rejected, benign, callbackError } from './selected';
console.log(JSON.stringify(await Promise.all([thrown(), rejected(), benign(), callbackError()].map(p => p.catch(e => e.constructor.name)))));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({
        status: runtime.status,
        output: JSON.parse(runtime.stdout),
      }).toEqual({
        status: 0,
        output: ["TypeError", "TypeError", "RangeError", "TypeError"],
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            "thrown",
            "rejected",
            "callbackError",
          ].map((function_name) =>
            expect.objectContaining({
              function_name,
              reason: expect.stringMatching(/^(unsupported|unresolved)$/),
            }),
          ),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should preserve absent finalizers and review unknown or argument-bearing handlers", () => {
    const fixture = createFixture({
      "selected.ts": `declare const external: () => void;
/** @throws {RangeError} when rejected */
export function absent() { return Promise.reject(new RangeError()).finally(); }
/** @throws {RangeError} when rejected */
export function nullish() { return Promise.reject(new RangeError()).finally(null); }
/** @throws {RangeError} when rejected */
export function ordinary() { return Promise.reject(new RangeError()).finally(function () { ; function nested() {} }); }
/** @throws {RangeError} when rejected */
export function unknown() { return Promise.reject(new RangeError()).finally(external); }
/** @throws {RangeError} when rejected */
export function defaulted() { return Promise.reject(new RangeError()).finally((value = (() => { throw new TypeError(); })()) => {}); }
/** @throws {RangeError} when rejected */
export function afterAwait() { return new Promise<void>(async (resolve, reject) => { await Promise.resolve(); reject(new RangeError()); }); }`,
      "runtime.ts": `import { absent, nullish, ordinary, defaulted, afterAwait } from './selected';
console.log(JSON.stringify(await Promise.all([absent(), nullish(), ordinary(), defaulted(), afterAwait()].map(p => p.catch(e => e.constructor.name)))));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({
        status: runtime.status,
        outcomes: JSON.parse(runtime.stdout),
      }).toEqual({
        status: 0,
        outcomes: [
          "RangeError",
          "RangeError",
          "RangeError",
          "TypeError",
          "RangeError",
        ],
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            "unknown",
            "defaulted",
            "afterAwait",
          ].map((function_name) =>
            expect.objectContaining({ function_name, reason: "unresolved" }),
          ),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should report compiler option and inherited configuration failures", () => {
    const results = [
      { compilerOptions: { target: "not-a-target" } },
      { extends: "./missing-config.json" },
    ].map((configuration) => {
      const fixture = createFixture({
        "tsconfig.json": JSON.stringify(configuration),
        "selected.ts": "export const value = 1;",
      });
      try {
        const result = runAnalyzer(fixture, ["selected.ts"]);
        return { exitCode: result.exitCode, report: JSON.parse(result.stdout) };
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    });

    expect(results).toEqual([
      expect.objectContaining({
        exitCode: 1,
        report: expect.objectContaining({
          status: "failure",
          diagnostics: [
            expect.objectContaining({
              message: expect.stringContaining("target"),
            }),
          ],
        }),
      }),
      expect.objectContaining({
        exitCode: 1,
        report: expect.objectContaining({
          status: "failure",
          diagnostics: [
            expect.objectContaining({
              message: expect.stringContaining("missing-config.json"),
            }),
          ],
        }),
      }),
    ]);
  });

  it("should respect executor first settlement when later errors cannot reject", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when rejected */
export function resolvedThenThrown() { return new Promise<void>((resolve) => { resolve(); throw new RangeError(); }); }
/** @throws {RangeError} when rejected */
export function rejectedFirst() { return new Promise<void>((resolve, reject) => { reject(new RangeError()); resolve(); }); }
/** @throws {RangeError} when rejected */
export function conditional(flag: boolean) { return new Promise<void>((resolve, reject) => { if (flag) resolve(); reject(new RangeError()); }); }`,
      "runtime.ts": `import { resolvedThenThrown, rejectedFirst, conditional } from './selected';
console.log(JSON.stringify(await Promise.all([resolvedThenThrown(), rejectedFirst(), conditional(true), conditional(false)].map(p => p.then(() => 'fulfilled', e => e.constructor.name)))));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({
        status: runtime.status,
        outcomes: JSON.parse(runtime.stdout),
      }).toEqual({
        status: 0,
        outcomes: ["fulfilled", "RangeError", "fulfilled", "RangeError"],
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            expect.objectContaining({
              function_name: "resolvedThenThrown",
              reason: expect.stringMatching(/^(unsupported|unresolved)$/),
            }),
            expect.objectContaining({
              function_name: "conditional",
              reason: "unresolved",
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should preserve executor settlement when later rejects or finalizers replace throws", () => {
    const fixture = createFixture({
      "selected.ts": `/**
 * @throws {RangeError} when first rejected
 * @throws {TypeError} when later rejected
 */
export function firstWins() { return new Promise<void>((resolve, reject) => { reject(new RangeError()); reject(new TypeError()); }); }
/**
 * @throws {RangeError} when initially thrown
 * @throws {TypeError} when finally thrown
 */
export function replaced() { return new Promise<void>(() => { try { throw new RangeError(); } finally { throw new TypeError(); } }); }
/** @throws {TypeError} when finally thrown */
export function resolved() { return new Promise<void>((resolve) => { try { resolve(); } finally { throw new TypeError(); } }); }`,
      "runtime.ts": `import { firstWins, replaced, resolved } from './selected';
console.log(JSON.stringify(await Promise.all([firstWins(), replaced(), resolved()].map(p => p.then(() => 'fulfilled', e => e.constructor.name)))));`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({
        status: runtime.status,
        outcomes: JSON.parse(runtime.stdout),
      }).toEqual({
        status: 0,
        outcomes: ["RangeError", "TypeError", "fulfilled"],
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            expect.objectContaining({
              function_name: "firstWins",
              documented_error: "TypeError",
              reason: "unsupported",
            }),
            expect.objectContaining({
              function_name: "replaced",
              documented_error: "RangeError",
              reason: "unsupported",
            }),
            expect.objectContaining({
              function_name: "resolved",
              reason: "unsupported",
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should review uncertain executor control flow and ignore unreachable rejection", () => {
    const fixture = createFixture({
      "selected.ts": `declare function notify(): void;
/** @throws {RangeError} when rejected */
export function earlyReturn() { return new Promise<void>((resolve, reject) => { return; reject(new RangeError()); }); }
/** @throws {RangeError} when rejected */
export function adopted() { return new Promise<void>((resolve, reject) => { resolve(Promise.reject(new RangeError())); reject(new RangeError()); }); }
/** @throws {RangeError} when rejected */
export function logical(flag: boolean) { return new Promise<void>((resolve, reject) => { flag && resolve(); reject(new RangeError()); }); }
/** @throws {RangeError} when rejected */
export function arithmetic() { return new Promise<void>((resolve, reject) => { const value = 1 + 2; notify(); reject(new RangeError()); }); }
/** @throws {unknownSpace.InputError} when invalid */
export function unknownNamespace() { throw new RangeError(); }`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            expect.objectContaining({
              function_name: "earlyReturn",
              reason: "unsupported",
            }),
            expect.objectContaining({
              function_name: "adopted",
              reason: "unresolved",
            }),
            expect.objectContaining({
              function_name: "logical",
              reason: "unresolved",
            }),
            expect.objectContaining({
              function_name: "unknownNamespace",
              reason: "unsupported",
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should report errors replaced by an abrupt finally completion", () => {
    const fixture = createFixture({
      "selected.ts": `/**
 * @throws {RangeError} when invalid
 * @throws {TypeError} when finalization fails
 */
export function replaced() { try { throw new RangeError(); } finally { throw new TypeError(); } }
/** @throws {RangeError} when invalid */
export function conditional(flag: boolean) { try { throw new RangeError(); } finally { if (flag) throw new TypeError(); } }`,
      "runtime.ts": `import { replaced } from './selected';
try { replaced(); } catch (error) { console.log(error.constructor.name); }`,
    });
    try {
      const runtime = spawnSync("bun", [resolve(fixture, "runtime.ts")], {
        encoding: "utf8",
      });
      expect({ status: runtime.status, output: runtime.stdout }).toEqual({
        status: 0,
        output: "TypeError\n",
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            expect.objectContaining({
              function_name: "replaced",
              documented_error: "RangeError",
              reason: expect.stringMatching(/^(unsupported|unresolved)$/),
            }),
            expect.objectContaining({
              function_name: "conditional",
              reason: "unresolved",
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should compare documented error aliases by symbol after storing an instance", () => {
    const fixture = createFixture({
      "errors.ts": "export class InputError extends Error {}",
      "selected.ts": `import { InputError as ValidationError } from './errors';
import * as failures from './errors';
/** @throws {ValidationError} when invalid */
export function stored() { const error = new ValidationError(); throw error; }
/** @throws {failures.InputError} when invalid */
export function qualified() { const error = new failures.InputError(); throw error; }
/** @throws {ValidationError} when invalid */
export function unrelated() { class InputError extends Error {} throw new InputError(); }`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            expect.objectContaining({
              function_name: "unrelated",
              reason: "unsupported",
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should distinguish explicit this parameters from ordinary callable arguments", () => {
    const fixture = createFixture({
      "selected.ts": `export type Callback = (this: string, value: number) => void;
export const ordinary: (receiver: string, value: number) => void = () => {};
export const matching: (this: string, item: number) => void = () => {};`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          reuse_candidates: [
            expect.objectContaining({
              occurrences: [expect.objectContaining({ line: 3 })],
              candidates: [expect.objectContaining({ name: "Callback" })],
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should resolve nested parenthesized members and review unresolved computed keys", () => {
    const fixture = createFixture({
      "selected.ts": `export const first: { value: (string) } = null!;
export const second: { value: string } = null!;
export const unresolved: { [missing]: number } = null!;`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          extraction_proposals: [
            expect.objectContaining({
              occurrences: [expect.any(Object), expect.any(Object)],
            }),
          ],
          diagnostics: [expect.objectContaining({ kind: "review", line: 3 })],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should avoid local rejection claims for cyclic unresolved and non-Promise values", () => {
    const fixture = createFixture({
      "tsconfig.json": JSON.stringify({ compilerOptions: { noLib: true } }),
      "selected.ts": `declare const receiver: { reject(error: unknown): unknown; execute(): unknown };
/** @throws {RangeError} when rejected */
export function cyclic() { const value = value; return value; }
/** @throws {RangeError} when rejected */
export function unresolved() { return missing; }
/** @throws {RangeError} when rejected */
export function custom() { return receiver.reject(new RangeError()); }
/** @throws {RangeError} when rejected */
export function other() { return receiver.execute(); }
/** @throws {RangeError} when rejected */
export function absentPromise() { return Promise.reject(new RangeError()); }
/** @throws {RangeError} when invalid */
export function absentConstructor() { throw new MissingError(); }`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            ...["cyclic", "unresolved", "custom", "other", "absentPromise"].map(
              (function_name) =>
                expect.objectContaining({
                  function_name,
                  reason: "unsupported",
                }),
            ),
            expect.objectContaining({
              function_name: "absentConstructor",
              reason: "unresolved",
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should ignore named pipes and slash-scoped exclusions outside Git", () => {
    const fixture = createFixture({
      "selected.ts": "export const first: { value: string } = null!;",
      "nested/ignored.ts": "export const peer: { value: string } = null!;",
      ".gitignore": "nested/ignored.ts\n",
    });
    try {
      const pipe = spawnSync("mkfifo", [resolve(fixture, "stream.ts")], {
        encoding: "utf8",
      });
      expect(pipe.status, pipe.stderr).toBe(0);
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          packages: [
            expect.objectContaining({
              files: [resolve(fixture, "selected.ts")],
            }),
          ],
          extraction_proposals: [],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should discover an empty Git tree using the current directory", () => {
    const fixture = createFixture({});
    const driver = createFixture({
      "run.ts": `import { discoverPackages } from ${JSON.stringify(resolve(import.meta.dirname, "analyze-typescript/discovery.ts"))};
console.log(JSON.stringify(discoverPackages({ files: [] }, {})));`,
    });
    try {
      const initialized = spawnSync("git", ["init", fixture], {
        encoding: "utf8",
      });
      expect(initialized.status, initialized.stderr).toBe(0);
      const result = spawnSync("bun", [resolve(driver, "run.ts")], {
        cwd: fixture,
        encoding: "utf8",
      });

      expect({
        status: result.status,
        output: result.stdout,
        error: result.stderr,
      }).toEqual({ status: 0, output: "[]\n", error: "" });
    } finally {
      rmSync(fixture, { recursive: true, force: true });
      rmSync(driver, { recursive: true, force: true });
    }
  });

  it("should expose Git exclusion process failures instead of a clean report", () => {
    const fixture = createFixture({ "selected.ts": "export const value = 1;" });
    const executable = createFixture({
      git: '#!/bin/sh\nif [ "$3" = "rev-parse" ]; then exit 0; fi\necho "exclusions unavailable" >&2\nexit 2\n',
    });
    try {
      chmodSync(resolve(executable, "git"), 0o755);
      const result = spawnSync(
        process.execPath,
        [analyzer, "--repository-root", fixture, "selected.ts"],
        {
          cwd: fixture,
          encoding: "utf8",
          env: { ...process.env, PATH: executable },
        },
      );

      expect(result.status, result.stderr).toBe(1);
      expect(JSON.parse(readCliReport(result.stdout).stdout)).toEqual(
        expect.objectContaining({
          status: "failure",
          diagnostics: [
            expect.objectContaining({
              message: expect.stringContaining("exclusions unavailable"),
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
      rmSync(executable, { recursive: true, force: true });
    }
  });

  it("should report a Git executable disappearing before exclusion discovery", () => {
    const fixture = createFixture({ "selected.ts": "export const value = 1;" });
    const executable = createFixture({
      git: '#!/bin/sh\n/bin/rm -- "$0"\nexit 0\n',
    });
    try {
      chmodSync(resolve(executable, "git"), 0o755);
      const result = spawnSync(
        process.execPath,
        [analyzer, "--repository-root", fixture, "selected.ts"],
        {
          cwd: fixture,
          encoding: "utf8",
          env: { ...process.env, PATH: executable },
        },
      );

      expect(result.status, result.stderr).toBe(1);
      expect(JSON.parse(readCliReport(result.stdout).stdout)).toEqual(
        expect.objectContaining({
          status: "failure",
          diagnostics: [
            expect.objectContaining({
              message: expect.stringMatching(
                /unable to resolve Git exclusions: (?:.*ENOENT|Executable not found in \$PATH: "git")/,
              ),
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
      rmSync(executable, { recursive: true, force: true });
    }
  });

  it("should report parser process exits and launch failures without stderr", () => {
    const fixture = createFixture({ "selected.ts": "export const value = 1;" });
    const driver = createFixture({
      exit: "#!/bin/sh\nexit 7\n",
      signal: "#!/bin/sh\nkill -TERM $$\n",
      "run.ts": `import { analyze } from ${JSON.stringify(analyzer)};
Object.defineProperty(process, "execPath", { value: process.argv[2] });
console.log(JSON.stringify(await analyze({ repositoryRoot: process.argv[3], files: ["selected.ts"] })));`,
    });
    try {
      chmodSync(resolve(driver, "exit"), 0o755);
      chmodSync(resolve(driver, "signal"), 0o755);
      const results = ["exit", "missing", "signal"].map((executable) => {
        const result = spawnSync(
          process.execPath,
          [resolve(driver, "run.ts"), resolve(driver, executable), fixture],
          { encoding: "utf8" },
        );
        expect(result.status, result.stderr).toBe(0);
        return JSON.parse(result.stdout);
      });

      expect(results).toEqual([
        expect.objectContaining({
          status: "failure",
          diagnostics: [
            expect.objectContaining({
              message: "TypeScript parser failed: exit 7",
            }),
          ],
        }),
        expect.objectContaining({
          status: "failure",
          diagnostics: [
            expect.objectContaining({
              message: expect.stringMatching(
                /TypeScript parser failed: .*ENOENT/,
              ),
            }),
          ],
        }),
        expect.objectContaining({
          status: "failure",
          diagnostics: [
            expect.objectContaining({
              message: "TypeScript parser failed: exit null",
            }),
          ],
        }),
      ]);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
      rmSync(driver, { recursive: true, force: true });
    }
  });

  it("should support importing the package parser for embedded analysis", () => {
    const fixture = createFixture({ "selected.ts": "export const value = 1;" });
    const driver = createFixture({
      "run.ts": `import { analyzePackage } from ${JSON.stringify(resolve(import.meta.dirname, "analyze-typescript/parser.ts"))};
console.log(JSON.stringify(analyzePackage(${JSON.stringify({ root: fixture, repository_root: fixture, files: [resolve(fixture, "selected.ts")], selected_files: [resolve(fixture, "selected.ts")] })})));`,
    });
    try {
      const result = spawnSync(
        "bun",
        ["--install=force", resolve(driver, "run.ts")],
        { encoding: "utf8", timeout: processTimeoutMs },
      );

      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual({
        reuse_candidates: [],
        extraction_proposals: [],
        error_documentation_candidates: [],
        diagnostics: [],
      });
    } finally {
      rmSync(fixture, { recursive: true, force: true });
      rmSync(driver, { recursive: true, force: true });
    }
  });

  it("should identify documented constructor property and anonymous callback owners", () => {
    const fixture = createFixture({
      "selected.ts": `export class Operation {
  /** @throws {RangeError} when invalid */
  constructor() {}
}
export const actions = {
  /** @throws {RangeError} when invalid */
  run: function () {},
};
declare function consume(callback: () => void): void;
consume(/** @throws {RangeError} when invalid */ () => {});`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            expect.objectContaining({
              function_name: "constructor",
              reason: "unsupported",
            }),
            expect.objectContaining({
              function_name: "run",
              reason: "unsupported",
            }),
            expect.objectContaining({
              function_name: "anonymous",
              reason: "unsupported",
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should preserve type-query identity through parenthesized annotations", () => {
    const fixture = createFixture({
      "selected.ts": `export const value = { id: 'item' };
export const first: ({ value: typeof value }) = null!;
export const second: { value: typeof value } = null!;`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          extraction_proposals: [
            expect.objectContaining({
              occurrences: [expect.any(Object), expect.any(Object)],
            }),
          ],
          diagnostics: [],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should retain dynamic-scope type identities for review without inventing shared contracts", () => {
    const fixture = createFixture({
      "selected.ts": `declare const container: object;
with (container) {
  interface Shape<T> { value: T }
  type Mapper<U> = (input: U) => U;
  const first: { value: string } = { value: '' };
  const second: { value: string } = { value: '' };
  const uncertain: { value: Shape<string> } = null!;
}`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          reuse_candidates: [],
          diagnostics: expect.arrayContaining([
            expect.objectContaining({
              kind: "review",
              file: resolve(fixture, "selected.ts"),
            }),
          ]),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should show CLI help and use the working directory while rejecting missing roots and escaped files", async () => {
    const fixture = createFixture({
      "selected.ts": "export const value = 1;",
      "nested/.keep": "",
    });
    try {
      const help = spawnSync("bun", [analyzer, "--help"], {
        cwd: fixture,
        encoding: "utf8",
      });
      const defaultRoot = spawnSync(
        "bun",
        ["run", analyzer, "--", "selected.ts"],
        { cwd: fixture, encoding: "utf8" },
      );
      expect(defaultRoot.status, defaultRoot.stderr).toBe(0);
      const errors: string[] = [];
      const missingRoot = await run(
        ["--repository-root", resolve(fixture, "missing"), "--", "selected.ts"],
        {
          stderr: (text) => {
            errors.push(text);
          },
        },
      );
      const escaped = await analyze({
        files: [resolve(fixture, "selected.ts")],
        repositoryRoot: resolve(fixture, "nested"),
      });

      expect({
        help: {
          status: help.status,
          output: readCliReport(help.stdout).stdout,
        },
        defaultRoot: {
          status: defaultRoot.status,
          report: JSON.parse(readCliReport(defaultRoot.stdout).stdout),
        },
        missingRoot,
        errors,
        escaped,
      }).toEqual({
        help: {
          status: 0,
          output: expect.stringMatching(/^usage: analyze-typescript\.ts/),
        },
        defaultRoot: {
          status: 0,
          report: expect.objectContaining({
            status: "complete",
            packages: [
              expect.objectContaining({ root: realpathSync(fixture) }),
            ],
          }),
        },
        missingRoot: 2,
        errors: [expect.stringContaining("repository root does not exist")],
        escaped: expect.objectContaining({
          status: "failure",
          diagnostics: [
            expect.objectContaining({
              message: expect.stringContaining("escapes repository"),
            }),
          ],
        }),
      });
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should preserve wrapped local rejections through omitted promise handlers", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when rejected */
export function caught(): Promise<never> { return (Promise.reject(new RangeError()) as Promise<never>).catch(); }
/** @throws {RangeError} when rejected */
export function chained(): Promise<never> { return Promise.reject(new RangeError()).then(); }
/** @throws {RangeError} when rejected */
export async function awaited(): Promise<never> { return await (Promise.reject(new RangeError())!); }`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [],
          diagnostics: [],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should accept imported constructor aliases and keep union error identities advisory", () => {
    const fixture = createFixture({
      "errors.ts": "export class InputError extends Error {}",
      "selected.ts": `import { InputError as ValidationError } from './errors';
/** @throws {ValidationError} when invalid */
export function alias(): never { throw new ValidationError(); }
/** @throws {RangeError|TypeError} when invalid */
export function union(error: RangeError | TypeError): never { throw error; }`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: ["RangeError|TypeError"].map(
            (documented_error) =>
              expect.objectContaining({
                function_name: "union",
                documented_error,
                reason: "unresolved",
              }),
          ),
          diagnostics: [],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should reject unreadable malformed and invalid profiles through CLI and embedding entrypoints", async () => {
    const fixture = createFixture({
      "selected.ts": "export const value = 1;",
      "malformed.json": "{",
      "invalid.json": "[]",
    });
    try {
      const cases = ["missing.json", "malformed.json", "invalid.json"];
      const results = await Promise.all(
        cases.map(async (profile) => {
          const stdout: string[] = [];
          const stderr: string[] = [];
          const exitCode = await run(
            [
              "--repository-root",
              fixture,
              "--profile",
              resolve(fixture, profile),
              "--",
              "selected.ts",
            ],
            {
              stdout: (text) => {
                stdout.push(text);
              },
              stderr: (text) => {
                stderr.push(text);
              },
            },
          );
          const report = await analyze({
            files: ["selected.ts"],
            repositoryRoot: fixture,
            profilePath: resolve(fixture, profile),
          });
          return {
            exitCode,
            stdout: stdout.join(""),
            stderr: stderr.join(""),
            report,
          };
        }),
      );

      expect(results).toEqual(
        cases.map(() =>
          expect.objectContaining({
            exitCode: 2,
            stdout: "",
            stderr: expect.stringMatching(/\S/),
            report: expect.objectContaining({
              status: "failure",
              diagnostics: [expect.objectContaining({ kind: "failure" })],
            }),
          }),
        ),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should interpret unbraced and unspecified error tags without inventing implementation evidence", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws RangeError when rejected */
export const direct = () => Promise.reject(new RangeError());
/** @exception when invalid */
export function unspecified(): never { throw new RangeError(); }
/** @rejects when rejected */
export function unknown(): Promise<never> { return Promise.reject(); }
/** @throws {RangeError} when invalid */
export declare function external(): void;
/** @throws when invalid */
export function empty(): void {}`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            expect.objectContaining({
              function_name: "unknown",
              documented_error: "unspecified",
              reason: "unresolved",
            }),
            expect.objectContaining({
              function_name: "external",
              documented_error: "RangeError",
              reason: "unresolved",
            }),
            expect.objectContaining({
              function_name: "empty",
              documented_error: "unspecified",
              reason: "unsupported",
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should reject incomplete option values before attempting analysis", async () => {
    const results = await Promise.all(
      [["--profile"], ["--profile="], ["--profile", "--help"]].map(
        async (arguments_) => {
          const stdout: string[] = [];
          const stderr: string[] = [];
          const exitCode = await run(
            arguments_,
            {
              stdout: (text) => {
                stdout.push(text);
              },
              stderr: (text) => {
                stderr.push(text);
              },
            },
            {
              loadParser: async () => {
                throw new Error("analysis must not start");
              },
            },
          );
          return { exitCode, stdout: stdout.join(""), stderr: stderr.join("") };
        },
      ),
    );

    expect(results).toEqual([
      { exitCode: 2, stdout: "", stderr: "--profile requires a value\n" },
      { exitCode: 2, stdout: "", stderr: "--profile= requires a value\n" },
      { exitCode: 2, stdout: "", stderr: "--profile requires a value\n" },
    ]);
  });

  it("should resolve nested generic references and retain unknown arguments for review", () => {
    const fixture = createFixture({
      "selected.ts": `export interface Item { id: string }
export const first: { values: Array<Item> } = null!;
export const second: { values: Array<Item> } = null!;
export const unknown: { values: Array<Missing> } = null!;`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          extraction_proposals: [
            expect.objectContaining({
              occurrences: [
                expect.objectContaining({ text: "{ values: Array<Item> }" }),
                expect.objectContaining({ text: "{ values: Array<Item> }" }),
              ],
            }),
          ],
          diagnostics: [
            expect.objectContaining({
              kind: "review",
              file: resolve(fixture, "selected.ts"),
              line: 4,
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should distinguish executor throws from caught and unknown rejections", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when rejected */
export function thrown(): Promise<void> { return new Promise(() => { throw new RangeError(); }); }
/** @throws {RangeError} when rejected */
export function caught(): Promise<void> { return new Promise(() => { try { throw new RangeError(); } catch {} }); }
/** @throws {RangeError} when rejected */
export function rejected(): Promise<void> { return new Promise((resolve, reject) => { try { resolve(); } finally { reject(new RangeError()); } }); }
/** @throws {RangeError} when rejected */
export function unknown(): Promise<void> { return new Promise((resolve, reject) => { reject(); }); }
/** @throws {RangeError} when rejected */
export function nested(): Promise<void> { return new Promise(() => { const callback = () => { throw new RangeError(); }; }); }
declare const executor: (resolve: (value: void) => void) => void;
/** @throws {RangeError} when rejected */
export function external(): Promise<void> { return new Promise(executor); }`,
    });
    try {
      const runtimePath = resolve(fixture, "runtime.ts");
      writeFileSync(
        runtimePath,
        "import { rejected } from './selected'; console.log(await rejected().then(() => 'fulfilled', () => 'rejected'));\n",
      );
      const runtime = spawnSync("bun", [runtimePath], { encoding: "utf8" });
      expect({ status: runtime.status, output: runtime.stdout }).toEqual({
        status: 0,
        output: "fulfilled\n",
      });
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            expect.objectContaining({
              function_name: "caught",
              reason: "unsupported",
            }),
            expect.objectContaining({
              function_name: "rejected",
              reason: expect.stringMatching(/^(unsupported|unresolved)$/),
            }),
            expect.objectContaining({
              function_name: "unknown",
              reason: "unresolved",
            }),
            expect.objectContaining({
              function_name: "nested",
              reason: "unsupported",
            }),
            expect.objectContaining({
              function_name: "external",
              reason: "unresolved",
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should report compiler configuration failure instead of a clean scan", () => {
    const fixture = createFixture({
      "tsconfig.json": "{ invalid JSON",
      "selected.ts": "export const value = 1;",
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "failure",
          diagnostics: [
            expect.objectContaining({
              kind: "failure",
              message: expect.stringContaining("TypeScript parser failed"),
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should require consistent generic bindings and honor constraints and defaults", () => {
    const fixture = createFixture({
      "selected.ts": `export type Pair<T extends string> = { left: T; right: T };
export type Defaulted<T = string> = { ready: boolean };
export type Unbound<T> = { ready: boolean };
export const matched: { left: string; right: string } = null!;
export const inconsistent: { left: string; right: number } = null!;
export const constrained: { left: number; right: number } = null!;
export const defaulted: { ready: boolean } = null!;`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          reuse_candidates: [
            expect.objectContaining({
              candidates: [
                expect.objectContaining({
                  name: "Pair",
                  type_arguments: ["string"],
                }),
              ],
            }),
            expect.objectContaining({
              candidates: [
                expect.objectContaining({
                  name: "Defaulted",
                  type_arguments: ["string"],
                }),
              ],
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should distinguish awaited catches and conditional finalizer rejection paths", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when rejected */
export async function consumed(): Promise<void> { try { await Promise.reject(new RangeError()); } catch {} }
/** @throws {RangeError} when rejected */
export async function returned(): Promise<void> { try { return await Promise.reject(new RangeError()); } catch {} }
/** @throws {RangeError} when rejected */
export async function escaping(): Promise<void> { try { await Promise.reject(new RangeError()); } finally { console.log('cleanup'); } }
/** @throws {RangeError} when rejected */
export function conditional(flag: boolean): Promise<never> { return flag ? Promise.reject(new RangeError()).finally(() => {}) : Promise.reject(new RangeError()); }
/** @throws {RangeError} when rejected */
export function overridden(): void { try { throw new RangeError(); } finally { const nested = () => { return; }; return; } }`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          error_documentation_candidates: [
            expect.objectContaining({
              function_name: "consumed",
              reason: "unsupported",
            }),
            expect.objectContaining({
              function_name: "returned",
              reason: "unsupported",
            }),
            expect.objectContaining({
              function_name: "conditional",
              reason: "unresolved",
            }),
            expect.objectContaining({
              function_name: "overridden",
              reason: "unsupported",
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should respect Git ignore negation when counting package peers", () => {
    const declaration = "export const item: { value: string } = null!;";
    const fixture = createFixture({
      ".gitignore": "*.ts\n!selected.ts\n!retained.ts\n",
      "selected.ts": declaration,
      "retained.ts": declaration,
      "ignored.ts": declaration,
    });
    try {
      const initialized = spawnSync("git", ["init", "--quiet", fixture], {
        encoding: "utf8",
      });
      expect(initialized.status, initialized.stderr).toBe(0);

      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          extraction_proposals: [
            expect.objectContaining({
              occurrences: [
                expect.objectContaining({
                  file: resolve(fixture, "retained.ts"),
                }),
                expect.objectContaining({
                  file: resolve(fixture, "selected.ts"),
                }),
              ],
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should preserve rejection evidence when handlers are nullable unions", () => {
    const fixture = createFixture({
      "tsconfig.json": JSON.stringify({
        compilerOptions: { strictNullChecks: true },
      }),
      "selected.ts": `/** @throws {RangeError} when rejected */
export function caught(handler: null | undefined): Promise<never> { return Promise.reject(new RangeError()).catch(handler); }
/** @throws {RangeError} when rejected */
export function chained(handler: null | undefined): Promise<void> { return Promise.reject(new RangeError()).then(() => {}, handler); }`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({ error_documentation_candidates: [] }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should match the complete merged interface rather than one declaration fragment", () => {
    const fixture = createFixture({
      "selected.ts":
        "export interface Shared { value: string }; export interface Shared { extra: number }; export const partial: { value: string } = null!; export const complete: { value: string; extra: number } = null!;",
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          reuse_candidates: [
            expect.objectContaining({
              occurrences: [
                expect.objectContaining({
                  text: "{ value: string; extra: number }",
                }),
              ],
              candidates: [expect.objectContaining({ name: "Shared" })],
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should distinguish unique symbols used as computed property names", () => {
    const fixture = createFixture({
      "selected.ts":
        "const key: unique symbol = Symbol(); export const item: { [key]: string } = null!;",
      "peer.ts":
        "const key: unique symbol = Symbol(); export const item: { [key]: string } = null!;",
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({ extraction_proposals: [] }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should preserve local rejection evidence with absent catch and then handlers", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {RangeError} when rejected */
export function caught(): Promise<never> { return Promise.reject(new RangeError()).catch(undefined); }
/** @throws {RangeError} when rejected */
export function chained(): Promise<void> { return Promise.reject(new RangeError()).then(() => {}, undefined); }`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({ error_documentation_candidates: [] }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should analyze deeply nested object types within the normal process budget", () => {
    const nested = Array.from({ length: 24 }).reduce<string>(
      (value) => `{ nested: ${value} }`,
      "string",
    );
    const fixture = createFixture({
      "selected.ts": `export const first: ${nested} = null!; export const second: ${nested} = null!;`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          extraction_proposals: expect.arrayContaining([expect.any(Object)]),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should flush a large JSON report before the CLI exits", () => {
    const imports = Array.from(
      { length: 6000 },
      (_, index) =>
        `import { value as value${index} } from './missing${index}';`,
    ).join("\n");
    const fixture = createFixture({ "selected.ts": imports });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout).diagnostics).toHaveLength(6000);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should report an unresolved dependency used only as a callee", () => {
    const fixture = createFixture({
      "selected.ts":
        "import { call } from './missing'; export function caller(): void { call(); }",
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          diagnostics: expect.arrayContaining([
            expect.objectContaining({
              kind: "review",
              file: resolve(fixture, "selected.ts"),
            }),
          ]),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should reject error documentation borrowed from a promise created outside the function", () => {
    const fixture = createFixture({
      "promise.ts": "export const imported = Promise.reject(new RangeError());",
      "selected.ts": `import { imported } from './promise';
const modulePromise = Promise.reject(new RangeError());
/** @throws {RangeError} when rejected */
export function moduleHeld(): Promise<never> { return modulePromise; }
/** @throws {RangeError} when rejected */
export function locallyHeld(): Promise<never> { const localPromise = Promise.reject(new RangeError()); return localPromise; }
/** @throws {RangeError} when rejected */
export function importedHeld(): Promise<never> { return imported; }
export function factory() {
  const closurePromise = Promise.reject(new RangeError());
  /** @throws {RangeError} when rejected */
  function closureHeld(): Promise<never> { return closurePromise; }
  return closureHeld;
}`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          error_documentation_candidates: [
            expect.objectContaining({
              function_name: "moduleHeld",
              reason: "unsupported",
            }),
            expect.objectContaining({
              function_name: "importedHeld",
              reason: "unsupported",
            }),
            expect.objectContaining({
              function_name: "closureHeld",
              reason: "unsupported",
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should resolve configured import paths to a shared symbol", () => {
    const fixture = createFixture({
      "tsconfig.json": JSON.stringify({
        compilerOptions: {
          baseUrl: ".",
          paths: { "@contract": ["contract.ts"] },
        },
      }),
      "contract.ts": "export interface Item { id: string }",
      "selected.ts":
        "import type { Item } from '@contract'; export const first: { value: Item } = null!;",
      "peer.ts":
        "import type { Item } from './contract'; export const second: { value: Item } = null!;",
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          extraction_proposals: [expect.any(Object)],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should match renamed generic parameters declared inside an object", () => {
    const fixture = createFixture({
      "selected.ts":
        "export const first: { map: <T>(value: T) => T } = null!; export const second: { map: <U>(value: U) => U } = null!;",
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          extraction_proposals: [expect.any(Object)],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should report unresolved imported type identities without grouping them", () => {
    const fixture = createFixture({
      "selected.ts":
        "import type { Item } from './missing'; export const first: { value: Item } = null!; export const second: { value: Item } = null!;",
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          extraction_proposals: [],
          reuse_candidates: [],
          diagnostics: expect.arrayContaining([
            expect.objectContaining({
              kind: "review",
              file: resolve(fixture, "selected.ts"),
            }),
          ]),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should count source containing a generated marker inside a string", () => {
    const fixture = createFixture({
      "selected.ts": "export const item: { value: string } = { value: '' };",
      "peer.ts":
        "export const marker = '@generated'; export const item: { value: string } = { value: '' };",
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          extraction_proposals: [expect.any(Object)],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should accept equals-form repository and profile options", async () => {
    const fixture = createFixture({
      "selected.ts": "export const value = 1;",
      "profile.json": "{}",
    });
    try {
      const output: string[] = [];
      const exitCode = await run(
        [
          `--repository-root=${fixture}`,
          `--profile=${resolve(fixture, "profile.json")}`,
          "--",
          resolve(fixture, "selected.ts"),
        ],
        {
          stdout: (text) => {
            output.push(text);
          },
          stderr: (text) => {
            output.push(text);
          },
        },
      );

      expect(exitCode, output.join("")).toBe(0);
      expect(JSON.parse(output.join(""))).toEqual(
        expect.objectContaining({ status: "complete" }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should reject an unknown option before analysis", () => {
    const fixture = createFixture({ "selected.ts": "export const value = 1;" });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"], ["--unknown"]);

      expect(result.exitCode).toBe(2);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should reject a relative profile path", () => {
    const fixture = createFixture({
      "selected.ts": "export const value = 1;",
      "profile.json": "{}",
    });
    try {
      const result = runAnalyzer(
        fixture,
        ["selected.ts"],
        ["--profile", "profile.json"],
      );

      expect(result.exitCode).toBe(2);
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should discover a second package occurrence outside selected files", () => {
    const fixture = createFixture({
      "selected.ts": "export const first: { value: string } = { value: '' };",
      "other.ts":
        "export const second: { /* detail */ value : string } = { value: '' };",
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          extraction_proposals: [
            expect.objectContaining({
              package_root: fixture,
              occurrences: expect.arrayContaining([
                expect.objectContaining({
                  file: resolve(fixture, "selected.ts"),
                  selected: true,
                }),
                expect.objectContaining({
                  file: resolve(fixture, "other.ts"),
                  selected: false,
                }),
              ]),
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should omit singleton objects and repetition unrelated to selected scope", () => {
    const fixture = createFixture({
      "selected.ts": "export const first: { value: string } = { value: '' };",
      "other.ts":
        "export const second: { count: number } = { count: 0 }; export const third: { count: number } = { count: 1 };",
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          extraction_proposals: [],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should keep identical objects in nested packages separate", () => {
    const fixture = createFixture({
      "package.json": '{"name":"root"}',
      "selected.ts": "export const first: { value: string } = { value: '' };",
      "nested/package.json": '{"name":"nested"}',
      "nested/other.ts":
        "export const second: { value: string } = { value: '' };",
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts", "nested/other.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          extraction_proposals: [],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should distinguish modifiers and independently bound symbols", () => {
    const fixture = createFixture({
      "first.ts":
        "export interface Item { id: string }; export const first: { value: Item } = null!; export const optional: { value?: string } = {};",
      "second.ts":
        "export interface Item { id: string }; export const second: { value: Item } = null!; export const required: { value: string } = { value: '' }; export const immutable: { readonly value: string } = { value: '' };",
    });
    try {
      const result = runAnalyzer(fixture, ["first.ts", "second.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          extraction_proposals: [],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should suggest an existing generic callback contract for one inline use", () => {
    const fixture = createFixture({
      "selected.ts":
        "export type Predicate<T> = (value: T) => boolean; export interface Item { id: string }; export function select(check: (value: Item) => boolean): void {}",
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          reuse_candidates: [
            expect.objectContaining({
              candidates: [
                expect.objectContaining({
                  name: "Predicate",
                  type_arguments: ["Item"],
                }),
              ],
            }),
          ],
          extraction_proposals: [],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should exclude ignored generated vendor and dependency occurrences", () => {
    const declaration = "export const item: { value: string } = { value: '' };";
    const fixture = createFixture({
      ".gitignore": "ignored/\n",
      "selected.ts": declaration,
      "ignored/other.ts": declaration,
      "vendor/other.ts": declaration,
      "node_modules/other.ts": declaration,
      "other.generated.ts": declaration,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          extraction_proposals: [],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should flag propagated errors without borrowing a nested callback throw", () => {
    const fixture = createFixture({
      "selected.ts": `declare function dependency(): void;
/** @throws {TypeError} when dependency fails */
export function propagated(): void { dependency(); }
/** @throws {RangeError} when callback fails */
export function callback(): void { [1].map(() => { throw new RangeError(); }); }`,
      "other.ts":
        "/** @throws {Error} when it fails */ export function unrelated(): void {}",
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          error_documentation_candidates: [
            expect.objectContaining({
              function_name: "propagated",
              documented_error: "TypeError",
              reason: "unsupported",
            }),
            expect.objectContaining({
              function_name: "callback",
              documented_error: "RangeError",
              reason: "unsupported",
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should accept direct throws and locally created promise rejections", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {TypeError} when invalid */
export function direct(): never { throw new TypeError(); }
/** @throws {RangeError} when invalid */
export function rejected(): Promise<never> { return Promise.reject(new RangeError()); }
/** @throws {SyntaxError} when invalid */
export function executor(): Promise<void> { return new Promise((resolve, reject) => { reject(new SyntaxError()); }); }`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          error_documentation_candidates: [],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should fail explicitly when selected TypeScript cannot be parsed", () => {
    const fixture = createFixture({
      "selected.ts": "export const item: { value: = ;",
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(1);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "failure",
          diagnostics: expect.arrayContaining([expect.any(Object)]),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should apply profile eligibility and exclusions throughout the package", () => {
    const declaration = "export const item: { value: string } = { value: '' };";
    const fixture = createFixture({
      "selected.ts": declaration,
      "other.tsx": declaration,
      "excluded/other.ts": declaration,
      "profile.json": JSON.stringify({
        eligibility: { extensions: [".ts"] },
        exclusions: ["**/excluded/**"],
      }),
    });
    try {
      const result = runAnalyzer(
        fixture,
        ["selected.ts"],
        ["--profile", resolve(fixture, "profile.json")],
      );

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          extraction_proposals: [],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should flag caught local errors and detached rejections as unsupported documentation", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {TypeError} when invalid */
export function caught(): void { try { throw new TypeError(); } catch {} }
/** @throws {RangeError} when invalid */
export function detached(): void { Promise.reject(new RangeError()); }
/** @throws {SyntaxError} when invalid */
export function consumed(): Promise<void> { return Promise.reject(new SyntaxError()).catch(() => {}); }`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          error_documentation_candidates: [
            expect.any(Object),
            expect.any(Object),
            expect.any(Object),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should retain only the unsupported error from mixed documentation", () => {
    const fixture = createFixture({
      "selected.ts": `declare function dependency(): void;
/**
 * @throws {TypeError} when invalid
 * @throws {RangeError} when dependency fails
 */
export function mixed(): void { dependency(); throw new TypeError(); }`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          error_documentation_candidates: [
            expect.objectContaining({
              function_name: "mixed",
              documented_error: "RangeError",
              reason: expect.stringMatching(/^(unsupported|unresolved)$/),
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should distinguish reordered members and outer generic bindings", () => {
    const fixture = createFixture({
      "selected.ts": `export function first<T>(item: { value: T }): void {}
export function second<T>(item: { value: T }): void {}
export const ordered: { first: string; second: number } = null!;
export const reversed: { second: number; first: string } = null!;`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          extraction_proposals: [],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should reject missing selected files instead of reporting a clean scan", () => {
    const fixture = createFixture({});
    try {
      const result = runAnalyzer(fixture, ["missing.ts"]);

      expect(result.exitCode, result.stderr).toBe(1);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "failure",
          diagnostics: expect.arrayContaining([expect.any(Object)]),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should reuse a named interface without counting its declaration as an inline occurrence", () => {
    const fixture = createFixture({
      "contract.ts": "export interface Entry { value: string }",
      "selected.ts": "export const item: { value: string } = { value: '' };",
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          extraction_proposals: [],
          reuse_candidates: [
            expect.objectContaining({
              candidates: [expect.objectContaining({ name: "Entry" })],
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should group imported aliases referring to the same underlying symbol", () => {
    const fixture = createFixture({
      "contract.ts": "export interface Item { id: string }",
      "first.ts":
        "import type { Item } from './contract'; export const first: { value: Item } = null!;",
      "second.ts":
        "import type { Item as Renamed } from './contract'; export const second: { value: Renamed } = null!;",
    });
    try {
      const result = runAnalyzer(fixture, ["first.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          extraction_proposals: [expect.any(Object)],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should fail for a malformed eligible peer outside selected scope", () => {
    const fixture = createFixture({
      "selected.ts": "export const value = 1;",
      "peer.ts": "export const value: { = ;",
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(1);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "failure",
          diagnostics: expect.arrayContaining([expect.any(Object)]),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should ignore malformed excluded peers", () => {
    const fixture = createFixture({
      "selected.ts": "export const value = 1;",
      "peer.generated.ts": "export const value: { = ;",
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({ status: "complete", diagnostics: [] }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should report guarded rethrows and dynamic throw identities for review", () => {
    const fixture = createFixture({
      "selected.ts": `/** @throws {TypeError} when invalid */
export function rethrow(): void { try { throw new TypeError(); } catch (error) { if (error instanceof TypeError) throw error; } }
/** @throws {RangeError} when invalid */
export function dynamic(error: unknown): never { throw error; }`,
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          error_documentation_candidates: [
            expect.objectContaining({
              function_name: "rethrow",
              documented_error: "TypeError",
              reason: "unresolved",
            }),
            expect.objectContaining({
              function_name: "dynamic",
              documented_error: "RangeError",
              reason: "unresolved",
            }),
          ],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should produce deterministic reports without modifying source or installing local dependencies", () => {
    const source =
      "export const first: { value: string } = { value: '' }; export const second: { value: string } = { value: '' };";
    const fixture = createFixture({ "selected.ts": source });
    try {
      const first = runAnalyzer(fixture, ["selected.ts"]);
      const second = runAnalyzer(fixture, ["selected.ts"]);

      expect(first.exitCode, first.stderr).toBe(0);
      expect(second).toEqual(first);
      expect({
        files: readdirSync(fixture),
        source: readFileSync(resolve(fixture, "selected.ts"), "utf8"),
      }).toEqual({
        files: ["selected.ts"],
        source,
      });
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should analyze a target with existing node_modules without installing into it", () => {
    const fixture = createFixture({
      "selected.ts":
        "export const first: { id: number } = { id: 1 }; export const second: { id: number } = { id: 2 };",
      "node_modules/.keep": "existing contents",
    });
    try {
      const result = runAnalyzer(fixture, ["selected.ts"]);

      expect(result.exitCode, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(
        expect.objectContaining({
          status: "complete",
          extraction_proposals: [expect.any(Object)],
        }),
      );
      expect({
        root: readdirSync(fixture).sort(),
        dependencies: readdirSync(resolve(fixture, "node_modules")),
      }).toEqual({
        root: ["node_modules", "selected.ts"],
        dependencies: [".keep"],
      });
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});

describe("fn:analyze", () => {
  it("should expose package analysis to embedding callers", async () => {
    const fixture = createFixture({
      "selected.ts":
        "export const first: { id: number } = { id: 1 }; export const second: { id: number } = { id: 2 };",
    });
    try {
      const output: string[] = [];
      const exitCode = await run(
        ["--repository-root", fixture, "--", resolve(fixture, "selected.ts")],
        {
          stdout: (text) => {
            output.push(text);
          },
        },
      );

      expect(exitCode, output.join("")).toBe(0);
      expect(JSON.parse(output.join(""))).toEqual(
        expect.objectContaining({
          status: "complete",
          extraction_proposals: [expect.any(Object)],
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should complete non-TypeScript scope without loading the parser", async () => {
    const fixture = createFixture({ "selected.py": "value = 1" });
    try {
      const report = await analyze(
        { files: [resolve(fixture, "selected.py")], repositoryRoot: fixture },
        {
          loadParser: async () => {
            throw new Error("parser must remain unloaded");
          },
        },
      );

      expect(report).toEqual({
        status: "complete",
        packages: [],
        reuse_candidates: [],
        extraction_proposals: [],
        error_documentation_candidates: [],
        diagnostics: [],
      });
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });

  it("should report parser loading failure without claiming clean analysis", async () => {
    const fixture = createFixture({ "selected.ts": "export const value = 1;" });
    try {
      const report = await analyze(
        { files: [resolve(fixture, "selected.ts")], repositoryRoot: fixture },
        {
          loadParser: async () => {
            throw new Error("registry unavailable");
          },
        },
      );

      expect(report).toEqual(
        expect.objectContaining({
          status: "failure",
          diagnostics: expect.arrayContaining([
            expect.objectContaining({
              message: expect.stringContaining("registry unavailable"),
            }),
          ]),
        }),
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});

function createFixture(files: Readonly<Record<string, string>>): string {
  const root = mkdtempSync(resolve(tmpdir(), "typescript-analysis-"));
  for (const [name, content] of Object.entries(files)) {
    const path = resolve(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  }
  return root;
}

function runAnalyzer(
  root: string,
  files: readonly string[],
  options: readonly string[] = [],
): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync(
    "bun",
    [analyzer, "--repository-root", root, ...options, "--", ...files],
    {
      cwd: root,
      encoding: "utf8",
      timeout: processTimeoutMs,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  const report = readCliReport(result.stdout);
  return {
    exitCode: result.status ?? 1,
    stdout: report.stdout,
    stderr: report.stderr || (result.status === 0 ? "" : report.stdout),
  };
}

function readCliReport(output: string): { stdout: string; stderr: string } {
  const summary = JSON.parse(output);
  expect(Buffer.byteLength(output)).toBeLessThanOrEqual(4096);
  const report = JSON.parse(readFileSync(summary.full_output, "utf8"));
  rmSync(dirname(summary.full_output), { recursive: true, force: true });
  return report;
}
