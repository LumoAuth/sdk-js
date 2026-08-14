import { defineConfig } from 'tsup';

// Two configs, because the two entries need opposite treatment: the client
// entry must carry a "use client" banner, and the server entry must NOT (a
// stray directive there would make Next treat server-only code as a client
// module).
export default defineConfig([
    {
        entry: { index: 'src/index.ts' },
        format: ['cjs', 'esm'],
        dts: true,
        clean: true,
        sourcemap: true,
        external: ['react', 'react-dom', 'next'],
        banner: { js: '"use client";' },
        esbuildOptions(o) {
            o.jsx = 'automatic';
        },
    },
    {
        // session-cookie's public symbols are re-exported from ./server —
        // it is NOT its own dist entry (it was never in the exports map).
        // Tests build it separately into tests/.build so the crypto can be
        // exercised without importing next/headers, which only resolves
        // inside Next.
        entry: { server: 'src/server.ts' },
        format: ['cjs', 'esm'],
        dts: true,
        clean: false,
        sourcemap: true,
        platform: 'node',
        external: ['react', 'react-dom', 'next', 'server-only'],
    },
]);
