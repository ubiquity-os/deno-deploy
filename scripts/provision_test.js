import { assertEquals } from "jsr:@std/assert@1.0.13";
import { join } from "jsr:@std/path@1.1.2";
import { buildConfig, stageWorkspaceDeployConfig } from "./provision.js";

Deno.test("buildConfig preserves source config and always enables kv", () => {
  const config = buildConfig("src/worker.ts", "ubiquity-os/example", {
    imports: {
      "foo/": "./foo/",
    },
    unstable: ["bare-node-builtins"],
    compilerOptions: {
      strict: true,
    },
    runtime: {
      custom: "value",
    },
  });

  assertEquals(config.imports, {
    "foo/": "./foo/",
  });
  assertEquals(config.unstable, ["bare-node-builtins", "kv"]);
  assertEquals(config.compilerOptions, {
    strict: true,
  });
  assertEquals(config.runtime, {
    custom: "value",
    type: "dynamic",
    entrypoint: "src/worker.ts",
  });
});

Deno.test("stageWorkspaceDeployConfig writes a standard config file and restores the original content", async () => {
  const repoRoot = await Deno.makeTempDir();
  const configPath = join(repoRoot, "deno.jsonc");
  const originalContent = '{\n  "imports": {\n    "foo/": "./foo/"\n  }\n}\n';

  try {
    await Deno.writeTextFile(configPath, originalContent);
    const staged = await stageWorkspaceDeployConfig({
      repoRoot,
      fileName: "deno.jsonc",
      config: {
        unstable: ["kv"],
        deploy: {
          org: "ubiquity-os",
          app: "example",
          entrypoint: "src/worker.ts",
        },
      },
    });

    assertEquals(staged.fileName, "deno.jsonc");
    const stagedContent = JSON.parse(await Deno.readTextFile(configPath));
    assertEquals(stagedContent.unstable, ["kv"]);
    assertEquals(stagedContent.deploy, {
      org: "ubiquity-os",
      app: "example",
      entrypoint: "src/worker.ts",
    });

    await staged.restore();
    assertEquals(await Deno.readTextFile(configPath), originalContent);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});

Deno.test("stageWorkspaceDeployConfig removes a generated config file when none existed before", async () => {
  const repoRoot = await Deno.makeTempDir();
  const configPath = join(repoRoot, "deno.jsonc");

  try {
    const staged = await stageWorkspaceDeployConfig({
      repoRoot,
      fileName: null,
      config: {
        unstable: ["kv"],
      },
    });

    assertEquals(staged.fileName, "deno.jsonc");
    assertEquals(JSON.parse(await Deno.readTextFile(configPath)), {
      unstable: ["kv"],
    });

    await staged.restore();

    let exists = true;
    try {
      await Deno.stat(configPath);
    } catch (caughtError) {
      if (caughtError instanceof Deno.errors.NotFound) {
        exists = false;
      } else {
        throw caughtError;
      }
    }
    assertEquals(exists, false);
  } finally {
    await Deno.remove(repoRoot, { recursive: true });
  }
});
