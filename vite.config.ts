import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    // Viteの事前バンドル対象に明示的に含めることで解決を図る
    include: ['firebaseui']
  }
});