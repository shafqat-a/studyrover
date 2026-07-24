import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Webfonts bundled locally (Fontsource variable fonts) so they load same-origin
// even when internet is gated — no external CDN dependency at runtime, and they
// embed into the Go binary via the SPA build. Inter drives the UI/body text;
// Bricolage Grotesque gives headings a little warmth and character.
import '@fontsource-variable/inter';
import '@fontsource-variable/bricolage-grotesque';

// KaTeX styles for rendered math in question bodies/options (RichContent).
import 'katex/dist/katex.min.css';

import App from './App';
import './styles/globals.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
