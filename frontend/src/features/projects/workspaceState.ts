import type { Project } from "./model";
import type { Diagram } from "../diagram/model";
import { LOCAL_PROJECT_LIMIT } from "./model";

export interface WorkspaceState {
  projects: Project[];
  activeId: string;
  history: { past: Diagram[]; future: Diagram[] };
}

export type WorkspaceAction =
  | { type: "select"; id: string }
  | { type: "add"; project: Project }
  | { type: "remove"; id: string; fallback: Project }
  | { type: "document"; id: string; document: Diagram; record: boolean }
  | { type: "rename"; id: string; title: string }
  | { type: "move"; id: string; folder_id: string | null }
  | { type: "saved"; sent: Project; saved: Project }
  | { type: "loaded"; cloud: Project[]; drafts: Project[]; deleted: string[] }
  | { type: "logout"; fallback: Project }
  | { type: "undo" | "redo" };

const emptyHistory = () => ({ past: [], future: [] });

export function initialWorkspace(projects: Project[]): WorkspaceState {
  return { projects, activeId: projects[0].id, history: emptyHistory() };
}

/** Apply every action to the latest state, including after an asynchronous response. */
export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState {
  switch (action.type) {
    case "select":
      return state.projects.some((p) => p.id === action.id)
        ? { ...state, activeId: action.id, history: emptyHistory() }
        : state;
    case "add": {
      if (
        !action.project.cloud &&
        state.projects.filter((p) => !p.cloud).length >= LOCAL_PROJECT_LIMIT
      )
        return state;
      if (state.projects.some((p) => p.id === action.project.id)) return state;
      const active = state.projects.find((p) => p.id === state.activeId)!;
      const project =
        action.project.folder_id === undefined
          ? { ...action.project, folder_id: active.folder_id || null }
          : action.project;
      return {
        projects: [...state.projects, project],
        activeId: project.id,
        history: emptyHistory(),
      };
    }
    case "remove": {
      const projects = state.projects.filter((p) => p.id !== action.id);
      if (!projects.length) projects.push(action.fallback);
      return {
        ...state,
        projects,
        ...(state.activeId === action.id
          ? { activeId: projects[0].id, history: emptyHistory() }
          : {}),
      };
    }
    case "document": {
      const target = state.projects.find((p) => p.id === action.id);
      if (!target) return state;
      return {
        ...state,
        history:
          action.record && action.id === state.activeId
            ? {
                past: [...state.history.past.slice(-79), target.document],
                future: [],
              }
            : state.history,
        projects: state.projects.map((p) =>
          p.id === action.id
            ? { ...p, document: action.document, dirty: true }
            : p,
        ),
      };
    }
    case "rename":
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.id ? { ...p, title: action.title, dirty: true } : p,
        ),
      };
    case "move":
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === action.id
            ? { ...p, folder_id: action.folder_id, dirty: true }
            : p,
        ),
      };
    case "saved":
      return {
        ...state,
        activeId:
          state.activeId === action.sent.id ? action.saved.id : state.activeId,
        projects: state.projects.map((p) =>
          p.id === action.sent.id
            ? {
                ...action.saved,
                cloud: true,
                title: p.title,
                document: p.document,
                folder_id: p.folder_id,
                dirty:
                  p.document !== action.sent.document ||
                  p.title !== action.sent.title ||
                  p.folder_id !== action.sent.folder_id,
              }
            : p,
        ),
      };
    case "loaded": {
      const currentIds = new Set(state.projects.map((p) => p.id));
      const drafts = new Map(action.drafts.map((p) => [p.id, p]));
      // A bootstrap response is a snapshot; uploads, edits and deletions may be newer.
      const incoming = action.cloud.filter(
        (p) => !currentIds.has(p.id) && !action.deleted.includes(p.id),
      );
      return {
        ...state,
        projects: [
          ...state.projects,
          ...incoming.map((p) => ({
            ...(drafts.get(p.id) || p),
            cloud: true,
          })),
        ],
      };
    }
    case "logout": {
      const projects = state.projects.filter((p) => !p.cloud);
      if (!projects.length) projects.push(action.fallback);
      return { projects, activeId: projects[0].id, history: emptyHistory() };
    }
    case "undo":
    case "redo": {
      const active = state.projects.find((p) => p.id === state.activeId)!;
      const undo = action.type === "undo";
      const document = undo
        ? state.history.past.at(-1)
        : state.history.future[0];
      if (!document) return state;
      return {
        ...state,
        projects: state.projects.map((p) =>
          p.id === state.activeId ? { ...p, document, dirty: true } : p,
        ),
        history: undo
          ? {
              past: state.history.past.slice(0, -1),
              future: [active.document, ...state.history.future],
            }
          : {
              past: [...state.history.past.slice(-79), active.document],
              future: state.history.future.slice(1),
            },
      };
    }
  }
}
