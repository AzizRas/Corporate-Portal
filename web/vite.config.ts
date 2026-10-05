import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:3000', '/assist': 'http://localhost:3000' } },
  build: { target: 'es2020', chunkSizeWarningLimit: 400 },
});
