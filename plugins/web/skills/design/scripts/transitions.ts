#!/usr/bin/env bun

import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

type ExampleKind = "css-only" | "interactive";
type FenceLanguage = "css" | "html" | "js";

interface CliParams {
  readonly consumerDirectory: string;
}

interface CodeFence {
  readonly content: string;
  readonly language: FenceLanguage;
}

interface Recipe {
  readonly css: string | null;
  readonly domain: string;
  readonly html: string;
  readonly id: string;
  readonly javascript: string | null;
  readonly kind: ExampleKind;
  readonly source: string;
  readonly sourceContent: string;
}

interface CompilerReceipt {
  readonly cli: {
    readonly package: "@tailwindcss/cli";
    readonly version: string;
  };
  readonly core: {
    readonly package: "tailwindcss";
    readonly version: string;
  };
}

interface ExampleReceipt {
  readonly domain: string;
  readonly fences: {
    readonly css_sha256: string | null;
    readonly html_sha256: string;
    readonly js_sha256: string | null;
  };
  readonly fixture_url: string;
  readonly id: string;
  readonly kind: ExampleKind;
  readonly outputs: {
    readonly compiled_css_sha256: string;
    readonly fixture_html_sha256: string;
    readonly input_css_sha256: string;
  };
  readonly source: string;
  readonly source_sha256: string;
}

interface OutputReceipt {
  readonly compiled_css_sha256: string;
  readonly fixture_html_sha256: string;
  readonly input_css_sha256: string;
}

interface ManifestPayload {
  readonly behavior_checks: readonly {
    readonly path: string;
    readonly sha256: string;
  }[];
  readonly builder: {
    readonly path: string;
    readonly sha256: string;
  };
  readonly compiler: CompilerReceipt;
  readonly examples: readonly ExampleReceipt[];
  readonly gallery: OutputReceipt & { readonly fixture_url: "index.html" };
  readonly motion: {
    readonly path: string;
    readonly sha256: string;
  };
  readonly schema_version: 1;
}

class TransitionFixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionFixtureError";
  }
}

const REQUIRED_TAILWIND_VERSION = "4.3.3";
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const DESIGN_DIRECTORY = dirname(SCRIPT_DIRECTORY);
const TRANSITION_DIRECTIONS_DIRECTORY = join(
  DESIGN_DIRECTORY,
  "directions",
  "transitions",
);
const MOTION_CSS_PATH = join(
  DESIGN_DIRECTORY,
  "assets",
  "transitions",
  "motion.css",
);
const BEHAVIOR_CHECK_PATHS = [
  join(SCRIPT_DIRECTORY, "transition-checks.js"),
  join(SCRIPT_DIRECTORY, "transition-checks", "controls.js"),
  join(SCRIPT_DIRECTORY, "transition-checks", "feedback.js"),
  join(SCRIPT_DIRECTORY, "transition-checks", "layout.js"),
  join(SCRIPT_DIRECTORY, "transition-checks", "overlays.js"),
  join(SCRIPT_DIRECTORY, "transition-checks", "text.js"),
] as const;

function main(arguments_ = Bun.argv.slice(2)): number {
  if (arguments_.length === 1 && ["--help", "-h"].includes(arguments_[0]!)) {
    process.stdout.write(
      "usage: transitions.ts build --consumer <absolute-disposable-consumer> | self-check\n",
    );
    return 0;
  }

  try {
    if (arguments_.length === 1 && arguments_[0] === "self-check") {
      runSelfCheck();
      process.stdout.write(
        `${JSON.stringify({ cases: 5, status: "success" })}\n`,
      );
      return 0;
    }
    const params = parseCliArguments(arguments_);
    const compiler = verifyCompiler(params.consumerDirectory);
    const recipes = readRecipes();
    const manifestPath = buildFixtures({
      compiler,
      consumerDirectory: params.consumerDirectory,
      recipes,
    });
    process.stdout.write(
      `${JSON.stringify({ examples: recipes.length, manifest: manifestPath, status: "success" })}\n`,
    );
    return 0;
  } catch (error) {
    const exception = error as Error;
    process.stderr.write(`${exception.name}: ${exception.message}\n`);
    return 1;
  }
}

