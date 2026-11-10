/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { bootHarbour } from './boot';
import { initEngine } from './engine';
import './styles.css';

const root = document.getElementById('root');
if (root === null) throw new Error('Missing #root element');

// The relay build fetches its state; the offline build loads the engine first,
// because every API call goes straight into the module.
initEngine()
  .then(() => bootHarbour())
  .then(() => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    root.textContent = `The harbour engine did not load: ${message}`;
  });
