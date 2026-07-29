#!/usr/bin/env node
// Copies each skills/<name>/SKILL.md from the canonical skills repo into
// server/skills/<name>.md.
//
// Source path resolution (first match wins):
//   1. SKILLS_SRC env var
//   2. ../skills (sibling of this repo)
//
// Expects the skills repo layout: <src>/skills/<name>/SKILL.md

import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const outDir = join(repoRoot, "server", "skills");

function resolveSkillsSrc() {
  if (process.env.SKILLS_SRC) {
    return resolve(process.env.SKILLS_SRC);
  }
  return resolve(repoRoot, "..", "skills");
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

  let count = 0;
  for (const name of readdirSync(skillsDir)) {
    const skillDir = join(skillsDir, name);
    if (!statSync(skillDir).isDirectory()) continue;

    const skillFile = join(skillDir, "SKILL.md");
    if (!existsSync(skillFile)) {
      console.warn(`Skipping ${name}: no SKILL.md`);
      continue;
    }

    const dest = join(outDir, `${name}.md`);
    cpSync(skillFile, dest);
    count += 1;
  }

  if (count === 0) {
    console.error(`No SKILL.md files found under ${skillsDir}`);
    process.exit(1);
  }

  console.log(`Bundled ${count} skill(s) from ${skillsDir} → ${outDir}`);
}

main();
