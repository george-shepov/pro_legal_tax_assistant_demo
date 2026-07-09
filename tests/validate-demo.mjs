import { readFile, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const scenarioPaths = [
  "scenarios/grounded-research.json",
  "scenarios/document-intake.json",
  "scenarios/docket-review.json",
  "scenarios/tax-notice.json"
];
const allowedTypes = new Set([
  "user_message", "agent_message", "status", "agent_route", "tool_start",
  "tool_complete", "document_upload", "document_parsed", "citation",
  "generated_file", "metric", "warning", "call_to_action"
]);
const requiredFiles = [
  "index.html", "styles.css", "app.js", "config.json", "assets/mark.svg",
  ...scenarioPaths
];

for (const path of requiredFiles) await access(join(root, path));

const config = JSON.parse(await readFile(join(root, "config.json"), "utf8"));
if (typeof config.contactEmail !== "string" || typeof config.formEndpoint !== "string") {
  throw new Error("config.json contactEmail/formEndpoint must be strings");
}

for (const path of scenarioPaths) {
  const scenario = JSON.parse(await readFile(join(root, path), "utf8"));
  for (const field of ["id", "title", "shortTitle", "description", "matter", "events"]) {
    if (!(field in scenario)) throw new Error(`${path}: missing ${field}`);
  }
  if (!Array.isArray(scenario.events) || scenario.events.length === 0) {
    throw new Error(`${path}: events must be a non-empty array`);
  }
  for (const [index, event] of scenario.events.entries()) {
    if (!allowedTypes.has(event.type)) throw new Error(`${path}:${index}: invalid type`);
    if (!Number.isFinite(event.delay) || event.delay < 0) throw new Error(`${path}:${index}: invalid delay`);
    if (event.type === "generated_file") {
      if (!event.path?.startsWith("artifacts/")) throw new Error(`${path}:${index}: unsafe artifact path`);
      await access(join(root, event.path));
    }
  }
}

const appSource = await readFile(join(root, "app.js"), "utf8");
if (/\binnerHTML\b/.test(appSource)) throw new Error("app.js must not use innerHTML");
if (/\bon[a-z]+\s*=/.test(await readFile(join(root, "index.html"), "utf8"))) {
  throw new Error("index.html must not contain inline event handlers");
}

console.log(`Validated ${scenarioPaths.length} scenarios and all referenced static artifacts.`);
