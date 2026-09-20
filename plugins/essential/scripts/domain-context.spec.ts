import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { resolveDomainContext } from "./domain-context.ts";

interface FixturePlugin {
  readonly name: string;
  readonly path: string;
  readonly enabled: boolean;
}

const repository = resolve(import.meta.dirname, "../../..");
const domains = [
  "coding",
  "governance",
  "production",
  "react",
  "web",
  "client",
  "specification",
] as const;

describe("fn:resolveDomainContext", () => {
  it("should union separately delivered payload receipts without inferring other delivery", () => {
    const root = mkdtempSync(join(tmpdir(), "domain context "));
    try {
      const plugin = createPlugin(root, "alpha");
      const params = {
        plugins: [plugin],
        cwd: root,
        audience: "main" as const,
        evidence: { prompt: "/alpha:build" },
      };
      const all = resolveDomainContext({
        ...params,
        payloadNames: ["ALLAGENT"],
      });
      const main = resolveDomainContext({
        ...params,
        payloadNames: ["MAINAGENT"],
      });
      const partial = resolveDomainContext({
        ...params,
        deliveredReceipts: [all.receipt],
      });
      expect(partial.context).toContain("alpha-main");
      expect(partial.context).not.toContain("alpha-all=");
      const merged = resolveDomainContext({
        ...params,
        deliveredReceipts: [all.receipt, main.receipt],
      });
      expect(merged.context).toBe("");
      expect(
        resolveDomainContext({ ...params, receipt: merged.receipt }).context,
      ).toBe("");
      const child = resolveDomainContext({
        ...params,
        audience: "subagent",
        deliveredReceipts: [all.receipt, main.receipt],
      });
      expect(child.context).toContain("alpha-all=");
      expect(child.context).toContain("alpha-child");
      expect(child.context).not.toContain("alpha-main");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("should not infer coding from the explicit context loader's own TypeScript path", () => {
    const root = mkdtempSync(join(tmpdir(), "domain-context-"));
    try {
      const coding = createPlugin(root, "coding");
      const essential = {
        name: "essential",
        path: join(root, "essential"),
        enabled: true,
      };
      mkdirSync(essential.path);
      copyFileSync(
        join(repository, "plugins/coding/hooks/context.json"),
        join(coding.path, "hooks/context.json"),
      );
      const result = resolveDomainContext({
        plugins: [essential, coding],
        cwd: root,
        audience: "main",
        evidence: {
          prompt: "What is 2 plus 2?",
          tool_name: "Bash",
          tool_input: {
            command: `bun ${essential.path}/scripts/context.ts --audience main --prompt 'What is 2 plus 2?'`,
          },
        },
      });

      expect(result.context).not.toContain("coding-all=");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it.each(domains)(
    "should activate %s through its plugin-owned request policy",
    (name) => {
      const root = mkdtempSync(join(tmpdir(), "domain context "));
      try {
        const plugin = createPlugin(root, name);
        copyFileSync(
          join(repository, "plugins", name, "hooks/context.json"),
          join(plugin.path, "hooks/context.json"),
        );

        const result = resolveDomainContext({
          plugins: [plugin],
          cwd: root,
          audience: "main",
          evidence: { prompt: `/${name}:fixture` },
        });

        expect(result.context).toContain(`${name}-all=${plugin.path}`);
        expect(result.context).toContain(`${name}-main`);
        expect(result.context).not.toContain(`${name}-child`);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it("should omit unrelated domains and incrementally activate later and cross-domain requests", () => {
    const root = mkdtempSync(join(tmpdir(), "domain context "));
    try {
      const alpha = createPlugin(root, "alpha");
      const beta = createPlugin(root, "beta");
      const params = {
        plugins: [alpha, beta],
        cwd: root,
        audience: "main" as const,
      };
      const unrelated = resolveDomainContext({
        ...params,
        evidence: { prompt: "What is 2 plus 2?" },
      });
      expect(unrelated.context).toBe("");

      const first = resolveDomainContext({
        ...params,
        evidence: { prompt: "/alpha:build" },
        receipt: unrelated.receipt,
      });
      expect(first.context).toContain("alpha-all=");
      expect(first.context).not.toContain("beta-all=");
      const repeat = resolveDomainContext({
        ...params,
        evidence: { prompt: "/alpha:build" },
        receipt: first.receipt,
      });
      expect(repeat.context).toBe("");
      const cross = resolveDomainContext({
        ...params,
        evidence: { prompt: "/alpha:build /beta:build" },
        receipt: repeat.receipt,
      });
      expect(cross.context).toContain("beta-all=");
      expect(cross.context).not.toContain("alpha-all=");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("should redeliver changed payload bytes while keeping unchanged payloads silent", () => {
    const root = mkdtempSync(join(tmpdir(), "domain context "));
    try {
      const plugin = createPlugin(root, "alpha");
      const params = {
        plugins: [plugin],
        cwd: root,
        audience: "main" as const,
        evidence: { prompt: "/alpha:build" },
      };
      const first = resolveDomainContext(params);
      writeFileSync(join(plugin.path, "hooks/ALLAGENT.md"), "changed-all\n");

      const changed = resolveDomainContext({
        ...params,
        receipt: first.receipt,
      });

      expect(changed.context).toContain("changed-all");
      expect(changed.context).not.toContain("alpha-all=");
      expect(
        resolveDomainContext({ ...params, receipt: changed.receipt }).context,
      ).toBe("");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(["", "not-json", "{}", '{"digest":"forged","activeRoots":[]}'])(
    "should safely recover malformed receipt %s",
    (receipt) => {
      const root = mkdtempSync(join(tmpdir(), "domain context "));
      try {
        const plugin = createPlugin(root, "alpha");
        const params = {
          plugins: [plugin],
          cwd: root,
          audience: "main" as const,
          evidence: { prompt: "/alpha:build" },
        };
        const recovered = resolveDomainContext({ ...params, receipt });

        expect(recovered.context).toContain("alpha-all=");
        expect(
          resolveDomainContext({ ...params, receipt: recovered.receipt })
            .context,
        ).toBe("");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it.each(["cwd", "audience", "enabled roots", "policy"])(
    "should reject receipts from a changed %s scope",
    (scope) => {
      const root = mkdtempSync(join(tmpdir(), "domain context "));
      try {
        const plugin = createPlugin(root, "alpha");
        const params = {
          plugins: [plugin],
          cwd: root,
          audience: "main" as const,
          evidence: { prompt: "/alpha:build" },
        };
        const first = resolveDomainContext(params);
        const other = join(root, "other");
        mkdirSync(other);
        if (scope === "policy")
          writeFileSync(
            join(plugin.path, "hooks/context.json"),
            JSON.stringify({
              request_patterns: ["alpha"],
              tool_patterns: [],
              agent_patterns: [],
            }),
          );
        const changed = resolveDomainContext({
          ...params,
          receipt: first.receipt,
          cwd: scope === "cwd" ? other : root,
          audience: scope === "audience" ? "subagent" : "main",
          plugins:
            scope === "enabled roots"
              ? [plugin, createPlugin(root, "beta")]
              : [plugin],
        });

        expect(changed.context).toContain("alpha-all=");
        if (scope === "audience") {
          expect(changed.context).toContain("alpha-child");
          expect(changed.context).not.toContain("alpha-main");
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it("should reset retained delivery explicitly and activate through tool and agent evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "domain context "));
    try {
      const plugin = createPlugin(root, "alpha");
      const params = {
        plugins: [plugin],
        cwd: root,
        audience: "main" as const,
        evidence: { tool_name: "alpha_tool" },
      };
      const first = resolveDomainContext(params);
      expect(first.context).toContain("alpha-all=");
      expect(
        resolveDomainContext({ ...params, receipt: first.receipt }).context,
      ).toBe("");
      expect(
        resolveDomainContext({ ...params, receipt: first.receipt, reset: true })
          .context,
      ).toContain("alpha-all=");
      const child = resolveDomainContext({
        ...params,
        audience: "subagent",
        evidence: { agent_type: "alpha_worker" },
      });
      expect(child.context).toContain("alpha-child");
      expect(child.context).not.toContain("alpha-main");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function createPlugin(root: string, name: string): FixturePlugin {
  const path = join(root, `${name} plugin`);
  mkdirSync(join(path, "hooks"), { recursive: true });
  writeFileSync(
    join(path, "hooks/context.json"),
    JSON.stringify({
      request_patterns: [`/${name}:`],
      tool_patterns: [`^${name}_tool$`],
      agent_patterns: [`^${name}_worker$`],
    }),
  );
  writeFileSync(
    join(path, "hooks/ALLAGENT.md"),
    `${name}-all={{PLUGIN_DIR}}\n`,
  );
  writeFileSync(join(path, "hooks/MAINAGENT.md"), `${name}-main\n`);
  writeFileSync(join(path, "hooks/SUBAGENT.md"), `${name}-child\n`);
  return { name, path, enabled: true };
}
