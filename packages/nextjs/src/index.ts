'use client';

// @lumoauth/nextjs — client entry.
//
// Re-exports the React SDK so a Next.js app needs one dependency. Everything
// server-side (auth, currentUser, route handlers, middleware) lives in
// @lumoauth/nextjs/server, which is never bundled for the browser.

export * from '@lumoauth/react';
export { LumoAuthNextProvider } from './provider';
