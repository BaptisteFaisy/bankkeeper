/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { bootHarbour } from './boot';
import type { BootResult } from './boot';
import { initEngine } from './engine';
import './styles.css';
import './tutorial.css';

const rootElement = document.getElementById('root');
if (rootElement === null) throw new Error('Missing #root element');

function render(root: HTMLElement, boot: BootResult): void {
  createRoot(root).render(
    <StrictMode>
      <App boot={boot} />
    </StrictMode>,
  );
}

// A boot that cannot finish still renders the app: the player gets the message
// and the harbour controls, never a blank screen with nothing to click.
function renderFailure(root: HTMLElement, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  render(root, {
    shape: null,
    seedOffer: null,
    notice: { kind: 'error', title: 'The harbour engine did not start.', body: message },
  });
}

// The relay build fetches its state; the offline build loads the engine first,
// because every API call goes straight into the module.
initEngine()
  .then(() => bootHarbour())
  .then((boot) => { render(rootElement, boot); })
  .catch((error: unknown) => { renderFailure(rootElement, error); });
