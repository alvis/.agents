import { chmodSync, copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

interface MarketplacePlugin {
  readonly name: string;
  readonly source: string;
}

interface Marketplace {
  readonly plugins: readonly MarketplacePlugin[];
}

/**
 * projects the canonical installed-plugin resolver into every plugin
 * @param repositoryRoot marketplace source root
 * @returns generated plugin-local resolver paths
 */
export function projectPluginRoot(repositoryRoot: string): readonly string[] {
  const source = join(repositoryRoot, "scripts/plugin-root");
  const marketplace = JSON.parse(
    readFileSync(
      join(repositoryRoot, ".claude-plugin/marketplace.json"),
      "utf8",
    ),
  ) as Marketplace;
  return marketplace.plugins.map((plugin) => {
    const destination = join(
      repositoryRoot,
      plugin.source,
      "scripts/plugin-root",
    );
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    chmodSync(destination, 0o755);
    return destination;
  });
}

if (import.meta.main) {
  const paths = projectPluginRoot(
    process.argv[2] ?? resolve(import.meta.dirname, ".."),
  );
  process.stdout.write(`generated ${paths.length} plugin-root projections\n`);
}
