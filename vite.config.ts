import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The site is published to GitHub Pages at
//   https://<user>.github.io/APP201-Midterm-Project/
// so assets must be requested from that sub-path rather than from the domain
// root. Local `npm run dev` is unaffected.
const repo = 'APP201-Midterm-Project';

export default defineConfig(({ command }): UserConfig => ({
  base: command === 'build' ? `/${repo}/` : '/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Split the 3D stack into its own chunk so the text-heavy sections are
        // not held up behind it.
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('three') || id.includes('@react-three')) return 'three';
          }
          return undefined;
        },
      },
    },
  },
}));
