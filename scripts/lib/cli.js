export function parseArgs(argv) {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const stripped = token.slice(2);
    const equalsIndex = stripped.indexOf("=");
    if (equalsIndex !== -1) {
      const key = stripped.slice(0, equalsIndex);
      const value = stripped.slice(equalsIndex + 1);
      args[key] = value;
      continue;
    }

    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[stripped] = next;
      index += 1;
      continue;
    }

    args[stripped] = true;
  }

  return args;
}

export function getStringOption(args, name, envName, fallback = "") {
  const raw = args[name] ?? (envName ? Deno.env.get(envName) : undefined);
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }
  return String(raw);
}

export function getBooleanOption(args, name, envName, fallback = false) {
  const raw = args[name] ?? (envName ? Deno.env.get(envName) : undefined);
  if (raw === undefined || raw === null || raw === "") {
    return fallback;
  }

  const normalized = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function getIntegerOption(args, name, envName, fallback) {
  const raw = getStringOption(args, name, envName, "");
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return parsed;
}

export function requireString(name, value) {
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

export function slugify(value) {
  let slug = String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .replace(/-{2,}/g, "-");

  if (!slug) {
    slug = "app";
  }

  while (slug.length < 3) {
    slug += "app";
  }

  return slug;
}

export function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
