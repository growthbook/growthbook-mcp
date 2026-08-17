#!/usr/bin/env node
// Copies the skills repo top-level layout into server/skills/, preserving structure:
//
//   <src>/skills/<skill>/SKILL.md
//   <src>/skills/<skill>/references/*.md
//     → server/skills/<skill>/SKILL.md
//     → server/skills/<skill>/references/*.md
//
// Adapts content for MCP at bundle time:
//   - skips per-skill scripts/ (gb-call symlinks)
//   - rewrites `` `references/foo.md` `` → qualified growthbook_read_skill paths
//
// Source path resolution (first match wins):
//   1. SKILLS_SRC env var
//   2. ../skills (sibling of this repo)

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

function resolveSkillsSrc() {
  if (process.env.SKILLS_SRC) {
    return resolve(process.env.SKILLS_SRC);
  }
  return resolve(repoRoot, "..", "skills");
}

function writeAdaptedMarkdown(srcPath, destPath, entrypoint) {
  const raw = readFileSync(srcPath, "utf8");
  writeFileSync(destPath, rewriteReferencePaths(raw, entrypoint), "utf8");
}

function main() {
  const skillsRepo = resolveSkillsSrc();
  const skillsDir = join(skillsRepo, "skills");

  if (!existsSync(skillsDir)) {
    console.error(
      `Skills source not found at ${skillsDir}.\n` +
        `Set SKILLS_SRC to the path of the growthbook/skills checkout, or clone it as a sibling of this repo.`
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

  for (const name of readdirSync(skillsDir)) {
    const skillDir = join(skillsDir, name);
    if (!statSync(skillDir).isDirectory()) continue;

    const skillFile = join(skillDir, "SKILL.md");
    if (!existsSync(skillFile)) {
      console.warn(`Skipping ${name}: no SKILL.md`);
      continue;
    }

    const destDir = join(outDir, name);
    mkdirSync(destDir, { recursive: true });
    writeAdaptedMarkdown(skillFile, join(destDir, "SKILL.md"), name);
    entrypoints += 1;

    const refsDir = join(skillDir, "references");
    if (existsSync(refsDir) && statSync(refsDir).isDirectory()) {
      const destRefs = join(destDir, "references");
      mkdirSync(destRefs, { recursive: true });
      for (const file of readdirSync(refsDir)) {
        if (!file.endsWith(".md")) continue;
        writeAdaptedMarkdown(join(refsDir, file), join(destRefs, file), name);
        references += 1;
      }
    }
  }

  if (entrypoints === 0) {
    console.error(`No SKILL.md files found under ${skillsDir}`);
    process.exit(1);
  }

  console.log(
    `Bundled ${entrypoints} top-level skill(s) and ${references} reference(s) from ${skillsDir} → ${outDir}`
  );
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main();
}
