import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * every module-level import or re-export a file makes.
 *
 * `[\s\S]` rather than `.`, because a clause long enough to wrap is exactly the
 * clause a dot never crosses: the pattern this replaced saw 315 of the tree's
 * edges and the rule it enforced was about a graph 33 edges short of the real
 * one. `export … from` is here for the same reason — a barrel re-export is an
 * edge whatever keyword introduces it.
 */
const EDGE = /^(?:import|export)\s+(type\s+)?([\s\S]*?)\bfrom\s+"([^"]+)"/gm;

/** the tree these rules are about: everything authored, not one directory of it. */
const ROOT = resolve(import.meta.dirname, "..");

/**
 * everything the tree hangs from.
 *
 * four roots rather than one. The page runtime is reached by the bundler from
 * a path it is handed rather than by an import anything could follow, so read
 * from the render executable alone, thirty modules that ship in every board
 * look like code nobody calls; and the state board is a second executable,
 * which is what keeps reading `.state` out of the renderer's own tree.
 */
const ROOTS = [
  "render-page.ts",
  "render-page/runtime/boot.ts",
  "render-page/runtime/main.ts",
  "state-board.ts",
];

/**
 * what exists only to drive the suite.
 *
 * named by what reaches them rather than by a list kept by hand: these are the
 * modules no shipped module imports, which is the same question the line target
 * below is really asking.
 */
const SUPPORT = ["dom-support.ts", "test-support.ts"];

/** the pure renderer, which may not be one import away from the filesystem. */
const PAGE = "render-page/page.ts";

/**
 * every way a module reaches the filesystem, the network or a shell without a
 * static import naming it.
 *
 * a static specifier is only one of the ways in. `await import("node:fs")`
 * carries no `from` clause, so the edge pattern never sees it; a bare `"fs"`
 * is a specifier the `node:` prefix test read straight past; and `fetch` needs
 * no import at all. Each of the three was seeded into a module the renderer
 * reaches and left the whole suite green.
 */
