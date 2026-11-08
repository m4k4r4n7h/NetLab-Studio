import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../state/store';
import { Dialog } from '../common/Dialog';
import { Icon } from '../common/Icon';

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function OpenProjectDialog() {
  const projects = useAppStore((state) => state.projects);
  const currentId = useAppStore((state) => state.project.id);
  const refreshProjects = useAppStore((state) => state.refreshProjects);
  const openProjectById = useAppStore((state) => state.openProjectById);
  const deleteProjectById = useAppStore((state) => state.deleteProjectById);
  const duplicateProjectById = useAppStore((state) => state.duplicateProjectById);
  const importProjectFromText = useAppStore((state) => state.importProjectFromText);
  const exportProject = useAppStore((state) => state.exportProject);
  const closeDialog = useAppStore((state) => state.closeDialog);
  const setStatusMessage = useAppStore((state) => state.setStatusMessage);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  const handleFile = async (file: File) => {
    if (file.size > 8_000_000) {
      setError('The selected file is too large to be a NetLab project.');
      return;
    }
    const text = await file.text();
    const result = importProjectFromText(text);
    if (!result.ok) {
      setError(result.error ?? 'The project could not be imported.');
      return;
    }
    setError(null);
  };

  return (
    <Dialog
      title="Open Project"
      subtitle="Projects are stored in this browser. Import or export JSON files to move them between machines."
      onClose={closeDialog}
      width={780}
      footer={(
        <>
          <button type="button" className="secondary-button" onClick={() => fileRef.current?.click()}>
            <Icon name="open" size={14} /> Import project file
          </button>
          <button type="button" className="secondary-button" onClick={exportProject}>
            Export current project
          </button>
          <span className="footer-spacer" />
          <button type="button" className="secondary-button" onClick={closeDialog}>Close</button>
        </>
      )}
    >
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json,.netlab.json"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = '';
        }}
      />
      {error ? <div className="form-error">{error}</div> : null}
      <div className="project-list">
        {projects.length === 0 ? (
          <div className="empty-note">No saved projects yet. Create a project or import a JSON file.</div>
        ) : (
          projects.map((project) => (
            <div key={project.id} className={`project-row ${project.id === currentId ? 'is-current' : ''}`}>
              <div className="project-main">
                <div className="project-title">
                  <Icon name="network" size={15} />
                  <strong>{project.name}</strong>
                  {project.id === currentId ? <span className="badge badge-accent">Current</span> : null}
                </div>
                <div className="project-meta">
                  <span>{project.deviceCount} devices</span>
                  <span>{project.linkCount} links</span>
                  <span>Updated {formatDate(project.updatedAt)}</span>
                </div>
              </div>
              <div className="project-actions">
                <button
                  type="button"
                  className="mini-button"
                  onClick={() => {
                    void openProjectById(project.id);
                  }}
                >
                  Open
                </button>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() => {
                    void duplicateProjectById(project.id);
                  }}
                >
                  Duplicate
                </button>
                {pendingDelete === project.id ? (
                  <>
                    <button
                      type="button"
                      className="mini-button danger"
                      onClick={() => {
                        void deleteProjectById(project.id);
                        setPendingDelete(null);
                        setStatusMessage(`Deleted ${project.name}`);
                      }}
                    >
                      Confirm delete
                    </button>
                    <button type="button" className="mini-button" onClick={() => setPendingDelete(null)}>Keep</button>
                  </>
                ) : (
                  <button type="button" className="mini-button" onClick={() => setPendingDelete(project.id)}>Delete</button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      <p className="dialog-note">
        Imported files are validated before loading. Unknown device types, duplicate MAC addresses, overlapping cables,
        and malformed addresses are rejected.
      </p>
    </Dialog>
  );
}
