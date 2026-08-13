import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default {
    // Monorepo: keep `next build` file tracing rooted at the workspace root so
    // it can see the symlinked @lumoauth/* packages.
    outputFileTracingRoot: path.join(__dirname, '../..'),

    // NOTE: do NOT alias `react`/`react-dom` to a fixed path here, even to guard
    // against a duplicate copy in the workspace. React ships a `react-server`
    // export condition that provides server-only APIs (notably `cache()`), and
    // Next resolves it for the RSC bundle. A hard alias bypasses the condition
    // and the server build fails with "_react.cache is not a function".
    // npm already dedupes React across the workspace — verify with `npm ls react`.

    // Also no `transpilePackages`: the SDK ships built dist/ that already carries
    // the "use client" banner.
};