function parseCliArguments(arguments_: readonly string[]): CliParams {
  if (arguments_[0] !== "build") {
    throw new TransitionFixtureError(
      "expected `build --consumer <absolute-disposable-consumer>`",
    );
  }

  const buildArguments = arguments_.slice(1);
  if (buildArguments.length !== 2 || buildArguments[0] !== "--consumer") {
    throw new TransitionFixtureError(
      "build requires exactly `--consumer <absolute-disposable-consumer>`",
    );
  }

  const consumerArgument = buildArguments[1]!;
  if (!consumerArgument.startsWith(sep)) {
    throw new TransitionFixtureError("--consumer must be an absolute path");
  }

  const consumerDirectory = resolve(consumerArgument);
  if (!statSync(consumerDirectory, { throwIfNoEntry: false })?.isDirectory()) {
    throw new TransitionFixtureError(
      `consumer directory does not exist: ${consumerDirectory}`,
    );
  }
  return { consumerDirectory };
}

function verifyCompiler(consumerDirectory: string): CompilerReceipt {
  const coreVersion = readPackageVersion(
    join(consumerDirectory, "node_modules", "tailwindcss", "package.json"),
    "tailwindcss",
  );
  const cliVersion = readPackageVersion(
    join(
      consumerDirectory,
      "node_modules",
      "@tailwindcss",
      "cli",
      "package.json",
    ),
    "@tailwindcss/cli",
  );

  for (const [packageName, version] of [
    ["tailwindcss", coreVersion],
    ["@tailwindcss/cli", cliVersion],
  ] as const) {
    requireCompilerVersion(packageName, version);
  }

  return {
    cli: { package: "@tailwindcss/cli", version: cliVersion },
    core: { package: "tailwindcss", version: coreVersion },
  };
}

function readRecipes(
  recipeDirectory = TRANSITION_DIRECTIONS_DIRECTORY,
): Recipe[] {
  if (!statSync(recipeDirectory, { throwIfNoEntry: false })?.isDirectory()) {
    throw new TransitionFixtureError(
      `transition recipe directory does not exist: ${recipeDirectory}`,
    );
  }

  const sourcePaths = collectRecipeMarkdownPaths(recipeDirectory);
  if (sourcePaths.length === 0) {
    throw new TransitionFixtureError(
      `transition recipe directory contains no <domain>/<recipe>.md files: ${recipeDirectory}`,
    );
  }
  const recipes = sourcePaths.map((sourcePath) =>
    readRecipe(sourcePath, recipeDirectory),
  );
  const ids = new Set<string>();
  for (const recipe of recipes) {
    if (ids.has(recipe.id)) {
      throw new TransitionFixtureError(
        `transition recipe id is duplicated across domains: ${recipe.id}`,
      );
    }
    ids.add(recipe.id);
  }
  return recipes;
}

