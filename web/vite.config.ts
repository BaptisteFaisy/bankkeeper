import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy: the UI always calls same-origin /api. During `vite dev`
// those calls forward to the tidewater relay dev port (8785, never 8775).
//
// Two static pages, one build: the game at `/` and the public proofs page at
// `/proofs.html`. The game entry is unchanged; the proofs page has no relay,
// no /api call, and only reads the NEAR RPC when a contract id is configured.
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        proofs: 'proofs.html',
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8785',
      // Sponsored NEAR relayer (VITE_CHAIN=1); unused by the wasm demo.
      '/chain': 'http://localhost:8786',
    },
  },
});
