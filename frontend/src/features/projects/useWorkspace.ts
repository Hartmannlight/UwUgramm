import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api, setCsrf } from "../../shared/api";
import { cloudEnabled } from "../../shared/config";
import { LOCAL_PROJECT_LIMIT, makeProject } from "./model";
import { validDiagram } from "../diagram/model";
import type { Project, ProjectFolder } from "./model";
import type { Diagram } from "../diagram/model";
import { initialWorkspace, workspaceReducer } from "./workspaceState";
import {
  clearDrafts,
  readDrafts,
  readFolders,
  readProjects,
  writeDrafts,
  writeFolders,
  writeProjects,
} from "./workspaceStorage";

interface Session {
  authenticated: boolean;
  google_available: boolean;
  user_id?: string;
  csrf?: string;
}

export function useWorkspace(notify: (text: string) => void) {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, () =>
    initialWorkspace(readProjects()),
  );
  const { projects, activeId, history } = state;
  const [folders, setFolders] = useState<ProjectFolder[]>(readFolders);
  const [session, setSession] = useState<Session>({
    authenticated: false,
    google_available: false,
  });
  const [saveState, setSaveState] = useState("Lokal gespeichert");
  const [saving, setSaving] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const authEpoch = useRef(0);
  const deletedProjects = useRef(new Set<string>());
  const deletedFolders = useRef(new Set<string>());
  const latest = useRef(projects);
  latest.current = projects;
  const inFlight = useRef(new Set<string>());
  const failed = useRef(
    new Map<
      string,
      { document: Diagram; title: string; folder_id?: string | null }
    >(),
  );
  const latestFolders = useRef(folders);
  latestFolders.current = folders;
  const active = projects.find((p) => p.id === activeId) || projects[0];

  useEffect(() => {
    if (!cloudEnabled) return;
    let cancelled = false;
    const epoch = authEpoch.current;
    api<Session>("/session")
      .then(async (s) => {
        if (cancelled || epoch !== authEpoch.current) return;
        setCsrf(s.csrf || "");
        setSession(s);
        if (s.authenticated) {
          const [cloud, cloudFolders] = await Promise.all([
            api<Project[]>("/projects"),
            api<ProjectFolder[]>("/folders"),
          ]);
          if (!cancelled && epoch === authEpoch.current) {
            dispatch({
              type: "loaded",
              cloud,
              drafts: s.user_id ? readDrafts(s.user_id) : [],
              deleted: [...deletedProjects.current],
            });
            setCloudReady(true);
            setFolders((current) => {
              const currentCloud = new Map(
                current.filter((f) => f.cloud).map((f) => [f.id, f]),
              );
              const incoming = cloudFolders.filter(
                (f) => !deletedFolders.current.has(f.id),
              );
              return [
                ...current.filter((f) => !incoming.some((c) => c.id === f.id)),
                ...incoming.map(
                  (f) => currentCloud.get(f.id) || { ...f, cloud: true },
                ),
              ];
            });
          }
        }
      })
      .catch(() => {
        if (!cancelled && epoch === authEpoch.current)
          notify(
            "Cloud ist gerade nicht erreichbar. Du kannst lokal weiterarbeiten.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [notify]);

  useEffect(() => {
    try {
      writeProjects(projects);
    } catch {
      setSaveState("Browser-Speicher voll · bitte exportieren");
    }
  }, [projects]);
  useEffect(() => {
    try {
      writeFolders(folders, projects);
    } catch {
      notify("Ordner konnten im Browser nicht gespeichert werden.");
    }
  }, [folders, projects, notify]);

  useEffect(() => {
    if (!session.user_id) return;
    try {
      writeDrafts(session.user_id, projects, !cloudReady);
    } catch {
      notify(
        "Der Browser kann den Cloud-Entwurf nicht sichern. Bitte exportiere eine Kopie.",
      );
    }
  }, [projects, session.user_id, cloudReady, notify]);

  const save = useCallback(
    async (targetId?: string) => {
      const project = latest.current.find(
        (p) => p.id === (targetId || activeId),
      );
      if (!project || inFlight.current.size > 0) return undefined;
      if (!cloudEnabled) {
        try {
          writeProjects(latest.current);
          writeFolders(latestFolders.current, latest.current);
          setSaveState("Lokal gespeichert");
          notify("Lokal gespeichert.");
        } catch {
          setSaveState("Browser-Speicher voll · bitte exportieren");
          notify(
            "Speichern im Browser fehlgeschlagen. Bitte exportiere eine Kopie.",
          );
        }
        return;
      }
      if (!session.authenticated) {
        notify(
          "Lokal gespeichert. Mit Google kannst du zusätzlich in der Cloud speichern.",
        );
        return;
      }
      const epoch = authEpoch.current;
      inFlight.current.add(project.id);
      setSaving(true);
      setSaveState("Wird gespeichert …");
      try {
        const folder = latestFolders.current.find(
          (f) => f.id === project.folder_id,
        );
        if (folder && !folder.cloud) {
          const created = await api<ProjectFolder>("/folders", "POST", {
            id: folder.id,
            name: folder.name,
          });
          if (created.name !== folder.name)
            await api("/folders/" + folder.id, "PUT", { name: folder.name });
          if (epoch !== authEpoch.current) return undefined;
          setFolders((current) =>
            current.map((f) =>
              f.id === folder.id ? { ...f, cloud: true } : f,
            ),
          );
        }
        const saved = await api<Project>(
          project.cloud ? "/projects/" + project.id : "/projects",
          project.cloud ? "PUT" : "POST",
          {
            title: project.title,
            document: project.document,
            revision: project.revision,
            folder_id: folder ? project.folder_id : null,
          },
        );
        if (epoch !== authEpoch.current) return undefined;
        dispatch({ type: "saved", sent: project, saved });
        setSaveState("In der Cloud gespeichert");
        failed.current.delete(project.id);
        return saved;
      } catch (err) {
        failed.current.set(project.id, {
          document: project.document,
          title: project.title,
          folder_id: project.folder_id,
        });
        setSaveState("Nicht synchronisiert · lokal exportieren");
        notify((err as Error).message);
        return undefined;
      } finally {
        inFlight.current.delete(project.id);
        setSaving(false);
      }
    },
    [activeId, session.authenticated, notify],
  );

  useEffect(() => {
    const pending = projects.find((project) => {
      const failure = failed.current.get(project.id);
      return (
        project.cloud &&
        project.dirty &&
        !(
          failure?.document === project.document &&
          failure.title === project.title &&
          failure.folder_id === project.folder_id
        )
      );
    });
    if (!pending || saving) return;
    const timer = setTimeout(() => {
      void save(pending.id);
    }, 1400);
    return () => clearTimeout(timer);
  }, [projects, save, saving]);

  const changeDocument = (document: Diagram, record = true) => {
    if (!validDiagram(document)) {
      notify(
        "Das Diagramm erreicht sein Limit: 500 Blöcke, 20 Ebenen oder 200 KB. Bitte teile es auf mehrere Projekte auf.",
      );
      return;
    }
    dispatch({ type: "document", id: active.id, document, record });
    setSaveState(
      active.cloud ? "Änderungen ausstehend …" : "Lokal gespeichert",
    );
  };
  const rename = (title: string) =>
    dispatch({ type: "rename", id: active.id, title });
  const select = (id: string) => {
    dispatch({ type: "select", id });
    setSaveState("");
  };
  const add = (project = makeProject()) => {
    if (
      !project.cloud &&
      latest.current.filter((p) => !p.cloud).length >= LOCAL_PROJECT_LIMIT
    ) {
      notify(
        "Maximal 100 lokale Projekte. Exportiere oder entferne zuerst ein Projekt.",
      );
      return;
    }
    dispatch({ type: "add", project });
    setSaveState("");
  };
  const undo = () => {
    dispatch({ type: "undo" });
    setSaveState(
      active.cloud ? "Änderungen ausstehend …" : "Lokal gespeichert",
    );
  };
  const redo = () => {
    dispatch({ type: "redo" });
    setSaveState(
      active.cloud ? "Änderungen ausstehend …" : "Lokal gespeichert",
    );
  };
  const remove = async () => {
    const target = active;
    if (target.cloud) await api("/projects/" + target.id, "DELETE");
    deletedProjects.current.add(target.id);
    failed.current.delete(target.id);
    dispatch({ type: "remove", id: target.id, fallback: makeProject() });
    setSaveState("");
  };
  const createFolder = async (name: string) => {
    if (folders.length >= 100) throw new Error("Maximal 100 Ordner.");
    const folder: ProjectFolder = {
      id: crypto.randomUUID(),
      name: name.trim(),
    };
    if (!folder.name || folder.name.length > 100)
      throw new Error("Bitte gib einen Ordnernamen mit 1–100 Zeichen ein.");
    if (session.authenticated) {
      await api("/folders", "POST", { id: folder.id, name: folder.name });
      folder.cloud = true;
    }
    setFolders((current) => [...current, folder]);
    return folder;
  };
  const renameFolder = async (id: string, name: string) => {
    const folder = folders.find((f) => f.id === id);
    const trimmed = name.trim();
    if (!folder || !trimmed || trimmed.length > 100)
      throw new Error("Bitte gib einen Ordnernamen mit 1–100 Zeichen ein.");
    if (folder.cloud) await api("/folders/" + id, "PUT", { name: trimmed });
    setFolders((current) =>
      current.map((f) => (f.id === id ? { ...f, name: trimmed } : f)),
    );
  };
  const removeFolder = async (id: string) => {
    if (projects.some((p) => p.folder_id === id))
      throw new Error("Verschiebe zuerst die Projekte aus diesem Ordner.");
    const folder = folders.find((f) => f.id === id);
    if (folder?.cloud) await api("/folders/" + id, "DELETE");
    deletedFolders.current.add(id);
    setFolders((current) => current.filter((f) => f.id !== id));
  };
  const moveProject = (id: string, folder_id: string | null) => {
    if (folder_id && !folders.some((f) => f.id === folder_id)) return;
    dispatch({ type: "move", id, folder_id });
  };
  const logout = async (erase = false) => {
    await api(erase ? "/account" : "/auth/logout", erase ? "DELETE" : "POST");
    try {
      if (session.user_id) clearDrafts(session.user_id);
    } catch {
      /* Storage may be disabled. */
    }
    authEpoch.current++;
    setCloudReady(false);
    setCsrf("");
    setSession((s) => ({
      google_available: s.google_available,
      authenticated: false,
    }));
    const locals = latest.current.filter((p) => !p.cloud);
    if (!locals.length) locals.push(makeProject());
    dispatch({ type: "logout", fallback: locals[0] });
    setFolders((current) =>
      current
        .filter((f) => !f.cloud || locals.some((p) => p.folder_id === f.id))
        .map((f) => ({ ...f, cloud: false })),
    );
    setSaveState("Lokal gespeichert");
  };
  return {
    projects,
    folders,
    active,
    session,
    saveState,
    saving,
    history,
    changeDocument,
    rename,
    select,
    add,
    undo,
    redo,
    save,
    remove,
    logout,
    createFolder,
    renameFolder,
    removeFolder,
    moveProject,
  };
}
