# Three-Agent Parallel Analysis Architecture

`find-unused` decomposes its workload into three independent agents launched in parallel via the Task tool. Each agent owns a distinct detection domain so the analysis scales on large codebases and findings can be merged at the end.

## Decomposition

1. **Commented Code Agent** — pattern-based scan of source files.
2. **Unused Symbol Detector (Hierarchical LSP-Based)** — file-level reachability, then symbol-level analysis on reachable files, then test-helper analysis.
3. **Test-Only Production Code Detector** — production symbols whose every reference lives in a test file.

All three agents work independently and report findings to the parent, which merges, deduplicates, and prioritises.

---

## Agent 1: Commented Code Finder

Non-goal: this agent is read-only. Report candidates with `file:line` evidence; never delete, edit, or refactor what you find — `coding:lint` owns confirmed removal.

Search for common comment patterns:

- Single-line: `//` followed by code patterns
- Multi-line: `/* ... */` containing code
- JSX comments: `{/* ... */}`

Identify patterns that look like code (not documentation):

- Commented function declarations
- Commented imports
- Commented class definitions
- Commented variable declarations

Distinguish from JSDoc, license headers, and intentional code examples.

---

## Agent 2: Unused Symbol Detector (Hierarchical LSP-Based)

Non-goal: this agent is read-only. Report candidates with `file:line` evidence; never delete, edit, or refactor what you find — `coding:lint` owns confirmed removal.

### Phase 1: File-Level Analysis (Unreachable Production Files)

1. Parse `package.json` exports (including subpath exports like `"./utils"`):
   - Main entry: `"main"`, `"module"`, `"exports"`
   - Subpath exports: `"./foo"`, `"./bar/*"`
2. Use `workspaceSymbol` to find all exported entry points.
3. Build a file reachability graph from exports:
   - Start from exported files as roots
   - Trace imports to find all reachable production files
   - Use `findReferences` on each file's exports to trace importers
4. Identify UNREACHABLE files:
   - Production files NOT imported by any reachable file
   - These entire files are potentially dead code
   - Report under: "Unreachable Production Files"

### Phase 2: Symbol-Level Analysis (on reachable files only)

1. For each REACHABLE production file, use `documentSymbol` to enumerate all symbols (functions, classes, variables, types).
2. For each symbol, use `findReferences` and apply the reference classification rules in `../references/lsp-operations.md`:
   - Counts as usage: function calls, class instantiations, variable reads, type annotations in code.
   - Does NOT count as usage: export statements, re-exports, type-only imports.
   - If no actual usage references found → 1st-degree unused.
3. For 2nd-degree detection:
   - Use `incomingCalls` on 1st-degree unused functions.
   - Find symbols only called by unused code.
   - Mark dependency chains for reporting.

### Phase 3: Test Code Analysis (Unused Test Helpers)

1. Identify test helper files using the skill's "Test Helper Identification" logic:
   - Find test folders (folders containing files matching test patterns).
   - Non-test files within test folders are test helpers.
   - Skip co-located test scenarios (handled by Phase 2).
2. For each test helper file, use `documentSymbol` for exports and `findReferences` for each, applying the same actual-usage filtering as Phase 2.
3. Classify unused test symbols:
   - **Unused fixture**: No test imports or uses it.
   - **Unused helper function**: Defined but never called by any test.
   - **Unused mock**: Mock factory never invoked.
   - Report under: "Unused Test Helpers".

---

## Agent 3: Test-Only Production Code Detector

Non-goal: this agent is read-only. Report candidates with `file:line` evidence, including any recommended move; never delete, edit, or refactor what you find — `coding:lint` owns confirmed removal.

### Detection Algorithm

1. For each symbol in production files:
   - Use `findReferences` to get all usages.
   - Classify each reference location:
     - **Production**: files NOT matching test patterns.
     - **Test**: files matching test patterns (from config or conventions).

2. If ALL references are in test files, classify the symbol:

   **A. Test Helper Pattern → Recommend MOVE to test fixtures**

   - Name contains: `mock`, `stub`, `fake`, `fixture`, `helper`, `factory`, `builder`.
   - Pattern matches: `createMock*`, `build*`, `make*Factory`, `*TestHelper`, `*TestUtils`.
   - Is a small utility (< 20 lines).
   - Returns test data or mocks.

   **B. Dead Tested Code → Recommend REMOVE entirely**

   - Is a class, service, or substantial function.
   - Is directly tested (imported in test files).
   - Has NO production callers.
   - Examples: features tested but never integrated, classes never instantiated in prod.

---

## Why Parallel

- Each agent reads disjoint signals (text patterns vs. LSP symbol graph vs. reference-location classification), so they have no shared mutable state.
- The hierarchical file-level → symbol-level → test-helper structure inside Agent 2 keeps LSP work bounded on large codebases — Phase 1 prunes the symbol set before Phase 2 begins.
- Findings are merged by the parent: dedupe across agents, drop false positives, then group by file and category for the final report.
