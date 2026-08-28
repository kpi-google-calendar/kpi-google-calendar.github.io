import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  css: { postcss: { plugins: [tailwindcss()] } },
  define: {
    'process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID': JSON.stringify(process.env.GOOGLE_CLIENT_ID || ''),
  },
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  build: {
    outDir: 'dist-github',
    emptyOutDir: true,
  },
});
