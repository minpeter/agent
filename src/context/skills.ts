import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { glob } from "glob";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "../skills");

interface SkillMetadata {
  name: string;
  description: string;
  triggers?: string[];
  version?: string;
}

function parseFrontmatter(content: string): SkillMetadata | null {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return null;
  }

  const frontmatter = match[1];
  const metadata: Partial<SkillMetadata> = {};

  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  if (nameMatch) {
    metadata.name = nameMatch[1].trim();
  }

  const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
  if (descMatch) {
    metadata.description = descMatch[1].trim();
  }

  const versionMatch = frontmatter.match(/^version:\s*(.+)$/m);
  if (versionMatch) {
    metadata.version = versionMatch[1].trim();
  }

  const triggersMatch = frontmatter.match(/^triggers:\s*\n((?:  - .+\n?)+)/m);
  if (triggersMatch) {
    metadata.triggers = triggersMatch[1]
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => line.replace(/^\s*-\s*/, "").trim());
  }

  if (!metadata.name || !metadata.description) {
    return null;
  }

  return metadata as SkillMetadata;
}

export async function loadSkillsMetadata(): Promise<string> {
  try {
    const skillFiles = await glob("*.md", {
      cwd: SKILLS_DIR,
      absolute: false,
    });

    if (skillFiles.length === 0) {
      return "";
    }

    const metadataList = await Promise.all(
      skillFiles.map(async (file) => {
        const filePath = join(SKILLS_DIR, file);
        const content = await readFile(filePath, "utf-8");
        const metadata = parseFrontmatter(content);

        if (!metadata) {
          return null;
        }

        const skillId = file.replace(".md", "");
        return { skillId, metadata };
      })
    );

    const validMetadata = metadataList.filter(
      (item): item is { skillId: string; metadata: SkillMetadata } =>
        item !== null
    );

    if (validMetadata.length === 0) {
      return "";
    }

    const skillDescriptions = validMetadata
      .map(
        ({ skillId, metadata }) =>
          `- **${metadata.name}** (\`${skillId}\`): ${metadata.description}`
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
