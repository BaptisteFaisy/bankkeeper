/// <reference types="vite/client" />
// Public proofs page entry (`/proofs.html`): a static, dependency-free
// reading of what a judge can check without taking our word for it.
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Proofs from './proofs/Proofs';
import './styles.css';
import './proofs.css';

const root = document.getElementById('root');
if (root === null) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <Proofs />
  </StrictMode>,
);
