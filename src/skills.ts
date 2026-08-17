/**
 * Load and parse bundled GrowthBook skills (top-level skill tree copied at build time).
 *
 * Layout mirrors the skills repo:
 *
 *   server/skills/
 *     feature-flags/
 *       SKILL.md
 *       references/
 *         flag-create.md
 *         ...
 *     experiments/
 *       ...
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type SkillKind = "entrypoint" | "reference";

export interface SkillSummary {
  name: string;
  description: string;
}

export interface Skill extends SkillSummary {
  /** Full markdown body including frontmatter (already MCP-adapted at bundle time). */
  content: string;
  kind: SkillKind;
  /** Top-level skill directory name (e.g. feature-flags or flag-create). */
  entrypoint: string;
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

/**
 * Normalize a growthbook_read_skill name to a bundle path key.
 * Accepts optional `.md`; rejects empty names and path traversal.
 */
export function normalizeSkillPath(name: string): string | null {
  const trimmed = name.trim().replace(/\\/g, "/").replace(/\.md$/i, "");
  if (!trimmed) return null;
  if (trimmed.startsWith("/") || trimmed.split("/").includes("..")) {
    return null;
  }
  return trimmed;
}

let cachedSkills: Skill[] | null = null;

function loadSkillFile(
  filePath: string,
  name: string,
  kind: SkillKind,
  entrypoint: string
): Skill {
  const content = readFileSync(filePath, "utf8");
  const meta = parseFrontmatter(content);
  const description =
    meta.description ||
    `GrowthBook skill: ${name}. Call growthbook_read_skill for the full workflow.`;

  return { name, description, content, kind, entrypoint };
}

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

  for (const entrypoint of readdirSync(skillsDir).sort()) {
    const skillDir = join(skillsDir, entrypoint);
    if (!statSync(skillDir).isDirectory()) continue;

    const skillFile = join(skillDir, "SKILL.md");
    if (!existsSync(skillFile)) continue;

    skills.push(
      loadSkillFile(skillFile, entrypoint, "entrypoint", entrypoint)
    );

    const refsDir = join(skillDir, "references");
    if (!existsSync(refsDir) || !statSync(refsDir).isDirectory()) continue;

    for (const file of readdirSync(refsDir).sort()) {
      if (!file.endsWith(".md")) continue;
      const reference = file.replace(/\.md$/i, "");
      const name = `${entrypoint}/references/${reference}`;
      skills.push(
        loadSkillFile(join(refsDir, file), name, "reference", entrypoint)
      );
    }
  }

  cachedSkills = skills;
  return skills;
}

/** Top-level entry points only; referenced workflows load via read_skill. */
export function listSkillSummaries(): SkillSummary[] {
  return loadSkills()
    .filter((s) => s.kind === "entrypoint")
    .map(({ name, description }) => ({ name, description }));
}

export function getSkill(name: string): Skill | undefined {
  const pathKey = normalizeSkillPath(name);
  if (!pathKey) return undefined;
  return loadSkills().find((s) => s.name === pathKey);
}

/** Content to return from growthbook_read_skill (bridge note + bundled markdown). */
export function formatSkillForMcp(skill: Skill): string {
  return GB_CALL_BRIDGE_NOTE + skill.content;
}

/** Bridge note prepended when returning skill content via growthbook_read_skill. */
export const GB_CALL_BRIDGE_NOTE = `> **MCP note:** This skill's workflow examples use \`gb-call <METHOD> <PATH> [body]\`.
> In this MCP server, map GET to \`growthbook_api_read\` and POST/PUT/PATCH/DELETE to \`growthbook_api_write\`
> with the same path and optional JSON body string. Do not shell out to \`gb-call\`.

`;

/** Test helper — clears the in-memory skill cache. */
export function resetSkillsCache(): void {
  cachedSkills = null;
}