function buildFixtures(params: {
  readonly compiler: CompilerReceipt;
  readonly consumerDirectory: string;
  readonly recipes: readonly Recipe[];
}): string {
  const fixtureRoot = join(params.consumerDirectory, "fixtures");
  const tailwindExecutable = join(
    params.consumerDirectory,
    "node_modules",
    ".bin",
    "tailwindcss",
  );
  const motionCss = readRequiredFile(MOTION_CSS_PATH, "shared motion CSS");
  const motionPath = relative(DESIGN_DIRECTORY, MOTION_CSS_PATH).split(sep).join("/");

  rmSync(fixtureRoot, { force: true, recursive: true });
  mkdirSync(fixtureRoot, { recursive: true });

  const receipts = params.recipes.map((recipe) =>
    buildRecipeFixture({
      fixtureRoot,
      motionCss,
      recipe,
      tailwindExecutable,
    }),
  );
  const galleryHtml = renderGallery(receipts);
  const galleryInputCss = renderGalleryInputCss();
  const galleryHtmlPath = join(fixtureRoot, "index.html");
  const galleryInputCssPath = join(fixtureRoot, "gallery.input.css");
  const galleryOutputCssPath = join(fixtureRoot, "gallery.css");
  writeFileSync(galleryHtmlPath, galleryHtml);
  writeFileSync(galleryInputCssPath, galleryInputCss);
  compileTailwind({
    inputCssPath: galleryInputCssPath,
    label: "fixture gallery",
    outputCssPath: galleryOutputCssPath,
    tailwindExecutable,
  });
  const galleryOutputCss = readRequiredFile(
    galleryOutputCssPath,
    "compiled gallery CSS",
  );

  const manifestPayload: ManifestPayload = {
    behavior_checks: BEHAVIOR_CHECK_PATHS.map((path) => ({
      path: relative(DESIGN_DIRECTORY, path).split(sep).join("/"),
      sha256: sha256(readRequiredFile(path, "behavior checker")),
    })).sort((left, right) => left.path.localeCompare(right.path)),
    builder: {
      path: relative(DESIGN_DIRECTORY, fileURLToPath(import.meta.url))
        .split(sep)
        .join("/"),
      sha256: sha256(readRequiredFile(fileURLToPath(import.meta.url), "fixture builder")),
    },
    compiler: params.compiler,
    examples: receipts,
    gallery: {
      compiled_css_sha256: sha256(galleryOutputCss),
      fixture_html_sha256: sha256(galleryHtml),
      fixture_url: "index.html",
      input_css_sha256: sha256(galleryInputCss),
    },
    motion: { path: motionPath, sha256: sha256(motionCss) },
    schema_version: 1,
  };
  const aggregateSha256 = sha256(JSON.stringify(manifestPayload));
  const manifestPath = join(fixtureRoot, "manifest.json");
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ ...manifestPayload, aggregate_sha256: aggregateSha256 }, null, 2)}\n`,
  );
  return manifestPath;
}

function buildRecipeFixture(params: {
  readonly fixtureRoot: string;
  readonly motionCss: string;
  readonly recipe: Recipe;
  readonly tailwindExecutable: string;
}): ExampleReceipt {
  const fixtureDirectory = join(
    params.fixtureRoot,
    params.recipe.domain,
    params.recipe.id,
  );
  mkdirSync(fixtureDirectory, { recursive: true });

  const fixtureHtml = renderFixture(params.recipe);
  const inputCss = renderInputCss(params.motionCss, params.recipe.css);
  const fixtureHtmlPath = join(fixtureDirectory, "index.html");
  const inputCssPath = join(fixtureDirectory, "input.css");
  const outputCssPath = join(fixtureDirectory, "output.css");
  writeFileSync(fixtureHtmlPath, fixtureHtml);
  writeFileSync(inputCssPath, inputCss);
  compileTailwind({
    inputCssPath,
    label: params.recipe.source,
    outputCssPath,
    tailwindExecutable: params.tailwindExecutable,
  });

  const compiledCss = readRequiredFile(outputCssPath, "compiled Tailwind CSS");
  const fixtureUrl = `${params.recipe.domain}/${params.recipe.id}/index.html`;
  return {
    domain: params.recipe.domain,
    fences: {
      css_sha256: params.recipe.css === null ? null : sha256(params.recipe.css),
      html_sha256: sha256(params.recipe.html),
      js_sha256:
        params.recipe.javascript === null
          ? null
          : sha256(params.recipe.javascript),
    },
    fixture_url: fixtureUrl,
    id: params.recipe.id,
    kind: params.recipe.kind,
    outputs: {
      compiled_css_sha256: sha256(compiledCss),
      fixture_html_sha256: sha256(fixtureHtml),
      input_css_sha256: sha256(inputCss),
    },
    source: params.recipe.source,
    source_sha256: sha256(params.recipe.sourceContent),
  };
}

function readPackageVersion(path: string, packageName: string): string {
  const content = readRequiredFile(path, `${packageName} package manifest`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const exception = error as Error;
    throw new TransitionFixtureError(
      `${packageName} package manifest is invalid JSON at ${path}: ${exception.message}`,
    );
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("version" in parsed) ||
    typeof parsed.version !== "string"
  ) {
    throw new TransitionFixtureError(
      `${packageName} package manifest has no string version: ${path}`,
    );
  }
  return parsed.version;
}

function collectRecipeMarkdownPaths(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((domainEntry) => domainEntry.isDirectory())
    .flatMap((domainEntry) => {
      const domainDirectory = join(directory, domainEntry.name);
      return readdirSync(domainDirectory, { withFileTypes: true })
        .filter(
          (recipeEntry) =>
            recipeEntry.isFile() && extname(recipeEntry.name) === ".md",
        )
        .map((recipeEntry) => join(domainDirectory, recipeEntry.name));
    })
    .sort();
}

function readRecipe(sourcePath: string, recipeDirectory: string): Recipe {
  const source = readRequiredFile(sourcePath, "transition recipe");
  return parseRecipeSource(source, sourcePath, recipeDirectory);
}

function parseRecipeSource(
  source: string,
  sourcePath: string,
  recipeDirectory = TRANSITION_DIRECTIONS_DIRECTORY,
): Recipe {
  const fences = parseCodeFences(source, sourcePath);
  const fencesByLanguage = new Map<FenceLanguage, CodeFence>();
  for (const fence of fences) {
    if (fencesByLanguage.has(fence.language)) {
      throw new TransitionFixtureError(
        `${sourcePath} contains more than one ${fence.language} fence`,
      );
    }
    fencesByLanguage.set(fence.language, fence);
  }

  const html = fencesByLanguage.get("html")?.content;
  if (html === undefined) {
    throw new TransitionFixtureError(`${sourcePath} requires one html fence`);
  }
  const id = sourcePath.slice(0, -extname(sourcePath).length).split(sep).at(-1)!;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new TransitionFixtureError(
      `${sourcePath} filename stem must be kebab-case`,
    );
  }
  validateHtmlRoot(html, id, sourcePath);

  const javascript = fencesByLanguage.get("js")?.content ?? null;
  if (javascript !== null) validateJavascript(javascript, sourcePath);

  const sourceSegments = relative(recipeDirectory, sourcePath).split(sep);
  if (
    sourceSegments.length !== 2 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sourceSegments[0]!)
  ) {
    throw new TransitionFixtureError(
      `${sourcePath} must match ${recipeDirectory}/<kebab-case-domain>/<kebab-case-recipe>.md`,
    );
  }
  const domain = sourceSegments[0]!;
  return {
    css: fencesByLanguage.get("css")?.content ?? null,
    domain,
    html,
    id,
    javascript,
    kind: javascript === null ? "css-only" : "interactive",
    source: relative(DESIGN_DIRECTORY, sourcePath).split(sep).join("/"),
    sourceContent: source,
  };
}

function runSelfCheck(): void {
  const validHtml = '<section data-demo="example"></section>';
  const validJavascript = "function mount(root) { return () => {}; }";
  const examplePath = join(
    DESIGN_DIRECTORY,
    "directions",
    "transitions",
    "self-check",
    "example.md",
  );
  const instructionalRecipe = `# Example\n\nUse this recipe to verify instructional prose around executable fences.\n\n\`\`\`html\n${validHtml}\n\`\`\`\n\n\`\`\`js\n${validJavascript}\n\`\`\`\n`;
  const selfCheckDirectory = mkdtempSync(
    join(tmpdir(), "transition-recipes-self-check-"),
  );

  try {
    const domainDirectory = join(selfCheckDirectory, "self-check");
    mkdirSync(domainDirectory);
    writeFileSync(join(selfCheckDirectory, "validation.md"), "# Validation\n");
    writeFileSync(join(selfCheckDirectory, "self-check.md"), "# Domain index\n");
    writeFileSync(join(domainDirectory, "example.md"), instructionalRecipe);
    const recipes = readRecipes(selfCheckDirectory);
    if (
      recipes.length !== 1 ||
      recipes[0]?.id !== "example" ||
      recipes[0].html !== `${validHtml}\n` ||
      recipes[0].javascript !== `${validJavascript}\n`
    ) {
      throw new TransitionFixtureError(
        "self-check did not discover the instructional domain recipe exclusively",
      );
    }
  } finally {
    rmSync(selfCheckDirectory, { force: true, recursive: true });
  }

  const cases: readonly {
    readonly action: () => unknown;
    readonly name: string;
  }[] = [
    {
      action: () => requireCompilerVersion("tailwindcss", "4.3.2"),
      name: "bad compiler version",
    },
    {
      action: () =>
        parseRecipeSource(
          `\`\`\`html\n${validHtml}\n\`\`\`\n\n\`\`\`html\n${validHtml}\n\`\`\`\n`,
          examplePath,
        ),
      name: "duplicate fence",
    },
    {
      action: () =>
        parseRecipeSource(
          `# Missing markup\n\n\`\`\`js\n${validJavascript}\n\`\`\`\n`,
          examplePath,
        ),
      name: "instructional recipe missing its html fence",
    },
    {
      action: () =>
        parseRecipeSource(
          "```html\n<div data-demo=\"example\"></div>\n```\n",
          examplePath,
        ),
      name: "malformed markup root",
    },
  ];

  for (const selfCheck of cases) assertTransitionFailure(selfCheck);
}

