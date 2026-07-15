/**
 * Load and parse bundled GrowthBook skills (SKILL.md files copied at build time).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface SkillSummary {
  name: string;
  description: string;
}

export interface Skill extends SkillSummary {
  /** Full markdown body including frontmatter */
  content: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Bundled skills live next to the compiled JS at server/skills/.
 * During `tsc` alone (before bundle-skills), the dir may be missing — callers
 * that need skills should treat that as an empty list / missing skill.
 */
export function getSkillsDir(): string {
  return join(__dirname, "skills");
}

/**
 * Minimal YAML frontmatter parser for the fields we need.
 * Expects:
 * ---
 * name: foo
 * description: bar...
 * ---
 *
 * Description may be a single line. Multi-line YAML values are not supported.
 */
export function parseFrontmatter(content: string): {
  name?: string;
  description?: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return {};
  }

  const block = match[1];
  const result: { name?: string; description?: string } = {};

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith("#")) continue;

    const colon = line.indexOf(":");
    if (colon <= 0) continue;

    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();

    // Strip matching single/double quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key === "name" || key === "description") {
      result[key] = value;
    }
  }

  return result;
}

let cachedSkills: Skill[] | null = null;

export function loadSkills(): Skill[] {
  if (cachedSkills !== null) {
    return cachedSkills;
  }

  const skillsDir = getSkillsDir();
  if (!existsSync(skillsDir)) {
    cachedSkills = [];
    return cachedSkills;
  }

  const skills: Skill[] = [];

  for (const file of readdirSync(skillsDir).sort()) {
    if (!file.endsWith(".md")) continue;

    const content = readFileSync(join(skillsDir, file), "utf8");
    const meta = parseFrontmatter(content);
    const nameFromFile = file.replace(/\.md$/, "");
    const name = meta.name || nameFromFile;
    const description =
      meta.description ||
      `GrowthBook skill: ${name}. Call read_skill for the full workflow.`;

    skills.push({ name, description, content });
  }

  cachedSkills = skills;
  return skills;
}

export function listSkillSummaries(): SkillSummary[] {
  return loadSkills().map(({ name, description }) => ({ name, description }));
}

export function getSkill(name: string): Skill | undefined {
  return loadSkills().find((s) => s.name === name);
}

/** Bridge note prepended when returning skill content via read_skill. */
export const GB_CALL_BRIDGE_NOTE = `> **MCP note:** This skill's workflow examples use \`gb-call <METHOD> <PATH> [body]\`.
> In this MCP server, use the \`call_api\` tool instead with the same method, path, and optional JSON body string.
> Do not shell out to \`gb-call\`.

`;
