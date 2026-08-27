#!/usr/bin/env node
// Copies the skills repo top-level layout into server/skills/, preserving structure:
//
//   <src>/skills/<skill>/SKILL.md
//   <src>/skills/<skill>/references/*.md
//     → server/skills/<skill>/SKILL.md
//     → server/skills/<skill>/references/*.md
//
// The workflow content is 1:1 with the skills repo — a new domain added upstream
// flows through here automatically:
//   - skips per-skill scripts/ (gb-call symlinks)
//   - skips BLOCKED_SKILLS (see below)
//   - rewrites `` `references/foo.md` `` → qualified growthbook_read_skill paths
//
// Source path resolution (first match wins):
//   1. SKILLS_SRC env var
//   2. agent-skills.local.json (gitignored; see .example)
//   3. skills-src/ (vendored by CI and the Docker build)
//
// There is deliberately no implicit sibling lookup: `../skills` resolves to
// whatever happens to be there — a stale branch, an unrelated directory — and
// silently disagrees with the pinned commit CI builds from.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outDir = join(repoRoot, "server", "skills");

// gb-setup configures the gb-call shell adapter, which this server does not use.
// Use a blocklist so new skills flow through automatically.
export const BLOCKED_SKILLS = new Set(["gb-setup"]);

/**
 * Rewrite filesystem-relative `` `references/foo.md` `` links (skills-repo
 * convention) into qualified read_skill paths for the given top-level skill.
 * Tool name is omitted — agents already know to call growthbook_read_skill.
 */
export function rewriteReferencePaths(content, entrypoint) {
  return content.replace(
    /`references\/([^`\n]+?)\.md`/g,
    (_match, file) => `\`${entrypoint}/references/${file}\``
  );
}

const SKILLS_REPOSITORY = "https://github.com/growthbook/skills";
const LOCAL_CONFIG_NAME = "agent-skills.local.json";
const VENDORED_DIR = "skills-src";

function resolveSkillsSrc() {
  if (process.env.SKILLS_SRC) {
    return resolve(process.env.SKILLS_SRC);
  }

  const localConfig = join(repoRoot, LOCAL_CONFIG_NAME);
  if (existsSync(localConfig)) {
    try {
      const configuredPath = JSON.parse(
        readFileSync(localConfig, "utf8")
      ).path;
      if (typeof configuredPath === "string" && configuredPath.trim()) {
        return resolve(repoRoot, configuredPath.trim());
      }
    } catch {
      // Report the invalid config below.
    }
    console.error(
      `${LOCAL_CONFIG_NAME} must be { "path": "<${SKILLS_REPOSITORY} checkout>" }.`
    );
    process.exit(1);
  }

  return resolve(repoRoot, VENDORED_DIR);
}

function writeSkillMarkdown(srcPath, destPath, entrypoint) {
  const content = readFileSync(srcPath, "utf8");
  writeFileSync(destPath, rewriteReferencePaths(content, entrypoint), "utf8");
}

function main() {
  const skillsRepo = resolveSkillsSrc();
  const skillsDir = join(skillsRepo, "skills");

  if (!existsSync(skillsDir)) {
    console.error(
      `Skills source not found at ${skillsDir}.\n` +
        `Set SKILLS_SRC, configure ${LOCAL_CONFIG_NAME}, or provide ${VENDORED_DIR}/.`
    );
    process.exit(1);
  }

  mkdirSync(outDir, { recursive: true });

  // Clear previous bundle so removed skills don't linger
  for (const entry of readdirSync(outDir)) {
    rmSync(join(outDir, entry), { recursive: true, force: true });
  }

  let entrypoints = 0;
  let references = 0;
  const skipped = [];

  for (const name of readdirSync(skillsDir)) {
    const skillDir = join(skillsDir, name);
    if (!statSync(skillDir).isDirectory()) continue;

    const skillFile = join(skillDir, "SKILL.md");
    if (!existsSync(skillFile)) {
      console.warn(`Skipping ${name}: no SKILL.md`);
      continue;
    }

    if (BLOCKED_SKILLS.has(name)) {
      skipped.push(name);
      continue;
    }

    const destDir = join(outDir, name);
    mkdirSync(destDir, { recursive: true });
    writeSkillMarkdown(skillFile, join(destDir, "SKILL.md"), name);
    entrypoints += 1;

    const refsDir = join(skillDir, "references");
    if (existsSync(refsDir) && statSync(refsDir).isDirectory()) {
      const destRefs = join(destDir, "references");
      mkdirSync(destRefs, { recursive: true });
      for (const file of readdirSync(refsDir)) {
        if (!file.endsWith(".md")) continue;
        writeSkillMarkdown(join(refsDir, file), join(destRefs, file), name);
        references += 1;
      }
    }
  }

  if (entrypoints === 0) {
    console.error(`No SKILL.md files found under ${skillsDir}`);
    process.exit(1);
  }

  const skippedNote =
    skipped.length > 0 ? ` (blocked: ${skipped.join(", ")})` : "";
  console.log(
    `Bundled ${entrypoints} top-level skill(s) and ${references} reference(s) from ${skillsDir} → ${outDir}${skippedNote}`
  );
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main();
}