const AMBIENT = [
  /\bimport\s*\(/u,
  /\brequire\s*\(/u,
  /\bfetch\s*\(/u,
  /\bXMLHttpRequest\b/u,
  /\bWebSocket\b/u,
  /\bEventSource\b/u,
  /\bsendBeacon\s*\(/u,
  /\bimportScripts\s*\(/u,
  /\bBun\s*\./u,
  /\bprocess\s*\./u,
];

/** a doc comment or a commented-out line, which say things code does not do. */
const COMMENT = /\/\*[\s\S]*?\*\/|^[ \t]*\/\/[^\n]*$/gmu;

/** how many edges the tree holds, as a graph read the way a bundler reads one. */
const EDGES = 466;

/** one module against another. */
interface Edge {
  /** the module imported, relative to the tree root */
  to: string;
  /** whether the import is erased at build time */
  erased: boolean;
}

/** what one module reaches for. */
interface Reaches {
  /** the modules of this tree it imports */
  local: Edge[];
  /** everything else it imports, by the specifier written */
  foreign: string[];
}

/**
 * lists every authored module under a directory, specs excluded
 * @param dir the directory to walk
 * @returns each module's path, relative to the tree root
 */
function modules(dir: string = ROOT): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return modules(full);

    return entry.name.endsWith(".ts") && !entry.name.endsWith(".spec.ts")
      ? [relative(ROOT, full)]
      : [];
  });
}

/**
 * reads what one module imports
 * @param file the module's path, relative to the tree root
 * @returns its edges into this tree, and everything else it names
 */
function reaches(file: string): Reaches {
  const found = [...readFileSync(join(ROOT, file), "utf8").matchAll(EDGE)];
  const here = dirname(join(ROOT, file));

  return {
    local: found
      .filter(([, , , target]) => target!.startsWith("."))
      .map(([, erased, , target]) => ({
        to: relative(ROOT, resolve(here, target!)),
        erased: Boolean(erased),
      }))
      .filter(({ to }) => !to.startsWith("..")),
    foreign: found
      .filter(([, , , target]) => !target!.startsWith("."))
      .map(([, , , target]) => target!),
  };
}

/** the whole tree, read once. */
const TREE = new Map(modules().map((file) => [file, reaches(file)]));

/**
 * walks out from a set of modules along the edges a bundler would follow
 * @param from the modules to start at
 * @param erased whether type-only imports count as edges
 * @returns every module reached, the starting one included
 */
function closure(from: string[], erased: boolean): Set<string> {
  const seen = new Set<string>();
  const left = [...from];
  for (let next = left.pop(); next; next = left.pop()) {
    if (seen.has(next)) continue;
    seen.add(next);
    for (const edge of TREE.get(next)?.local ?? [])
      if (erased || !edge.erased) left.push(edge.to);
  }

  return seen;
}

describe("render-page module graph", () => {
  it("should reach everything that ships, and nothing but the suite besides", () => {
    // the rules below are worth exactly as much as the tree they run over, and
    // reading one directory left the executable itself outside every one of them
    const shipped = closure(ROOTS, true);
    const left = [...TREE.keys()].filter((file) => !shipped.has(file)).sort();

    expect([...TREE.keys()]).toEqual(expect.arrayContaining(ROOTS));
    expect(left).toStrictEqual(SUPPORT);
  });

  it("should resolve every edge it finds, and find every edge there is", () => {
    // the count is the guard on the pattern itself: a regex that quietly stops
    // matching leaves every rule below passing over a graph that is not the tree
    const edges = [...TREE.values()].flatMap(({ local }) => local);
    const dangling = edges.filter(({ to }) => !TREE.has(to)).map(({ to }) => to);

    expect(dangling).toStrictEqual([]);
    expect(edges).toHaveLength(EDGES);
  });

  it("should hold no import cycle anywhere in the tree", () => {
    // R2 named one cycle and breaking it grew a second, which the review found;
    // breaking that one uncovered a third that no one had reported. A rule the
    // suite enforces is the only kind that survives the next split
    const found: string[] = [];
    const visit = (file: string, path: string[]): void => {
      if (path.includes(file)) {
        found.push([...path.slice(path.indexOf(file)), file].join(" -> "));

        return;
      }
      for (const { to } of TREE.get(file)?.local ?? []) visit(to, [...path, file]);
    };
    for (const file of TREE.keys()) visit(file, []);

    expect(found).toStrictEqual([]);
  });

  it("should keep the renderer off the filesystem, the network, and a shell", () => {
    // R4 — `renderPage` is pure and every read happens in the CLI layer. That
    // held as a claim about what the code does while `reference.ts` sat one
    // value import away from `node:fs`, which is the whole distance. The rule
    // that replaced it read static `node:` specifiers only, which is one of
    // three ways in: no foreign specifier at all is the claim worth making
    const touching = [...closure([PAGE], false)].sort().flatMap((file) => {
      // said in a comment rather than done: every refusal on this board is
      // about what a browser would fetch, so the words are all over the tree
      const source = readFileSync(join(ROOT, file), "utf8").replace(COMMENT, " ");

      return [
        ...TREE.get(file)!.foreign,
        ...AMBIENT.filter((reach) => reach.test(source)).map((reach) => reach.source),
      ].map((what) => `${file}: ${what}`);
    });

    expect(touching).toStrictEqual([]);
  });

  it("should keep every shipped module inside the line target agreed at stage 1", () => {
    // D-26 — 300 lines, source only. What ships is what the entry reaches: a
    // spec is documentation and grows with the behaviour it describes, and the
    // DOM stub the specs drive is documentation of the same kind
    const over = [...closure(ROOTS, true)]
      .map((file) => [file, readFileSync(join(ROOT, file), "utf8").split("\n").length] as const)
      .filter(([, lines]) => lines > 300)
      .map(([file, lines]) => `${file}: ${lines}`);

    expect(over).toStrictEqual([]);
  });
});
