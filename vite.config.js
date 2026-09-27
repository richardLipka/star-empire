import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the build works from GitHub Pages or any sub-path.
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    // three.js alone is ~600 kB minified; that is expected for this project.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Keep three.js in its own long-lived cached chunk.
        manualChunks: (id) => (id.includes('node_modules/three') ? 'three' : undefined),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
