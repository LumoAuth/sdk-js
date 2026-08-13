import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  dts: false,
  // Prepend the shebang so the built `dist/index.js` is directly executable
  // as the `create-lumo-agent` bin.
  banner: { js: '#!/usr/bin/env node' },
});