function assertTransitionFailure(selfCheck: {
  readonly action: () => unknown;
  readonly name: string;
}): void {
  try {
    selfCheck.action();
  } catch (error) {
    if (error instanceof TransitionFixtureError) return;
    throw error;
  }
  throw new TransitionFixtureError(
    `self-check did not reject ${selfCheck.name}`,
  );
}

function requireCompilerVersion(packageName: string, version: string): void {
  if (version !== REQUIRED_TAILWIND_VERSION) {
    throw new TransitionFixtureError(
      `${packageName} must be ${REQUIRED_TAILWIND_VERSION}, found ${version}`,
    );
  }
}

function parseCodeFences(source: string, sourcePath: string): CodeFence[] {
  const fences: CodeFence[] = [];
  const lines = source.split(/\r\n|\r|\n/);
  let active:
    | {
        readonly character: "`" | "~";
        readonly language: FenceLanguage;
        readonly length: number;
        readonly lines: string[];
      }
    | undefined;

  for (const [lineIndex, line] of lines.entries()) {
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})([^`]*)$/);
    if (active === undefined && opening) {
      const language = opening[2]!.trim();
      if (!isFenceLanguage(language)) {
        throw new TransitionFixtureError(
          `${sourcePath}:${lineIndex + 1} uses unsupported fence language '${language || "none"}'`,
        );
      }
      active = {
        character: opening[1]![0] as "`" | "~",
        language,
        length: opening[1]!.length,
        lines: [],
      };
      continue;
    }
    if (active === undefined) continue;

    const closing = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
    if (
      closing &&
      closing[1]![0] === active.character &&
      closing[1]!.length >= active.length
    ) {
      fences.push({
        content: active.lines.length === 0 ? "" : `${active.lines.join("\n")}\n`,
        language: active.language,
      });
      active = undefined;
    } else {
      active.lines.push(line);
    }
  }

  if (active !== undefined) {
    throw new TransitionFixtureError(`${sourcePath} contains an unclosed fence`);
  }
  return fences;
}

