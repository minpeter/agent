import { existsSync } from "node:fs";
import { readdir, readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { cwd } from "node:process";
import { fileURLToPath } from "node:url";
import { glob } from "glob";
import { parse as parseYAML } from "yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUNDLED_SKILLS_DIR = join(__dirname, "../skills");

// ============================================================================
// Types
// ============================================================================

export interface SkillInfo {
  id: string;
  name: string;
  description: string;
  version?: string;
  format: "legacy" | "v2";
  path: string;
  source: "bundled" | "global" | "project";
  dirPath?: string; // Only for v2 skills
}

interface SkillFrontmatter {
  name: string;
  description: string;
  version?: string;
  triggers?: string[];
  license?: string;
  compatibility?: string;
  metadata?: {
    author?: string;
    version?: string;
    [key: string]: unknown;
  };
  "allowed-tools"?: string;
}

// ============================================================================
// Legacy Format (*.md with regex parsing)
// ============================================================================

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---/;
const NAME_REGEX = /^name:\s*(.+)$/m;
const DESC_REGEX = /^description:\s*(.+)$/m;
const VERSION_REGEX = /^version:\s*(.+)$/m;
const TRIGGERS_REGEX = /^triggers:\s*\n((?:\s{2}- .+\n?)+)/m;
const LIST_ITEM_REGEX = /^\s*-\s*/;
const SKILL_NAME_REGEX = /^[a-z0-9-]+$/;

function parseFrontmatterRegex(content: string): SkillFrontmatter | null {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) {
    return null;
  }

  const frontmatter = match[1];
  const metadata: Partial<SkillFrontmatter> = {};

  const nameMatch = frontmatter.match(NAME_REGEX);
  if (nameMatch) {
    metadata.name = nameMatch[1].trim();
  }

  const descMatch = frontmatter.match(DESC_REGEX);
  if (descMatch) {
    metadata.description = descMatch[1].trim();
  }

  const versionMatch = frontmatter.match(VERSION_REGEX);
  if (versionMatch) {
    metadata.version = versionMatch[1].trim();
  }

  const triggersMatch = frontmatter.match(TRIGGERS_REGEX);
  if (triggersMatch) {
    metadata.triggers = triggersMatch[1]
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => line.replace(LIST_ITEM_REGEX, "").trim());
  }

  if (!(metadata.name && metadata.description)) {
    return null;
  }
  return metadata as SkillFrontmatter;
}

async function loadLegacySkills(
  dirPath: string,
  source: "bundled" | "global" | "project"
): Promise<SkillInfo[]> {
  try {
    const skillFiles = await glob("*.md", { cwd: dirPath, absolute: false });
    if (skillFiles.length === 0) {
      return [];
    }

    const skills = await Promise.all(
      skillFiles.map(async (file) => {
        const filePath = join(dirPath, file);
        try {
          const content = await readFile(filePath, "utf-8");
          const metadata = parseFrontmatterRegex(content);
          if (!metadata) {
            return null;
          }

          const skillId = file.replace(".md", "");
          return {
            id: skillId,
            name: metadata.name,
            description: metadata.description,
            version: metadata.version,
            format: "legacy" as const,
            path: filePath,
            source,
          };
        } catch {
          return null;
        }
      })
    );

    return skills.filter((skill) => skill !== null) as SkillInfo[];
  } catch {
    return [];
  }
}

// ============================================================================
// V2 Format (SKILL.md with YAML parsing)
// ============================================================================

function parseFrontmatterYAML(content: string): SkillFrontmatter | null {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) {
    return null;
  }

  try {
    return parseYAML(match[1]) as SkillFrontmatter;
  } catch {
    return null;
  }
}

function validateSkillName(name: string): boolean {
  if (!name || typeof name !== "string") {
    return false;
  }
  if (name.length < 1 || name.length > 64) {
    return false;
  }
  if (!SKILL_NAME_REGEX.test(name)) {
    return false;
  }
  if (name.startsWith("-") || name.endsWith("-")) {
    return false;
  }
  return true;
}

function isSkillDirectory(dirPath: string): boolean {
  return existsSync(join(dirPath, "SKILL.md"));
}

async function discoverSkillDirectories(searchPath: string): Promise<string[]> {
  try {
    const entries = await readdir(searchPath, { withFileTypes: true });
    const skillDirs: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = join(searchPath, entry.name);
        if (isSkillDirectory(dirPath)) {
          skillDirs.push(dirPath);
        }
      }
    }

    return skillDirs;
  } catch {
    return [];
  }
}

async function loadSkillV2(
  dirPath: string,
  source: "bundled" | "global" | "project"
): Promise<SkillInfo | null> {
  try {
    const skillPath = join(dirPath, "SKILL.md");
    const content = await readFile(skillPath, "utf-8");
    const frontmatter = parseFrontmatterYAML(content);

    if (!frontmatter) {
      return null;
    }

    const dirName = basename(dirPath);
    if (!validateSkillName(frontmatter.name)) {
      return null;
    }
    if (frontmatter.name !== dirName) {
      return null;
    }
    if (!frontmatter.description || frontmatter.description.length > 1024) {
      return null;
    }

    return {
      id: frontmatter.name,
      name: frontmatter.name,
      description: frontmatter.description,
      version: frontmatter.metadata?.version || frontmatter.version,
      format: "v2",
      path: skillPath,
      dirPath,
      source,
    };
  } catch {
    return null;
  }
}

