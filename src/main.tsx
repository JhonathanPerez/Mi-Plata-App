import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/figtree';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/components.css';
import '@/styles/screens.css';
import '@/styles/polish.css';
import '@/styles/cards.css';
import { App } from '@/app/App';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
