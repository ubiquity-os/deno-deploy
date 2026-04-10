import { assertEquals } from "jsr:@std/assert@1.0.13";
import { join } from "jsr:@std/path@1.1.2";
import {
  buildConfig,
  collectBuildEnvironmentVariables,
  parseEnvFileContent,
  stageWorkspaceDeployConfig,
} from "./provision.js";

Deno.test("buildConfig preserves source config, injects manifest build commands, and always enables kv by default", () => {
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
  assertEquals(config.install, "deno install");
  assertEquals(
    config.build,
    "deno x -y @ubiquity-os/plugin-manifest-tool@latest --repository ubiquity-os/example --production-branch main",
  );
  assertEquals(config.predeploy, "deno install");
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

Deno.test("buildConfig skips manifest build commands when buildManifest is disabled", () => {
  const config = buildConfig(
    "src/worker.ts",
    "ubiquity-os/example",
    {
      imports: {
        "foo/": "./foo/",
      },
      unstable: ["bare-node-builtins"],
      build: "deno task build",
      predeploy: "deno task predeploy",
      runtime: {
        custom: "value",
      },
    },
    false,
  );

  assertEquals(config.imports, {
    "foo/": "./foo/",
  });
  assertEquals(config.build, "deno task build");
  assertEquals(config.predeploy, "deno task predeploy");
  assertEquals(config.install, undefined);
  assertEquals(config.unstable, ["bare-node-builtins", "kv"]);
  assertEquals(config.runtime, {
    custom: "value",
    type: "dynamic",
    entrypoint: "src/worker.ts",
  });
});

Deno.test("collectBuildEnvironmentVariables omits manifest-specific variables when buildManifest is disabled", () => {
  assertEquals(
    collectBuildEnvironmentVariables({
      repository: "ubiquity-os/example",
      refName: "feature/test",
      buildManifest: false,
    }),
    [
      {
        key: "REF_NAME",
        value: "feature/test",
        secret: false,
        contexts: ["build"],
      },
    ],
  );
});

Deno.test("parseEnvFileContent preserves escaped backslashes before newline decoding", () => {
  const parsed = parseEnvFileContent(String.raw`ESCAPED=\\n
NEWLINE=\n
QUOTED=\"hello\"`);

  assertEquals(parsed, {
    ESCAPED: String.raw`\n`,
    NEWLINE: "\n",
    QUOTED: '"hello"',
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
