import { block, example } from "../diagram/model";
import type { Diagram } from "../diagram/model";

export const LOCAL_PROJECT_LIMIT = 100;

export interface Project {
  id: string;
  title: string;
  document: Diagram;
  revision: number;
  cloud?: boolean;
  dirty?: boolean;
  updated_at?: string;
  folder_id?: string | null;
}
export interface ProjectFolder {
  id: string;
  name: string;
  cloud?: boolean;
}
export const makeProject = (demo = false): Project => ({
  id: crypto.randomUUID(),
  title: demo ? "Gerade oder ungerade?" : "Unbenanntes Projekt",
  document: demo ? example() : { version: 1, nodes: [block("statement")] },
  revision: 0,
});
