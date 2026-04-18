import { createRoot } from 'react-dom/client';
import { I18nProvider } from './i18n';
import App from './App';
import './index.css';

declare const APP_VERSION: string;
document.title = `GT-9 Configurator v${APP_VERSION}`;

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <I18nProvider>
    <App />
  </I18nProvider>,
);
