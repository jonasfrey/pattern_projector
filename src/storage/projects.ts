/** Project storage: save/load/list/delete project JSON files. */

import { config } from "../server/config.ts";
import { logger } from "../utils/logger.ts";

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  tags: string[];
  created: string;
  modified: string;
}

export interface Project extends ProjectSummary {
  patternId: string;
  pattern: unknown;
  settings: unknown;
}

function projectFile(id: string): string {
  return `${config.projectPath}/${id}.json`;
}

function makeId(name: string): string {
  const slug = name.replace(/[^\w-]/g, "_").slice(0, 40) || "project";
  return `${slug}_${Date.now()}`;
}

export async function saveProject(
  input: Omit<Project, "id" | "created" | "modified"> & {
    id?: string;
  },
): Promise<Project> {
  const now = new Date().toISOString();
  let id = input.id;
  let created = now;

  if (id) {
    try {
      const existing = JSON.parse(await Deno.readTextFile(projectFile(id)));
      created = existing.created ?? now;
    } catch {
      // new project under a provided id
    }
  } else {
    id = makeId(input.name);
  }

  const project: Project = {
    id,
    name: input.name,
    description: input.description ?? "",
    tags: input.tags ?? [],
    patternId: input.patternId,
    pattern: input.pattern,
    settings: input.settings,
    created,
    modified: now,
  };

  await Deno.writeTextFile(projectFile(id), JSON.stringify(project, null, 2));
  logger.info(`Project saved: ${project.name} (${id})`);
  return project;
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const out: ProjectSummary[] = [];
  try {
    for await (const entry of Deno.readDir(config.projectPath)) {
      if (!entry.isFile || !entry.name.endsWith(".json")) continue;
      try {
        const p = JSON.parse(
          await Deno.readTextFile(`${config.projectPath}/${entry.name}`),
        );
        out.push({
          id: p.id,
          name: p.name,
          description: p.description ?? "",
          tags: p.tags ?? [],
          created: p.created,
          modified: p.modified,
        });
      } catch {
        // skip corrupt files
      }
    }
  } catch {
    // directory missing
  }
  return out.sort((a, b) => b.modified.localeCompare(a.modified));
}

export async function getProject(id: string): Promise<Project | null> {
  try {
    return JSON.parse(await Deno.readTextFile(projectFile(id)));
  } catch {
    return null;
  }
}

export async function deleteProject(id: string): Promise<boolean> {
  try {
    await Deno.remove(projectFile(id));
    logger.info(`Project deleted: ${id}`);
    return true;
  } catch {
    return false;
  }
}
