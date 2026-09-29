import { useState } from "react";
import { Check, Cloud, Copy, LogOut, Share2, Trash2 } from "lucide-react";
import Modal from "../../shared/Modal";
import { api } from "../../shared/api";
import { cloudEnabled } from "../../shared/config";
import type { Project } from "./model";
import type { useWorkspace } from "./useWorkspace";
export type Dialog =
  | "share"
  | "copy"
  | "account"
  | "delete"
  | "delete-account"
  | "clear"
  | "help"
  | null;
export default function ProjectDialogs({
  dialog,
  setDialog,
  w,
  notify,
  clear,
  motion,
  setMotion,
  copyText,
}: {
  dialog: Dialog;
  setDialog: (dialog: Dialog) => void;
  w: ReturnType<typeof useWorkspace>;
  notify: (message: string) => void;
  clear: () => void;
  motion: string;
  setMotion: (motion: "on" | "off" | "system") => void;
  copyText: (text: string) => void;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [input, setInput] = useState("");
  const close = () => setDialog(null);
  const run = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const issue = error && (
    <p role="alert" className="inline-error">
      {error}
    </p>
  );
  if (!dialog) return null;
  if (
    !cloudEnabled &&
    ["share", "copy", "account", "delete-account"].includes(dialog)
  )
    return null;
  if (dialog === "share")
    return (
      <Modal title="Projekt teilen" onClose={close}>
        <p>
          Der Code gibt eine unabhängige Kopie für 24 Stunden frei. Dein
          Original bleibt privat.
        </p>
        {!w.active.cloud ? (
          <>
            <p>Speichere dieses Projekt zuerst in der Cloud.</p>
            <button
              className="primary-button full-width"
              disabled={busy || w.saving}
              onClick={() =>
                w.session.authenticated
                  ? void run(async () => {
                      await w.save();
                    })
                  : setDialog("account")
              }
            >
              <Cloud size={17} />
              {w.session.authenticated
                ? "In der Cloud speichern"
                : "Mit Google anmelden"}
            </button>
          </>
        ) : (
          <>
            {code && (
              <div className="share-code">
                <code>{code}</code>
                <button
                  className="icon-button"
                  aria-label="Freigabecode kopieren"
                  onClick={() => copyText(code)}
                >
                  <Copy size={18} />
                </button>
              </div>
            )}
            <button
              className="primary-button full-width"
              disabled={busy || w.saving}
              onClick={() =>
                void run(async () => {
                  if (w.active.dirty && !(await w.save()))
                    throw new Error(
                      "Speichern fehlgeschlagen. Bitte sichere eine Kopie.",
                    );
                  const result = await api<{ code: string }>(
                    "/projects/" + w.active.id + "/shares",
                    "POST",
                  );
                  setCode(result.code);
                })
              }
            >
              <Share2 size={17} />
              {code ? "Code erneuern" : "Freigabecode erstellen"}
            </button>
            <button
              className="subtle-button danger-text"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api("/projects/" + w.active.id + "/shares", "DELETE");
                  setCode("");
                  notify(
                    "Freigabe widerrufen. Bereits kopierte Projekte bleiben erhalten.",
                  );
                })
              }
            >
              Freigabe widerrufen
            </button>
          </>
        )}
        {issue}
      </Modal>
    );
  if (dialog === "copy")
    return (
      <Modal title="Freigabecode einlösen" onClose={close}>
        <p>Erstelle eine eigene Kopie des freigegebenen Projekts.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const project = await api<Project>("/shares/copy", "POST", {
                code: input.trim().toUpperCase(),
              });
              w.add({ ...project, cloud: true });
              close();
            });
          }}
        >
          <label className="form-label" htmlFor="share-input">
            Code
          </label>
          <input
            id="share-input"
            autoFocus
            className="share-input"
            placeholder="ABCD-EFGH"
            value={input}
            maxLength={9}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
          />
          {w.session.authenticated ? (
            <button
              className="primary-button full-width"
              disabled={busy || input.replace("-", "").length !== 8}
            >
              Projekt kopieren
            </button>
          ) : (
            <button
              type="button"
              className="primary-button full-width"
              onClick={() => setDialog("account")}
            >
              Mit Google anmelden
            </button>
          )}
        </form>
        {issue}
      </Modal>
    );
  if (dialog === "account")
    return (
      <Modal
        title={w.session.authenticated ? "Konto" : "Anmelden"}
        onClose={close}
      >
        <p>
          Mit Google kannst du Projekte auf dem Server speichern und per Code
          teilen. Ohne Anmeldung bleiben sie in diesem Browser.
        </p>
        <ul className="privacy-list">
          <li>
            <Check size={16} />
            Keine gespeicherten Namen, E-Mails oder Profilbilder
          </li>
          <li>
            <Check size={16} />
            Private Projekte und widerrufbare Freigaben
          </li>
        </ul>
        <p>
          Zur Wiedererkennung wird eine pseudonyme Kontokennung gespeichert.
        </p>
        {w.session.authenticated ? (
          <>
            <button
              className="secondary-button full-width"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  if (w.projects.some((p) => p.cloud && p.dirty))
                    throw new Error(
                      "Bitte speichere oder exportiere zuerst ungesicherte Änderungen.",
                    );
                  await w.logout();
                  close();
                })
              }
            >
              <LogOut size={16} />
              Abmelden
            </button>
            <button
              className="subtle-button danger-text"
              onClick={() => setDialog("delete-account")}
            >
              Konto und Cloud-Daten löschen
            </button>
          </>
        ) : w.session.google_available ? (
          <a className="google-signin" href="/api/auth/google">
            <span className="google-g">G</span>Mit Google anmelden
          </a>
        ) : (
          <div className="notice">
            Google-Anmeldung ist noch nicht eingerichtet. Der lokale Editor ist
            verfügbar.
          </div>
        )}
        {issue}
      </Modal>
    );
  if (dialog === "help")
    return (
      <Modal title="Tastatur & Darstellung" onClose={close} wide>
        <dl className="shortcut-list">
          {[
            [
              "if + Leerzeichen",
              "Bedingung sofort anzeigen; Enter führt in den Ja-Zweig",
            ],
            [
              "while x > 0 + Enter",
              "Schleife erstellen und im Inneren schreiben",
            ],
            ["Enter", "Nächste Anweisung; in einer Kopfzeile ins Innere"],
            [
              "Enter im leeren Zweig",
              "Ja → Nein; Nein → unter das If; Schleife → dahinter",
            ],
            [
              "Funktionskopf: Enter / Tab",
              "Name → Parameter → Rückgabetyp → Funktionskörper",
            ],
            ["Tab / Shift+Tab", "Ja → Nein → hinter die Bedingung / zurück"],
            ["Alt+Enter", "Aktuellen Container verlassen"],
            [
              "↑ / ↓",
              "Im Text navigieren; an der ersten/letzten Zeile zum Nachbarblock",
            ],
            ["Alt+↑ / Alt+↓", "Block verschieben"],
            [
              "Python-Trennlinie: ← / →",
              "Bereich verkleinern/vergrößern; Enter klappt ihn ein",
            ],
            ["Backspace im leeren Feld", "Leeren Block entfernen"],
            ["/if + Enter", "Baustein direkt im Textfeld auswählen"],
            ["Strg+Mausrad", "Um die Mausposition zoomen"],
            ["Strg+Z / Strg+Shift+Z", "Rückgängig / Wiederholen"],
            [
              "Escape, dann Tab",
              "Textbearbeitung verlassen und Bedienelemente erreichen",
            ],
          ].map(([key, value]) => (
            <div key={key}>
              <dt>
                <kbd>{key}</kbd>
              </dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <p>
          Python wird automatisch übernommen, sobald es gültig ist. Während
          unvollständiger Eingaben bleibt das Diagramm beim letzten gültigen
          Stand und kann nicht parallel geändert werden. Leerer Python-Code
          leert das Diagramm.
        </p>
        <details className="type-reference">
          <summary>Typkürzel und Variablen</summary>
          <p>
            Cursor oder Maus auf einem Variablennamen hebt gleiche Namen im
            Diagramm und in Python hervor.
          </p>
          <table>
            <tbody>
              {[
                ["GZ, Ganzzahl", "int"],
                ["FKZ, RZ, FZ, Real, double, Fließkommazahl", "float"],
                ["ZK, Text, Zeichenkette", "str"],
                ["WW, Wahrheitswert", "bool"],
                ["Liste[GZ], Liste<GZ>", "list[int]"],
                ["void, Nichts (Rückgabe)", "None"],
              ].map(([from, to]) => (
                <tr key={from}>
                  <td>
                    <code>{from}</code>
                  </td>
                  <td>
                    <code>{to}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Die Kürzel werden nur in Typangaben übersetzt. Eigene Typnamen und
            Texte in Anführungszeichen bleiben erhalten. Ein einzelnes = in
            einer Bedingung wird als == behandelt; benannte Funktionsargumente
            bleiben unverändert.
          </p>
        </details>
        <details className="type-reference">
          <summary>Deutsche Schreibweisen und Kontrollstrukturen</summary>
          <p>
            if / wenn / falls, while / solange, for / für / fuer und def /
            funktion / operation / prozedur werden als Bausteine erkannt.
            „sonst“ + Enter wechselt in den Nein-Zweig; „ende“ + Enter verlässt
            den aktuellen Baustein.
          </p>
          <p>
            „switch wert“, „match wert“ oder „falls wert gleich“ erzeugt eine
            Mehrfachauswahl. Weitere Fälle ergänzt „+ Fall“. Do-While prüft nach
            dem Körper und wiederholt solange die Bedingung wahr ist;
            „wiederhole bis“ endet, wenn sie wahr wird.
          </p>
          <p>
            Unterstützt werden außerdem und / oder / nicht, wahr / falsch,
            Zuweisungen mit ← oder :=, Rückgabe, Abbruch und Ausgabe. „für i ← 1
            bis 10 schritt 2“ zählt einschließlich der Endgrenze.
          </p>
        </details>
        <label className="motion-control">
          Animationen
          <select
            value={motion}
            onChange={(e) =>
              setMotion(e.target.value as "on" | "off" | "system")
            }
          >
            <option value="system">Systemeinstellung</option>
            <option value="on">Eingeschaltet</option>
            <option value="off">Ausgeschaltet</option>
          </select>
        </label>
      </Modal>
    );
  return (
    <Modal
      title={
        dialog === "clear"
          ? "Diagramm leeren?"
          : dialog === "delete"
            ? "Projekt löschen?"
            : "Konto und Cloud-Daten löschen?"
      }
      onClose={close}
    >
      <p>
        {dialog === "clear"
          ? "Alle Blöcke werden entfernt. Du kannst das mit Rückgängig wiederherstellen."
          : dialog === "delete"
            ? `„${w.active.title}“ wird gelöscht. Exportiere vorher bei Bedarf eine Sicherung.`
            : "Dein Konto, alle Cloud-Projekte, Sitzungen und Freigaben werden dauerhaft gelöscht. Lokale Projekte bleiben erhalten."}
      </p>
      <div className="confirm-actions">
        <button className="secondary-button" onClick={close}>
          Abbrechen
        </button>
        <button
          className="danger-button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              if (dialog === "clear") clear();
              else if (dialog === "delete") await w.remove();
              else await w.logout(true);
              close();
            })
          }
        >
          <Trash2 size={16} />
          {dialog === "clear" ? "Leeren" : "Endgültig löschen"}
        </button>
      </div>
      {issue}
    </Modal>
  );
}
