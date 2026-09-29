import { makeProject } from "./model";
import { validDiagram } from "../diagram/model";
import type { Project, ProjectFolder } from "./model";

const PROJECT_KEY = "uwugramm.projects.v1";
const FOLDER_KEY = "uwugramm.folders.v1";
const draftKey = (userId: string) => "uwugramm.drafts." + userId;

function isProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const p = value as Project;
  return (
    typeof p.id === "string" &&
    !!p.id &&
    typeof p.title === "string" &&
    validDiagram(p.document)
  );
}

export function readProjects(): Project[] {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(PROJECT_KEY) || "null",
    );
    if (Array.isArray(stored)) {
      // Limits apply to creation, never to recovery of already stored work.
      const projects = stored
        .filter(isProject)
        .map((p) => ({ ...p, cloud: false }));
      if (projects.length) return projects;
    }
  } catch {
    // Storage can be disabled or contain malformed JSON.
  }
  return [makeProject(true)];
}

export function readFolders(): ProjectFolder[] {
  try {
    const stored: unknown = JSON.parse(
      localStorage.getItem(FOLDER_KEY) || "[]",
    );
    if (Array.isArray(stored))
      return stored
        .filter(
          (f): f is ProjectFolder =>
            !!f &&
            typeof f.id === "string" &&
            /^[a-f0-9-]{36}$/i.test(f.id) &&
            typeof f.name === "string" &&
            !!f.name.trim() &&
            f.name.length <= 100,
        )
        .map((f) => ({ ...f, cloud: false }));
  } catch {}
  return [];
}

export function readDrafts(userId: string): Project[] {
  try {
    const stored: unknown = JSON.parse(
      sessionStorage.getItem(draftKey(userId)) || "[]",
    );
    if (Array.isArray(stored)) return stored.filter(isProject);
  } catch {}
  return [];
}

export function writeProjects(projects: Project[]) {
  localStorage.setItem(
    PROJECT_KEY,
    JSON.stringify(projects.filter((p) => !p.cloud)),
  );
}

export function writeFolders(folders: ProjectFolder[], projects: Project[]) {
  localStorage.setItem(
    FOLDER_KEY,
    JSON.stringify(
      folders.filter(
        (f) =>
          !f.cloud || projects.some((p) => !p.cloud && p.folder_id === f.id),
      ),
    ),
  );
}

export function writeDrafts(
  userId: string,
  projects: Project[],
  preserveExisting = false,
) {
  const drafts = new Map(
    (preserveExisting ? readDrafts(userId) : []).map((p) => [p.id, p]),
  );
  for (const project of projects.filter((p) => p.cloud)) {
    if (project.dirty) drafts.set(project.id, project);
    else drafts.delete(project.id);
  }
  sessionStorage.setItem(
    draftKey(userId),
    JSON.stringify([...drafts.values()]),
  );
}

export function clearDrafts(userId: string) {
  sessionStorage.removeItem(draftKey(userId));
}
