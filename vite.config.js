import { defineConfig } from 'vite';
import { resolve } from 'node:path';
export default defineConfig({
  base: './',
  build: {
    target: 'chrome116',
    rollupOptions: {
      input: { popup: resolve('popup.html'), offscreen: resolve('offscreen.html'), background: resolve('src/background.ts') },
      output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js' }
    }
  }
});
