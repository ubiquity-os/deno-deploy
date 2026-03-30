import { encodeBase64 } from "jsr:@std/encoding@1.0.10/base64";
import { join } from "jsr:@std/path@1.1.2";

function decodeNullDelimited(stdout) {
  return new TextDecoder().decode(stdout)
    .split("\0")
    .filter(Boolean);
}

export async function listTrackedFiles(repoRoot) {
  const command = new Deno.Command("git", {
    args: ["-C", repoRoot, "ls-files", "-z"],
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await command.output();

  if (code !== 0) {
    const message = new TextDecoder().decode(stderr).trim();
    throw new Error(
      `Unable to list git-tracked files in '${repoRoot}'. Ensure actions/checkout ran before provision. ${message}`,
    );
  }

  return decodeNullDelimited(stdout)
    .filter((path) => !path.startsWith("dist/"))
    .sort((left, right) => left.localeCompare(right));
}

export async function collectAssets(repoRoot) {
  const trackedFiles = await listTrackedFiles(repoRoot);
  const assets = {};

  for (const relativePath of trackedFiles) {
    const absolutePath = join(repoRoot, relativePath);
    const info = await Deno.lstat(absolutePath);

    if (info.isSymlink) {
      assets[relativePath] = {
        kind: "symlink",
        target: await Deno.readLink(absolutePath),
      };
      continue;
    }

    if (!info.isFile) {
      continue;
    }

    const bytes = await Deno.readFile(absolutePath);
    assets[relativePath] = {
      kind: "file",
      encoding: "base64",
      content: encodeBase64(bytes),
    };
  }

  return {
    assetCount: Object.keys(assets).length,
    assets,
    trackedFiles,
  };
}
