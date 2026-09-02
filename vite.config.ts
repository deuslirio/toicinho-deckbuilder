import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages de projeto serve em https://<user>.github.io/<repo>/.
// Defina VITE_BASE="/<repo>/" no workflow (ou deixe "/" para domínio próprio / user page).
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  build: { target: 'es2022' },
});