async function loadV2Skills(
  bundledPath: string,
  projectPath?: string
): Promise<SkillInfo[]> {
  const globalPath = join(homedir(), ".claude", "skills");

  const [projectDirs, globalDirs, bundledDirs] = await Promise.all([
    projectPath ? discoverSkillDirectories(projectPath) : Promise.resolve([]),
    discoverSkillDirectories(globalPath),
    discoverSkillDirectories(bundledPath),
  ]);

  const [projectSkills, globalSkills, bundledSkills] = await Promise.all([
    Promise.all(projectDirs.map((dir) => loadSkillV2(dir, "project"))),
    Promise.all(globalDirs.map((dir) => loadSkillV2(dir, "global"))),
    Promise.all(bundledDirs.map((dir) => loadSkillV2(dir, "bundled"))),
  ]);

  const allSkills = [
    ...projectSkills.filter((s): s is SkillInfo => s !== null),
    ...globalSkills.filter((s): s is SkillInfo => s !== null),
    ...bundledSkills.filter((s): s is SkillInfo => s !== null),
  ];

  // Deduplicate by ID and real path (symlink detection)
  const seen = new Map<string, SkillInfo>();
  const seenRealPaths = new Set<string>();
  const realpathCache = new Map<string, string>();

  for (const skill of allSkills) {
    if (!skill.dirPath) {
      seen.set(skill.id, skill);
      continue;
    }

    // Resolve real path for symlink detection
    let realPath: string;
    try {
      const cached = realpathCache.get(skill.dirPath);
      if (cached) {
        realPath = cached;
      } else {
        realPath = await realpath(skill.dirPath);
        realpathCache.set(skill.dirPath, realPath);
      }
    } catch {
      realPath = skill.dirPath;
    }

    if (seenRealPaths.has(realPath)) {
      continue;
    }
    seenRealPaths.add(realPath);

    const existing = seen.get(skill.id);
    if (!existing) {
      seen.set(skill.id, skill);
      continue;
    }

    // Priority: project > global > bundled
    const priority = { project: 3, global: 2, bundled: 1 };
    if (priority[skill.source] > priority[existing.source]) {
      seen.set(skill.id, skill);
    }
  }

  return Array.from(seen.values());
}

// ============================================================================
// Public API
// ============================================================================

export async function loadAllSkills(): Promise<SkillInfo[]> {
  const projectSkillsPath = join(cwd(), ".claude", "skills");
  const globalSkillsPath = join(homedir(), ".claude", "skills");

  const [bundledLegacy, globalLegacy, projectLegacy, v2Skills] =
    await Promise.all([
      loadLegacySkills(BUNDLED_SKILLS_DIR, "bundled"),
      loadLegacySkills(globalSkillsPath, "global"),
      loadLegacySkills(projectSkillsPath, "project"),
      loadV2Skills(BUNDLED_SKILLS_DIR, projectSkillsPath),
    ]);

  const allLegacy = [...bundledLegacy, ...globalLegacy, ...projectLegacy];
  const skillsMap = new Map<string, SkillInfo>();

  // Add legacy skills first
  for (const skill of allLegacy) {
    skillsMap.set(skill.id, skill);
  }

  // Add v2 skills (v2 takes priority over legacy if same ID)
  for (const skill of v2Skills) {
    skillsMap.set(skill.id, skill);
  }

  return Array.from(skillsMap.values());
}

export async function loadSkillById(
  skillId: string
): Promise<{ content: string; info: SkillInfo } | null> {
  const allSkills = await loadAllSkills();
  const skill = allSkills.find((s) => s.id === skillId);

  if (!skill) {
    return null;
  }

  try {
    const content = await readFile(skill.path, "utf-8");
    return { content, info: skill };
  } catch {
    return null;
  }
}

export async function loadSkillsMetadata(): Promise<string> {
  try {
    const skills = await loadAllSkills();
    if (skills.length === 0) {
      return "";
    }

    const skillDescriptions = skills
      .map(
        (skill) => `- **${skill.name}** (\`${skill.id}\`): ${skill.description}`
      )
      .join("\n");

    return `

## Available Skills

The following specialized skills are available. When you need detailed instructions for a specific workflow, use the \`load_skill\` tool with the skill ID.

${skillDescriptions}

**How to use skills:**
1. Identify which skill matches your current task based on the descriptions above
2. Use \`load_skill\` tool with the skill ID (e.g., \`load_skill("git-workflow")\`)
3. Follow the detailed instructions provided by the skill
`;
  } catch {
    return "";
  }
}
