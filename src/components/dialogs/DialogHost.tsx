import { useAppStore } from '../../state/store';
import { NewProjectDialog } from './NewProjectDialog';
import { OpenProjectDialog } from './OpenProjectDialog';
import { SaveAsDialog } from './SaveAsDialog';
import { RenameProjectDialog } from './RenameProjectDialog';
import { NotesDialog } from './NotesDialog';
import { ConnectDialog } from './ConnectDialog';
import { PacketGeneratorDialog } from './PacketGeneratorDialog';
import { LabsDialog } from './LabsDialog';
import { AboutDialog } from './AboutDialog';
import { HelpDialog } from './HelpDialog';
import { PreferencesDialog } from './PreferencesDialog';
import { ExtensionsDialog } from './ExtensionsDialog';
import { TerminalDialog } from './TerminalDialog';
import { BrowserDialog } from './BrowserDialog';
import { ProjectSettingsDialog } from './ProjectSettingsDialog';

export function DialogHost() {
  const activeDialog = useAppStore((state) => state.activeDialog);
  switch (activeDialog) {
    case 'new-project':
      return <NewProjectDialog />;
    case 'open-project':
      return <OpenProjectDialog />;
    case 'save-as':
      return <SaveAsDialog />;
    case 'rename-project':
      return <RenameProjectDialog />;
    case 'notes':
      return <NotesDialog />;
    case 'connect':
      return <ConnectDialog />;
    case 'packet-generator':
      return <PacketGeneratorDialog />;
    case 'labs':
      return <LabsDialog />;
    case 'about':
      return <AboutDialog />;
    case 'help':
      return <HelpDialog />;
    case 'preferences':
      return <PreferencesDialog />;
    case 'extensions':
      return <ExtensionsDialog />;
    case 'terminal':
      return <TerminalDialog />;
    case 'browser':
      return <BrowserDialog />;
    case 'project-settings':
      return <ProjectSettingsDialog />;
    default:
      return null;
  }
}
