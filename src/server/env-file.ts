import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function loadLocalEnv() {
  if (!existsSync(".env")) return;
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

export function writeEnvValues(updates: Record<string, string>) {
  const original = existsSync(".env") ? readFileSync(".env", "utf8") : "";
  const lines = original.length > 0 ? original.split("\n") : [];
  const seen = new Set<string>();
  const next = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.indexOf("=") === -1) return line;
    const key = trimmed.slice(0, trimmed.indexOf("=")).trim();
    if (!(key in updates)) return line;
    seen.add(key);
    return `${key}=${updates[key]}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) next.push(`${key}=${value}`);
  }
  const text = next.join("\n");
  writeFileSync(".env", text.endsWith("\n") ? text : `${text}\n`);
  for (const [key, value] of Object.entries(updates)) {
    process.env[key] = value;
  }
}
