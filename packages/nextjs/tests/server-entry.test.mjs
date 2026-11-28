// The built server entry loads in plain Node.js (JS-12), as a React Server
// environment resolves it (`--conditions=react-server`): Next.js has no
// `exports` map, so an ESM import must name `next/headers.js`. Without the
// condition, `server-only` refuses the import on purpose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ESM = fileURLToPath(new URL('../dist/server.mjs', import.meta.url));
const CJS = fileURLToPath(new URL('../dist/server.js', import.meta.url));
const NAMES = ['auth', 'createRouteHandler', 'lumoAuthMiddleware', 'withBearerToken', 'withPoppySession', 'LumoAuthError'];

test('the ESM server entry imports in Node with the react-server condition', async () => {
    const { stdout } = await run(process.execPath, ['--conditions=react-server', '--input-type=module', '-e', `const m = await import(${JSON.stringify(ESM)}); console.log(JSON.stringify(Object.keys(m)));`]);
    const names = JSON.parse(stdout);
    for (const name of NAMES) assert.ok(names.includes(name), name);
});

test('the CJS server entry requires in Node with the react-server condition', async () => {
    const { stdout } = await run(process.execPath, ['--conditions=react-server', '-e', `console.log(JSON.stringify(Object.keys(require(${JSON.stringify(CJS)}))));`]);
    const names = JSON.parse(stdout);
    for (const name of NAMES) assert.ok(names.includes(name), name);
});

test('without the condition, server-only still refuses the import (the client-bundle guard stays)', async () => {
    await assert.rejects(run(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(ESM)});`]), /cannot be imported from a Client Component/);
});
