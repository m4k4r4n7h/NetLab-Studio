import { useState } from 'react';
import { useAppStore } from '../../state/store';
import { Dialog } from '../common/Dialog';

export function NewProjectDialog() {
  const closeDialog = useAppStore((state) => state.closeDialog);
  const newProject = useAppStore((state) => state.newProject);
  const [name, setName] = useState('Untitled Network');
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    if (!name.trim()) {
      setError('Enter a project name.');
      return;
    }
    newProject(name);
  };

  return (
    <Dialog
      title="New Project"
      subtitle="Start with an empty engineering workspace."
      onClose={closeDialog}
      width={460}
      footer={(
        <>
          <button type="button" className="secondary-button" onClick={closeDialog}>Cancel</button>
          <button type="button" className="primary-button" onClick={create}>Create Project</button>
        </>
      )}
    >
      <label className="field">
        <span>Project name</span>
        <input
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') create();
          }}
          placeholder="Branch Office Network"
        />
      </label>
      {error ? <div className="field-error">{error}</div> : null}
      <p className="dialog-note">
        The new project is stored locally in IndexedDB and autosaved as you edit. Existing projects stay available
        from File → Open Project.
      </p>
    </Dialog>
  );
}
