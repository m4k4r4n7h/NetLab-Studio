import { useState } from 'react';
import { useAppStore } from '../../state/store';
import { Dialog } from '../common/Dialog';

export function SaveAsDialog() {
  const project = useAppStore((state) => state.project);
  const saveAs = useAppStore((state) => state.saveAs);
  const closeDialog = useAppStore((state) => state.closeDialog);
  const [name, setName] = useState(`${project.name} Copy`);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!name.trim()) {
      setError('Enter a project name.');
      return;
    }
    setBusy(true);
    const result = await saveAs(name);
    setBusy(false);
    if (!result) setError('The project could not be saved. Check browser storage permissions.');
  };

  return (
    <Dialog
      title="Save Project As"
      subtitle="Creates a new local project and leaves the original untouched."
      onClose={closeDialog}
      width={480}
      footer={(
        <>
          <button type="button" className="secondary-button" onClick={closeDialog}>Cancel</button>
          <button type="button" className="primary-button" onClick={() => { void submit(); }} disabled={busy}>
            {busy ? 'Saving…' : 'Save Copy'}
          </button>
        </>
      )}
    >
      <label className="field">
        <span>New project name</span>
        <input
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void submit();
          }}
        />
      </label>
      {error ? <div className="field-error">{error}</div> : null}
    </Dialog>
  );
}
