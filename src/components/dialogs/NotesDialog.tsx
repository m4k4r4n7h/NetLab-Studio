import { useState } from 'react';
import { useAppStore } from '../../state/store';
import { Dialog } from '../common/Dialog';

export function NotesDialog() {
  const project = useAppStore((state) => state.project);
  const setNotes = useAppStore((state) => state.setNotes);
  const closeDialog = useAppStore((state) => state.closeDialog);
  const [notes, setLocalNotes] = useState(project.notes);

  const save = () => {
    setNotes(notes);
    closeDialog();
  };

  return (
    <Dialog
      title="Project Notes"
      subtitle="Saved with the project and included in exported JSON files."
      onClose={closeDialog}
      width={640}
      footer={(
        <>
          <button type="button" className="secondary-button" onClick={closeDialog}>Cancel</button>
          <button type="button" className="primary-button" onClick={save}>Save Notes</button>
        </>
      )}
    >
      <textarea
        className="notes-textarea"
        autoFocus
        rows={12}
        value={notes}
        onChange={(event) => setLocalNotes(event.target.value)}
        placeholder="Document addressing plans, VLAN ideas, troubleshooting observations, or lab answers."
      />
      <p className="dialog-note">{notes.length} characters · Notes are limited to 20,000 characters when imported.</p>
    </Dialog>
  );
}
