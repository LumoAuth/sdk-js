import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    // Node-only: this package signs with node:crypto (Ed25519 / RSA-PSS).
    platform: 'node',
});

// Known limitation: with platform 'node', esbuild rewrites `node:crypto` in
// the sources to bare `crypto` in the output. Neither `external: [/^node:/]`
// nor an onResolve plugin prevents it — the normalization happens after
// resolution. A browser bundler will therefore resolve `crypto` to a polyfill
// rather than failing outright.
//
// Left as-is deliberately: the practical failure is still loud, because no
// common polyfill implements Ed25519 signing, so a browser build breaks at
// runtime rather than silently producing invalid signatures. `engines.node`
// and the package docs both state Node 18+. Revisit if we ever need a hard
// build-time error (would require platform: 'neutral', which changes module
// resolution defaults).