function isFenceLanguage(language: string): language is FenceLanguage {
  return language === "css" || language === "html" || language === "js";
}

function validateHtmlRoot(html: string, id: string, sourcePath: string): void {
  const root = html.trim().match(/^<section\b([^>]*)>[\s\S]*<\/section>$/);
  if (!root) {
    throw new TransitionFixtureError(
      `${sourcePath} html fence must contain one section root`,
    );
  }
  const demoAttribute = root[1]!.match(/\bdata-demo\s*=\s*(["'])([^"']+)\1/);
  if (demoAttribute?.[2] !== id) {
    throw new TransitionFixtureError(
      `${sourcePath} section data-demo must equal filename stem '${id}'`,
    );
  }

  const sectionTags = [...html.matchAll(/<\/?section\b[^>]*>/gi)];
  let depth = 0;
  for (const [tagIndex, tag] of sectionTags.entries()) {
    depth += tag[0].startsWith("</") ? -1 : 1;
    if (depth < 1 && tagIndex < sectionTags.length - 1) {
      throw new TransitionFixtureError(
        `${sourcePath} html fence must contain one section root`,
      );
    }
  }
  if (depth !== 0) {
    throw new TransitionFixtureError(
      `${sourcePath} html fence contains unbalanced section elements`,
    );
  }
}

function validateJavascript(javascript: string, sourcePath: string): void {
  const declarations = javascript.match(/\bfunction\s+mount\s*\(\s*root\s*\)/g) ?? [];
  if (declarations.length !== 1) {
    throw new TransitionFixtureError(
      `${sourcePath} js fence must declare exactly one function mount(root)`,
    );
  }
  if (/<\/script/i.test(javascript)) {
    throw new TransitionFixtureError(
      `${sourcePath} js fence cannot contain a closing script tag`,
    );
  }
  try {
    new Function(`${javascript}\nreturn mount;`);
  } catch (error) {
    const exception = error as Error;
    throw new TransitionFixtureError(
      `${sourcePath} js fence does not parse: ${exception.message}`,
    );
  }
}

function renderInputCss(motionCss: string, recipeCss: string | null): string {
  return `@import "tailwindcss" source(none);\n@source "./index.html";\n\n${motionCss.trim()}\n${recipeCss === null ? "" : `\n${recipeCss.trim()}\n`}`;
}

function renderFixture(recipe: Recipe): string {
  const recipeMount =
    recipe.javascript === null
      ? "const recipeMount = () => () => {};"
      : `const recipeMount = (() => {\n${recipe.javascript.trim()}\nreturn mount;\n})();`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(recipe.id)}</title>
  <link rel="stylesheet" href="./output.css">
</head>
<body>
${recipe.html.trim()}
<script>
(() => {
  "use strict";
  ${recipeMount}
  const root = document.querySelector('section[data-demo="${recipe.id}"]');
  if (!(root instanceof HTMLElement)) throw new Error("fixture root is missing");
  let cleanup = null;
  const fixture = {
    id: ${JSON.stringify(recipe.id)},
    sourceSha256: ${JSON.stringify(sha256(recipe.sourceContent))},
    root,
    mount() {
      fixture.dispose();
      const nextCleanup = recipeMount(root);
      if (typeof nextCleanup !== "function") throw new Error("mount(root) must return cleanup");
      cleanup = nextCleanup;
    },
    dispose() {
      const activeCleanup = cleanup;
      cleanup = null;
      if (activeCleanup !== null) activeCleanup();
    },
  };
  globalThis.__transitionFixture = fixture;
  fixture.mount();
})();
</script>
</body>
</html>
`;
}

function renderGallery(receipts: readonly ExampleReceipt[]): string {
  const cards = receipts
    .map(
      (receipt) => `<article class="rounded-xl border border-neutral-300 bg-white p-4 shadow-sm">
  <h2 class="m-0 text-lg font-semibold"><a class="text-blue-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2" href="${receipt.fixture_url}">${escapeHtml(receipt.id)}</a></h2>
  <p class="mb-2 mt-1 text-sm text-neutral-600">${escapeHtml(receipt.domain)} · ${receipt.kind}</p>
  <iframe class="min-h-96 w-full border-0" src="${receipt.fixture_url}" title="${escapeHtml(receipt.id)} transition"></iframe>
</article>`,
    )
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Transition fixtures</title>
  <link rel="stylesheet" href="./gallery.css">
</head>
<body class="m-0 bg-neutral-50 p-4 font-sans text-neutral-950">
<h1 class="mb-4 mt-0 text-2xl font-bold">Transition fixtures</h1>
<main class="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(24rem,100%),1fr))]">
${cards}
</main>
</body>
</html>
`;
}

function renderGalleryInputCss(): string {
  return '@import "tailwindcss" source(none);\n@source "./index.html";\n';
}

function compileTailwind(params: {
  readonly inputCssPath: string;
  readonly label: string;
  readonly outputCssPath: string;
  readonly tailwindExecutable: string;
}): void {
  const compilation = spawnSync(
    params.tailwindExecutable,
    ["-i", params.inputCssPath, "-o", params.outputCssPath],
    { cwd: dirname(params.inputCssPath), encoding: "utf8" },
  );
  if (compilation.error) {
    throw new TransitionFixtureError(
      `Tailwind failed to start for ${params.label}: ${compilation.error.message}`,
    );
  }
  if (compilation.status !== 0) {
    const detail = (compilation.stderr || compilation.stdout).trim();
    throw new TransitionFixtureError(
      `Tailwind failed for ${params.label}${detail ? `: ${detail}` : ""}`,
    );
  }
}

function readRequiredFile(path: string, label: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    const exception = error as Error;
    throw new TransitionFixtureError(
      `${label} is unavailable at ${path}: ${exception.message}`,
    );
  }
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

if (import.meta.main) process.exit(main());
