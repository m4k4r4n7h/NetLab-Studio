import { useState } from 'react';
import { useAppStore } from '../../state/store';
import { Dialog } from '../common/Dialog';

export function RenameProjectDialog() {
  const project = useAppStore((state) => state.project);
  const setProjectName = useAppStore((state) => state.setProjectName);
  const closeDialog = useAppStore((state) => state.closeDialog);
  const [name, setName] = useState(project.name);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (!name.trim()) {
      setError('Enter a project name.');
      return;
    }
    setProjectName(name);
    closeDialog();
  };

  return (
    <Dialog
      title="Rename Project"
      onClose={closeDialog}
      width={440}
      footer={(
        <>
          <button type="button" className="secondary-button" onClick={closeDialog}>Cancel</button>
          <button type="button" className="primary-button" onClick={submit}>Rename</button>
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
            if (event.key === 'Enter') submit();
          }}
        />
      </label>
      {error ? <div className="field-error">{error}</div> : null}
    </Dialog>
  );
}
