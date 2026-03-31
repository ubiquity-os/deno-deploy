export function notice(message) {
  console.log(`::notice::${message}`);
}

export function warning(message) {
  console.log(`::warning::${message}`);
}

export function error(message) {
  console.log(`::error::${message}`);
}

export function info(message) {
  console.log(message);
}

export async function setOutput(name, value) {
  const outputPath = Deno.env.get("GITHUB_OUTPUT");
  if (!outputPath) {
    return;
  }

  const serialized = String(value ?? "");
  const delimiter = `EOF_${crypto.randomUUID()}`;
  const block = `${name}<<${delimiter}\n${serialized}\n${delimiter}\n`;
  await Deno.writeTextFile(outputPath, block, { append: true });
}

export async function appendSummary(markdown) {
  const summaryPath = Deno.env.get("GITHUB_STEP_SUMMARY");
  if (!summaryPath) {
    return;
  }

  const content = markdown.endsWith("\n") ? markdown : `${markdown}\n`;
  await Deno.writeTextFile(summaryPath, content, { append: true });
}
