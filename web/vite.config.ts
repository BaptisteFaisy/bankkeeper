import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev proxy: the UI always calls same-origin /api. During `vite dev`
// those calls forward to the tidewater relay dev port (8785, never 8775).
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8785',
    },
  },
});
