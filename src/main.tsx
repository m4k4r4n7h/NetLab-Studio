import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './app/App';
import { applyTheme, readStoredTheme } from './theme/theme';
import './styles/tokens.css';
import './styles/global.css';
import './styles/layout.css';
import './styles/panels.css';
import './styles/dialogs.css';
import './styles/classic.css';
import './styles/functional.css';

if (!/Electron/i.test(navigator.userAgent)) {
  registerSW({ immediate: true });
}
applyTheme(readStoredTheme());

const container = document.getElementById('root');
if (!container) {
  throw new Error('The application root element is missing.');
}

createRoot(container).render(<App />);
