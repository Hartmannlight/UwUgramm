import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Cloud,
  FileCode2,
  Folder,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  Check,
  X,
} from "lucide-react";
import type { useWorkspace } from "./useWorkspace";
import { makeProject } from "./model";

export default function ProjectBrowser({
  w,
  onSelect,
  notify,
}: {
  w: ReturnType<typeof useWorkspace>;
  onSelect: () => void;
  notify: (text: string) => void;
}) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragged, setDragged] = useState("");
  const [over, setOver] = useState<string | null>(null);
  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      setEditing(null);
    } catch (error) {
      notify((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const form = (id: string) => (
    <form
      className="folder-form"
      onSubmit={(event) => {
        event.preventDefault();
        void run(() =>
          id === "new" ? w.createFolder(name) : w.renameFolder(id, name),
        );
      }}
    >
      <input
        autoFocus
        aria-label="Ordnername"
        maxLength={100}
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setEditing(null);
        }}
        placeholder="Ordnername"
      />
      <button
        className="icon-button"
        aria-label="Ordner speichern"
        disabled={busy || !name.trim()}
      >
        <Check size={15} />
      </button>
      <button
        className="icon-button"
        type="button"
        aria-label="Ordnername abbrechen"
        onClick={() => setEditing(null)}
      >
        <X size={15} />
      </button>
    </form>
  );
  const projects = (folder: string | null) =>
    w.projects
      .filter(
        (p) =>
          (p.folder_id || null) === folder ||
          (!folder && !w.folders.some((f) => f.id === p.folder_id)),
      )
      .map((project) => (
        <button
          key={project.id}
          draggable
          className={`project-item ${w.active.id === project.id ? "active" : ""}`}
          onDragStart={(event) => {
            setDragged(project.id);
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData(
              "application/x-uwugramm-project",
              project.id,
            );
          }}
          onDragEnd={() => {
            setDragged("");
            setOver(null);
          }}
          onClick={() => {
            w.select(project.id);
            onSelect();
          }}
        >
          <FileCode2 size={17} />
          <span>{project.title}</span>
          {project.cloud && <Cloud size={13} />}
        </button>
      ));
  const drop = (folder: string | null) => ({
    onDragOver: (event: React.DragEvent) => {
      if (!dragged) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setOver(folder || "root");
    },
    onDragLeave: (event: React.DragEvent) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node))
        setOver(null);
    },
    onDrop: (event: React.DragEvent) => {
      if (!dragged) return;
      event.preventDefault();
      event.stopPropagation();
      w.moveProject(dragged, folder);
      setDragged("");
      setOver(null);
      if (folder)
        setClosed((current) => {
          const next = new Set(current);
          next.delete(folder);
          return next;
        });
    },
  });
  return (
    <>
      <div className="section-label">
        Projekte
        <div className="folder-actions">
          <button
            className="icon-button"
            aria-label="Neuer Ordner"
            title="Neuer Ordner"
            onClick={() => {
              setName("");
              setEditing("new");
            }}
          >
            <FolderPlus size={16} />
          </button>
          <button
            className="icon-button"
            aria-label="Neues Projekt"
            title="Neues Projekt"
            onClick={() => w.add()}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
      <nav className="project-list" aria-label="Meine Projekte">
        {editing === "new" && form("new")}
        <div
          className={`folder-group ${over === "root" ? "folder-drop" : ""}`}
          {...drop(null)}
        >
          {w.folders.length > 0 && (
            <div className="root-folder-label">Ohne Ordner</div>
          )}
          {projects(null)}
        </div>
        {w.folders.map((folder) => (
          <div
            key={folder.id}
            className={`folder-group ${over === folder.id ? "folder-drop" : ""}`}
            {...drop(folder.id)}
          >
            {editing === folder.id ? (
              form(folder.id)
            ) : (
              <div className="folder-heading">
                <button
                  className="folder-toggle"
                  aria-label={`Ordner ${folder.name}`}
                  aria-expanded={!closed.has(folder.id)}
                  onClick={() =>
                    setClosed((current) => {
                      const next = new Set(current);
                      next.has(folder.id)
                        ? next.delete(folder.id)
                        : next.add(folder.id);
                      return next;
                    })
                  }
                >
                  {closed.has(folder.id) ? (
                    <ChevronRight size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                  <Folder size={16} />
                  <span>{folder.name}</span>
                </button>
                <div className="folder-actions">
                  <button
                    className="icon-button"
                    aria-label={`Projekt in ${folder.name} erstellen`}
                    title="Projekt im Ordner erstellen"
                    onClick={() => {
                      setClosed((current) => {
                        const next = new Set(current);
                        next.delete(folder.id);
                        return next;
                      });
                      w.add({ ...makeProject(), folder_id: folder.id });
                    }}
                  >
                    <Plus size={14} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Ordner ${folder.name} umbenennen`}
                    title="Ordner umbenennen"
                    onClick={() => {
                      setName(folder.name);
                      setEditing(folder.id);
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  {!w.projects.some((p) => p.folder_id === folder.id) && (
                    <button
                      className="icon-button"
                      aria-label={`Leeren Ordner ${folder.name} entfernen`}
                      title="Leeren Ordner entfernen"
                      onClick={() => void run(() => w.removeFolder(folder.id))}
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            )}
            {!closed.has(folder.id) && (
              <div className="folder-projects">
                {projects(folder.id)}
                {!w.projects.some((p) => p.folder_id === folder.id) && (
                  <button
                    className="empty-folder"
                    onClick={() =>
                      w.add({ ...makeProject(), folder_id: folder.id })
                    }
                  >
                    Projekt erstellen
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </nav>
      {w.folders.length > 0 && (
        <label className="folder-select-label">
          Projekt in Ordner
          <select
            aria-label="Aktives Projekt in Ordner verschieben"
            value={
              w.folders.some((f) => f.id === w.active.folder_id)
                ? w.active.folder_id || ""
                : ""
            }
            onChange={(event) =>
              w.moveProject(w.active.id, event.target.value || null)
            }
          >
            <option value="">Ohne Ordner</option>
            {w.folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}
