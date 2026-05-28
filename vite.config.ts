import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    sourcemap: true // Enable source maps
  }
  ,
  base: './',
  optimizeDeps: {
    // Viteの事前バンドル対象に明示的に含めることで解決を図る
    include: ['firebaseui']
  }
});