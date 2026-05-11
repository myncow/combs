/**
 * List which generation-related env keys are present (names only, no values).
 * Run: pnpm tsx scripts/measure-env-check.ts
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { existsSync } from "node:fs";

loadEnv({ path: resolve(process.cwd(), ".env") });
const vercelEnv = resolve(process.cwd(), ".vercel/.env.production.local");
if (existsSync(vercelEnv)) {
  loadEnv({ path: vercelEnv });
}
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

const relevant = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "OPENROUTER_FALLBACK_MODEL",
  "OPENROUTER_RESEARCH_MODEL",
  "OPENROUTER_SUGGEST_MODEL",
  "SERPAPI_API_KEY",
  "SERP_API_KEY",
  "DATABASE_URL",
  "DATABASE_URL_UNPOOLED",
  "LATTICE_CELLS_BATCH_CONCURRENCY",
  "LATTICE_SERP_PROBE_MAX_CALLS",
  "LATTICE_SERP_REFERENCE_MAX_CALLS",
];

console.log("Generation-related env keys present:");
for (const k of relevant) {
  console.log(`  ${k.padEnd(40)} ${process.env[k] ? "SET" : "—"}`);
}

console.log("\nAll process.env keys matching /openrouter|openai|serp|gemini|claude/i:");
for (const k of Object.keys(process.env)) {
  if (/openrouter|openai|serp|gemini|claude|anthropic/i.test(k)) {
    console.log(`  ${k}`);
  }
}
