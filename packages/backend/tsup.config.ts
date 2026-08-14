import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    // The lazy `api` escape hatch branches on __dirname (CJS) vs
    // import.meta.url (ESM); shims keep both defined in both outputs.
    shims: true,
});
