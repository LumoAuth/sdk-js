"use client";
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  AuthCallback: () => AuthCallback,
  LumoAuthProvider: () => LumoAuthProvider,
  Protect: () => Protect,
  RedirectToSignIn: () => RedirectToSignIn,
  SignIn: () => SignIn,
  SignInButton: () => SignInButton,
  SignOutButton: () => SignOutButton,
  SignUp: () => SignUp,
  SignUpButton: () => SignUpButton,
  SignedIn: () => SignedIn,
  SignedOut: () => SignedOut,
  UserAvatar: () => UserAvatar,
  UserButton: () => UserButton,
  UserProfile: () => UserProfile,
  useAbac: () => useAbac,
  useAuth: () => useAuth,
  useEmailFirst: () => useEmailFirst,
  useLumoAuth: () => useLumoAuth,
  useMagicLink: () => useMagicLink,
  usePermission: () => usePermission,
  useSession: () => useSession,
  useSignIn: () => useSignIn,
  useUser: () => useUser,
  useZanzibar: () => useZanzibar
});
module.exports = __toCommonJS(index_exports);

// src/provider.tsx
var import_react = require("react");
var import_client = require("@lumoauth/client");
var import_client2 = require("@lumoauth/client");

// src/styles.ts
var STYLE_ID = "lumoauth-react-styles";
var injected = false;
function injectStyles() {
  if (injected) return;
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) {
    injected = true;
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS_CONTENT;
  document.head.appendChild(style);
  injected = true;
}
var CSS_CONTENT = `
/* \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
   @lumoauth/react \u2014 Self-contained component styles
   \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */

:root {
    --la-font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    --la-font-size-sm: 0.8125rem;
    --la-font-size-base: 0.875rem;
    --la-font-size-lg: 1rem;
    --la-font-size-xl: 1.25rem;
    --la-font-size-2xl: 1.5rem;
    --la-font-weight-normal: 400;
    --la-font-weight-medium: 500;
    --la-font-weight-semibold: 600;

    --la-radius-sm: 6px;
    --la-radius-md: 8px;
    --la-radius-lg: 12px;
    --la-radius-xl: 16px;
    --la-radius-full: 9999px;

    --la-shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
    --la-shadow-md: 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.04);
    --la-shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04);
    --la-shadow-xl: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);

    --la-transition: 150ms cubic-bezier(0.4, 0, 0.2, 1);

    /* Light theme (default) */
    --la-bg: #ffffff;
    --la-bg-subtle: #f8f9fb;
    --la-bg-muted: #f1f3f5;
    --la-bg-hover: #e9ecef;
    --la-border: #dee2e6;
    --la-border-focus: #7c5cfc;
    --la-text: #1a1a2e;
    --la-text-secondary: #6c757d;
    --la-text-muted: #adb5bd;
    --la-primary: #7c5cfc;
    --la-primary-hover: #6a4ce0;
    --la-primary-text: #ffffff;
    --la-danger: #e74c3c;
    --la-danger-bg: #fef2f2;
    --la-success: #27ae60;
    --la-success-bg: #f0fdf4;
    --la-link: #7c5cfc;
    --la-overlay: rgba(0,0,0,0.5);
    --la-card-shadow: var(--la-shadow-xl);
}

/* Dark theme */
[data-lumoauth-theme="dark"],
.la-dark {
    --la-bg: #1a1a2e;
    --la-bg-subtle: #16213e;
    --la-bg-muted: #0f3460;
    --la-bg-hover: #1a3a6a;
    --la-border: #2a2a4a;
    --la-border-focus: #9d85f7;
    --la-text: #e8e8f0;
    --la-text-secondary: #a0a0b8;
    --la-text-muted: #6a6a88;
    --la-primary: #9d85f7;
    --la-primary-hover: #b39dff;
    --la-primary-text: #1a1a2e;
    --la-danger: #ff6b6b;
    --la-danger-bg: #2d1b1b;
    --la-success: #51cf66;
    --la-success-bg: #1b2d1b;
    --la-link: #9d85f7;
    --la-overlay: rgba(0,0,0,0.7);
    --la-card-shadow: 0 20px 25px -5px rgba(0,0,0,0.3), 0 10px 10px -5px rgba(0,0,0,0.2);
}

@media (prefers-color-scheme: dark) {
    :root:not([data-lumoauth-theme="light"]):not(.la-light) {
        --la-bg: #1a1a2e;
        --la-bg-subtle: #16213e;
        --la-bg-muted: #0f3460;
        --la-bg-hover: #1a3a6a;
        --la-border: #2a2a4a;
        --la-border-focus: #9d85f7;
        --la-text: #e8e8f0;
        --la-text-secondary: #a0a0b8;
        --la-text-muted: #6a6a88;
        --la-primary: #9d85f7;
        --la-primary-hover: #b39dff;
        --la-primary-text: #1a1a2e;
        --la-danger: #ff6b6b;
        --la-danger-bg: #2d1b1b;
        --la-success: #51cf66;
        --la-success-bg: #1b2d1b;
        --la-link: #9d85f7;
        --la-overlay: rgba(0,0,0,0.7);
        --la-card-shadow: 0 20px 25px -5px rgba(0,0,0,0.3), 0 10px 10px -5px rgba(0,0,0,0.2);
    }
}

/* \u2500\u2500\u2500 Card Container \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.la-card {
    font-family: var(--la-font-family);
    background: var(--la-bg);
    border: 1px solid var(--la-border);
    border-radius: var(--la-radius-xl);
    box-shadow: var(--la-card-shadow);
    width: 100%;
    max-width: 400px;
    padding: 2rem;
    box-sizing: border-box;
    color: var(--la-text);
}

.la-card * {
    box-sizing: border-box;
}

.la-card-header {
    text-align: center;
    margin-bottom: 1.5rem;
}

.la-card-title {
    font-size: var(--la-font-size-2xl);
    font-weight: var(--la-font-weight-semibold);
    color: var(--la-text);
    margin: 0 0 0.25rem 0;
    line-height: 1.3;
}

.la-card-subtitle {
    font-size: var(--la-font-size-base);
    color: var(--la-text-secondary);
    margin: 0;
    line-height: 1.5;
}

/* \u2500\u2500\u2500 Form Elements \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.la-form-group {
    margin-bottom: 1rem;
}

.la-label {
    display: block;
    font-size: var(--la-font-size-sm);
    font-weight: var(--la-font-weight-medium);
    color: var(--la-text);
    margin-bottom: 0.375rem;
}

.la-input {
    display: block;
    width: 100%;
    padding: 0.625rem 0.75rem;
    font-family: var(--la-font-family);
    font-size: var(--la-font-size-base);
    color: var(--la-text);
    background: var(--la-bg-subtle);
    border: 1px solid var(--la-border);
    border-radius: var(--la-radius-md);
    outline: none;
    transition: border-color var(--la-transition), box-shadow var(--la-transition);
    line-height: 1.5;
}

.la-input::placeholder {
    color: var(--la-text-muted);
}

.la-input:focus {
    border-color: var(--la-border-focus);
    box-shadow: 0 0 0 3px rgba(124, 92, 252, 0.15);
}

.la-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

/* \u2500\u2500\u2500 Buttons \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.la-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.625rem 1rem;
    font-family: var(--la-font-family);
    font-size: var(--la-font-size-base);
    font-weight: var(--la-font-weight-medium);
    line-height: 1.5;
    border-radius: var(--la-radius-md);
    border: 1px solid transparent;
    cursor: pointer;
    transition: all var(--la-transition);
    text-decoration: none;
    outline: none;
}

.la-btn:focus-visible {
    box-shadow: 0 0 0 3px rgba(124, 92, 252, 0.25);
}

.la-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

.la-btn-primary {
    background: var(--la-primary);
    color: var(--la-primary-text);
    border-color: var(--la-primary);
}

.la-btn-primary:hover:not(:disabled) {
    background: var(--la-primary-hover);
    border-color: var(--la-primary-hover);
}

.la-btn-outline {
    background: transparent;
    color: var(--la-text);
    border-color: var(--la-border);
}

.la-btn-outline:hover:not(:disabled) {
    background: var(--la-bg-hover);
}

.la-btn-ghost {
    background: transparent;
    color: var(--la-text-secondary);
    border: none;
    padding: 0.375rem 0.5rem;
    width: auto;
}

.la-btn-ghost:hover:not(:disabled) {
    color: var(--la-text);
    background: var(--la-bg-hover);
}

.la-btn-danger {
    background: transparent;
    color: var(--la-danger);
    border: none;
    width: auto;
    padding: 0.375rem 0.5rem;
}

.la-btn-danger:hover:not(:disabled) {
    background: var(--la-danger-bg);
}

/* \u2500\u2500\u2500 Spinner \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.la-spinner {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    border: 2px solid var(--la-border);
    border-top-color: var(--la-primary);
    border-radius: 50%;
    animation: la-spin 0.6s linear infinite;
}

.la-spinner-sm {
    width: 0.75rem;
    height: 0.75rem;
    border-width: 1.5px;
}

@keyframes la-spin {
    to { transform: rotate(360deg); }
}

/* \u2500\u2500\u2500 Alert / Error \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.la-alert {
    padding: 0.625rem 0.75rem;
    border-radius: var(--la-radius-md);
    font-size: var(--la-font-size-sm);
    line-height: 1.5;
    margin-bottom: 1rem;
}

.la-alert-error {
    background: var(--la-danger-bg);
    color: var(--la-danger);
    border: 1px solid rgba(231, 76, 60, 0.15);
}

.la-alert-success {
    background: var(--la-success-bg);
    color: var(--la-success);
    border: 1px solid rgba(39, 174, 96, 0.15);
}

/* \u2500\u2500\u2500 Divider \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.la-divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 1.25rem 0;
    color: var(--la-text-muted);
    font-size: var(--la-font-size-sm);
}

.la-divider::before,
.la-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--la-border);
}

/* \u2500\u2500\u2500 Social Button \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.la-social-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    font-family: var(--la-font-family);
    font-size: var(--la-font-size-sm);
    font-weight: var(--la-font-weight-medium);
    color: var(--la-text);
    background: var(--la-bg);
    border: 1px solid var(--la-border);
    border-radius: var(--la-radius-md);
    cursor: pointer;
    transition: all var(--la-transition);
    outline: none;
    line-height: 1.5;
}

.la-social-btn:hover {
    background: var(--la-bg-hover);
}

.la-social-btn:focus-visible {
    box-shadow: 0 0 0 3px rgba(124, 92, 252, 0.15);
}

.la-social-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 0.25rem;
}

.la-social-icon {
    width: 1.125rem;
    height: 1.125rem;
    flex-shrink: 0;
}

/* \u2500\u2500\u2500 Footer Link \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.la-footer {
    text-align: center;
    margin-top: 1.25rem;
    font-size: var(--la-font-size-sm);
    color: var(--la-text-secondary);
}

.la-footer a,
.la-link {
    color: var(--la-link);
    text-decoration: none;
    font-weight: var(--la-font-weight-medium);
    cursor: pointer;
}

.la-footer a:hover,
.la-link:hover {
    text-decoration: underline;
}

/* \u2500\u2500\u2500 Password Strength \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.la-password-strength {
    margin-top: 0.375rem;
}

.la-password-bar {
    height: 3px;
    border-radius: 2px;
    background: var(--la-bg-muted);
    overflow: hidden;
}

.la-password-fill {
    height: 100%;
    border-radius: 2px;
    transition: width var(--la-transition), background var(--la-transition);
}

.la-password-fill[data-strength="0"] { width: 0%; }
.la-password-fill[data-strength="1"] { width: 25%; background: var(--la-danger); }
.la-password-fill[data-strength="2"] { width: 50%; background: #f39c12; }
.la-password-fill[data-strength="3"] { width: 75%; background: #3498db; }
.la-password-fill[data-strength="4"] { width: 100%; background: var(--la-success); }

.la-password-label {
    font-size: 0.6875rem;
    color: var(--la-text-muted);
    margin-top: 0.25rem;
}

/* \u2500\u2500\u2500 UserButton \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.la-user-button {
    position: relative;
    display: inline-flex;
    font-family: var(--la-font-family);
}

.la-user-trigger {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem;
    background: none;
    border: none;
    cursor: pointer;
    border-radius: var(--la-radius-full);
    transition: all var(--la-transition);
    outline: none;
}

.la-user-trigger:hover {
    background: var(--la-bg-hover);
}

.la-user-trigger:focus-visible {
    box-shadow: 0 0 0 3px rgba(124, 92, 252, 0.25);
}

.la-user-avatar {
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: var(--la-primary);
    color: var(--la-primary-text);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--la-font-size-sm);
    font-weight: var(--la-font-weight-semibold);
    overflow: hidden;
    flex-shrink: 0;
}

.la-user-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.la-user-name {
    font-size: var(--la-font-size-sm);
    font-weight: var(--la-font-weight-medium);
    color: var(--la-text);
}

.la-user-dropdown {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    min-width: 220px;
    background: var(--la-bg);
    border: 1px solid var(--la-border);
    border-radius: var(--la-radius-lg);
    box-shadow: var(--la-shadow-lg);
    padding: 0.375rem;
    z-index: 9999;
    animation: la-dropdown-in 0.15s ease-out;
}

@keyframes la-dropdown-in {
    from {
        opacity: 0;
        transform: translateY(-4px) scale(0.97);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

.la-user-dropdown-header {
    padding: 0.5rem 0.625rem;
    border-bottom: 1px solid var(--la-border);
    margin-bottom: 0.25rem;
}

.la-user-dropdown-email {
    font-size: var(--la-font-size-sm);
    color: var(--la-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.la-user-dropdown-name {
    font-size: var(--la-font-size-sm);
    font-weight: var(--la-font-weight-medium);
    color: var(--la-text);
}

.la-dropdown-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.625rem;
    font-family: var(--la-font-family);
    font-size: var(--la-font-size-sm);
    color: var(--la-text);
    background: none;
    border: none;
    border-radius: var(--la-radius-sm);
    cursor: pointer;
    transition: background var(--la-transition);
    text-align: left;
    outline: none;
}

.la-dropdown-item:hover {
    background: var(--la-bg-hover);
}

.la-dropdown-item-danger {
    color: var(--la-danger);
}

.la-dropdown-item-danger:hover {
    background: var(--la-danger-bg);
}

.la-dropdown-divider {
    height: 1px;
    background: var(--la-border);
    margin: 0.25rem 0;
}

/* \u2500\u2500\u2500 Protect Loading \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.la-protect-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
}

/* \u2500\u2500\u2500 Forgot Password Link \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.la-forgot {
    text-align: right;
    margin-top: -0.5rem;
    margin-bottom: 1rem;
}

.la-forgot a {
    font-size: var(--la-font-size-sm);
    color: var(--la-link);
    text-decoration: none;
}

.la-forgot a:hover {
    text-decoration: underline;
}

/* \u2500\u2500\u2500 UserAvatar (standalone) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.la-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--la-font-family);
    font-weight: var(--la-font-weight-semibold);
    color: #fff;
    background: var(--la-primary);
    overflow: hidden;
    flex-shrink: 0;
    user-select: none;
    line-height: 1;
}

.la-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.la-avatar-circle {
    border-radius: var(--la-radius-full);
}

.la-avatar-square {
    border-radius: var(--la-radius-md);
}

/* \u2500\u2500\u2500 UserProfile Card \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */

.la-profile-card {
    max-width: 420px;
}

.la-profile-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding-bottom: 1.25rem;
    border-bottom: 1px solid var(--la-border);
    margin-bottom: 1rem;
}

.la-profile-avatar {
    width: 56px;
    height: 56px;
    font-size: 1.25rem;
    flex-shrink: 0;
}

.la-profile-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.la-profile-header-info {
    min-width: 0;
}

.la-profile-name {
    font-size: var(--la-font-size-lg);
    font-weight: var(--la-font-weight-semibold);
    color: var(--la-text-primary);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.la-profile-email {
    font-size: var(--la-font-size-sm);
    color: var(--la-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.la-profile-section {
    margin-bottom: 1rem;
}

.la-profile-section-title {
    font-size: var(--la-font-size-sm);
    font-weight: var(--la-font-weight-semibold);
    color: var(--la-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.625rem;
}

.la-profile-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 0;
    font-size: var(--la-font-size-base);
    color: var(--la-text-primary);
}

.la-profile-row svg {
    color: var(--la-text-secondary);
    flex-shrink: 0;
}

.la-profile-row-label {
    color: var(--la-text-secondary);
    min-width: 3.5rem;
    flex-shrink: 0;
}

.la-profile-row-value {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.la-profile-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    font-weight: var(--la-font-weight-medium);
    padding: 0.125rem 0.5rem;
    border-radius: var(--la-radius-full);
    flex-shrink: 0;
}

.la-badge-success {
    background: #dcfce7;
    color: #166534;
}

.la-badge-warning {
    background: #fef9c3;
    color: #854d0e;
}

.la-badge-muted {
    background: var(--la-bg-muted);
    color: var(--la-text-secondary);
}

.la-dark .la-badge-success {
    background: rgba(22, 163, 74, 0.15);
    color: #4ade80;
}

.la-dark .la-badge-warning {
    background: rgba(234, 179, 8, 0.15);
    color: #facc15;
}

.la-dark .la-badge-muted {
    background: rgba(255, 255, 255, 0.08);
    color: var(--la-text-secondary);
}

.la-profile-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    flex: 1;
}

.la-profile-tag {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: var(--la-font-weight-medium);
    padding: 0.125rem 0.5rem;
    border-radius: var(--la-radius-full);
    background: var(--la-bg-muted);
    color: var(--la-text-secondary);
    border: 1px solid var(--la-border);
}

.la-profile-actions {
    padding-top: 0.5rem;
    border-top: 1px solid var(--la-border);
    margin-top: 0.5rem;
}

.la-profile-signout-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
}

.la-btn-outline {
    background: transparent;
    border: 1px solid var(--la-border);
    color: var(--la-text-primary);
    padding: 0.625rem 1rem;
    border-radius: var(--la-radius-md);
    font-size: var(--la-font-size-base);
    font-weight: var(--la-font-weight-medium);
    cursor: pointer;
    transition: background var(--la-transition), border-color var(--la-transition);
}

.la-btn-outline:hover {
    background: var(--la-bg-hover);
    border-color: var(--la-text-secondary);
}

.la-btn-outline:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
`;

// src/provider.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var LumoAuthContext = (0, import_react.createContext)(null);
LumoAuthContext.displayName = "LumoAuthContext";
function useLumoAuthContext() {
  const ctx = (0, import_react.useContext)(LumoAuthContext);
  if (!ctx) {
    throw new Error(
      'useLumoAuthContext must be used within <LumoAuthProvider>. Wrap your application with <LumoAuthProvider domain="..." orgId="..." clientId="...">.'
    );
  }
  return ctx;
}
var TOKEN_STORAGE_KEY = "lumoauth_tokens";
var PKCE_VERIFIER_KEY = "lumoauth_pkce_verifier";
var PKCE_STATE_KEY = "lumoauth_pkce_state";
function loadTokens() {
  try {
    const stored = typeof window !== "undefined" ? sessionStorage.getItem(TOKEN_STORAGE_KEY) : null;
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
  }
  return { accessToken: null, refreshToken: null, expiresAt: null, idToken: null };
}
function savePkceParams(codeVerifier, state) {
  try {
    if (typeof window !== "undefined") {
      sessionStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier);
      sessionStorage.setItem(PKCE_STATE_KEY, state);
    }
  } catch {
  }
}
function loadPkceParams() {
  try {
    if (typeof window !== "undefined") {
      return {
        codeVerifier: sessionStorage.getItem(PKCE_VERIFIER_KEY),
        state: sessionStorage.getItem(PKCE_STATE_KEY)
      };
    }
  } catch {
  }
  return { codeVerifier: null, state: null };
}
function clearPkceParams() {
  try {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(PKCE_VERIFIER_KEY);
      sessionStorage.removeItem(PKCE_STATE_KEY);
    }
  } catch {
  }
}
function parseUserFromUserInfo(data) {
  const firstName = data.given_name || data.first_name || "";
  const lastName = data.family_name || data.last_name || "";
  const email = data.email || "";
  const displayName = data.name || [firstName, lastName].filter(Boolean).join(" ") || email;
  return {
    id: data.sub || data.id || "",
    email,
    firstName: firstName || void 0,
    lastName: lastName || void 0,
    displayName,
    avatarUrl: data.picture || void 0,
    emailVerified: data.email_verified ?? false,
    mfaEnabled: data.mfa_enabled ?? false,
    roles: Array.isArray(data.roles) ? data.roles : [],
    groups: Array.isArray(data.groups) ? data.groups : [],
    sub: data.sub || void 0,
    claims: data
  };
}
function LumoAuthProvider({
  domain,
  orgId,
  clientId,
  authStrategy = "pkce",
  redirectUri,
  afterSignInUrl,
  afterSignUpUrl,
  afterSignOutUrl,
  storage,
  crossTab = true,
  children
}) {
  const [user, setUser] = (0, import_react.useState)(null);
  const tokensRef = (0, import_react.useRef)(loadTokens());
  const callbackHandledRef = (0, import_react.useRef)(false);
  const callbackInflightRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    injectStyles();
  }, []);
  const authModule = (0, import_react.useMemo)(
    () => new import_client2.AuthModule({
      baseUrl: domain,
      orgId,
      clientId
    }),
    [domain, orgId, clientId]
  );
  const resolvedRedirectUri = (0, import_react.useMemo)(() => {
    if (redirectUri) return redirectUri;
    if (typeof window !== "undefined") {
      return `${window.location.origin}/auth/callback`;
    }
    return "";
  }, [redirectUri]);
  const session = (0, import_react.useMemo)(
    () => new import_client.LumoAuthSession({
      auth: authModule,
      redirectUri: resolvedRedirectUri,
      storage,
      crossTab,
      // Mirror the store's tokens into the ref the flow code below
      // still reads, so signOut can build id_token_hint and the
      // callback path can inspect what was persisted.
      onTokens: (t) => {
        tokensRef.current = {
          accessToken: t.accessToken,
          refreshToken: t.refreshToken,
          idToken: t.idToken,
          expiresAt: t.expiresAt
        };
      }
    }),
    [authModule, resolvedRedirectUri, storage, crossTab]
  );
  (0, import_react.useEffect)(() => () => session.dispose(), [session]);
  const sessionState = (0, import_react.useSyncExternalStore)(
    session.subscribe,
    session.getSnapshot,
    session.getServerSnapshot
  );
  const state = (0, import_react.useMemo)(
    () => ({
      status: sessionState.status,
      user: sessionState.isSignedIn ? user : null,
      isLoaded: sessionState.isLoaded,
      isSignedIn: sessionState.isSignedIn
    }),
    [sessionState, user]
  );
  const dispatch = (0, import_react.useCallback)(
    (action) => {
      if (action.type === "AUTHENTICATED") setUser(action.user);
      else if (action.type === "UNAUTHENTICATED" || action.type === "ERROR") setUser(null);
    },
    []
  );
  const fetchUser = (0, import_react.useCallback)(async (accessToken) => {
    const data = await authModule.getUserInfo(accessToken);
    return parseUserFromUserInfo(data);
  }, [authModule]);
  const refreshAccessToken = (0, import_react.useCallback)(
    () => session.refresh(),
    [session]
  );
  const getToken = (0, import_react.useCallback)(
    () => session.getToken(),
    [session]
  );
  const signInWithRedirect = (0, import_react.useCallback)(() => {
    authModule.buildAuthorizationUrl({
      redirectUri: resolvedRedirectUri,
      scope: "openid profile email"
    }).then(({ url, codeVerifier, state: stateParam }) => {
      savePkceParams(codeVerifier, stateParam);
      if (typeof window !== "undefined") {
        window.location.href = url;
      }
    });
  }, [authModule, resolvedRedirectUri]);
  const signInWithSocial = (0, import_react.useCallback)((provider) => {
    authModule.buildAuthorizationUrl({
      redirectUri: resolvedRedirectUri,
      scope: "openid profile email",
      extraParams: { provider }
    }).then(({ url, codeVerifier, state: stateParam }) => {
      savePkceParams(codeVerifier, stateParam);
      if (typeof window !== "undefined") {
        window.location.href = url;
      }
    });
  }, [authModule, resolvedRedirectUri]);
  const signIn = (0, import_react.useCallback)(async (email, password) => {
    if (authStrategy === "pkce" || !email && !password) {
      signInWithRedirect();
      return;
    }
    if (!email || !password) {
      throw new Error("Email and password are required for password-based sign-in");
    }
    dispatch({ type: "LOADING" });
    try {
      const data = await authModule.passwordGrant(
        email,
        password,
        "openid profile email",
        redirectUri
      );
      await session.adopt(data);
      const user2 = await fetchUser(data.access_token);
      dispatch({ type: "AUTHENTICATED", user: user2 });
    } catch (err) {
      dispatch({ type: "ERROR", error: err instanceof Error ? err.message : "Sign in failed" });
      throw err;
    }
  }, [authStrategy, authModule, redirectUri, fetchUser, session, signInWithRedirect, dispatch]);
  const handleCallback = (0, import_react.useCallback)(async () => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code && callbackInflightRef.current?.code === code) {
      return callbackInflightRef.current.promise;
    }
    const promise = (async () => {
      const returnedState = params.get("state");
      const error = params.get("error");
      const errorDescription = params.get("error_description");
      if (error) {
        dispatch({ type: "ERROR", error: errorDescription || error });
        throw new Error(errorDescription || error);
      }
      if (!code) {
        dispatch({ type: "ERROR", error: "No authorization code found in callback URL" });
        throw new Error("No authorization code found in callback URL");
      }
      const { codeVerifier, state: savedState } = loadPkceParams();
      if (!savedState || savedState !== returnedState) {
        clearPkceParams();
        dispatch({ type: "ERROR", error: "Invalid state parameter \u2014 possible CSRF attack" });
        throw new Error("Invalid state parameter \u2014 possible CSRF attack");
      }
      if (!codeVerifier) {
        clearPkceParams();
        dispatch({ type: "ERROR", error: "No PKCE code verifier found" });
        throw new Error("No PKCE code verifier found");
      }
      dispatch({ type: "LOADING" });
      try {
        const data = await authModule.exchangeCodeForTokens({
          code,
          codeVerifier,
          redirectUri: resolvedRedirectUri
        });
        clearPkceParams();
        await session.adopt(data);
        const user2 = await fetchUser(data.access_token);
        dispatch({ type: "AUTHENTICATED", user: user2 });
      } catch (err) {
        clearPkceParams();
        dispatch({ type: "ERROR", error: err instanceof Error ? err.message : "Token exchange failed" });
        throw err;
      }
    })();
    if (code) {
      callbackInflightRef.current = { code, promise };
      promise.catch(() => {
        if (callbackInflightRef.current?.promise === promise) {
          callbackInflightRef.current = null;
        }
      });
    }
    return promise;
  }, [authModule, resolvedRedirectUri, fetchUser, session, dispatch]);
  const signUp = (0, import_react.useCallback)(async (_params) => {
    if (authStrategy === "pkce") {
      const safeOrgId = encodeURIComponent(orgId);
      const signUpUrl = `${domain.replace(/\/+$/, "")}/orgs/${safeOrgId}/register?` + new URLSearchParams({
        client_id: clientId,
        redirect_uri: resolvedRedirectUri,
        response_type: "code",
        scope: "openid profile email"
      }).toString();
      if (typeof window !== "undefined") {
        window.location.href = signUpUrl;
      }
      return;
    }
    dispatch({
      type: "ERROR",
      error: "inline_registration_unsupported"
    });
    throw new Error(
      `Inline registration is not supported by this LumoAuth server: there is no JSON registration endpoint. Use redirectToSignUp() to send the user to the hosted registration page (${domain.replace(/\/+$/, "")}/orgs/${encodeURIComponent(orgId)}/register), or set authStrategy: "pkce".`
    );
  }, [authStrategy, domain, orgId, clientId, resolvedRedirectUri, signIn]);
  const sendMagicLink = (0, import_react.useCallback)(async (email, redirectUri2) => {
    await authModule.requestMagicLink({ email, redirectUri: redirectUri2 });
  }, [authModule]);
  const checkEmail = (0, import_react.useCallback)(async (email) => {
    const result = await authModule.checkEmailExists(email);
    return result.exists;
  }, [authModule]);
  const signOut = (0, import_react.useCallback)(async (options) => {
    const { accessToken, idToken } = tokensRef.current;
    if (typeof window === "undefined") {
      if (accessToken) {
        authModule.revokeToken(accessToken, accessToken).catch(() => {
        });
      }
      tokensRef.current = { accessToken: null, refreshToken: null, expiresAt: null, idToken: null };
      await session.clearSession();
      dispatch({ type: "UNAUTHENTICATED" });
      return;
    }
    const targetUrl = options?.afterSignOutUrl || afterSignOutUrl || "/";
    const postLogoutRedirectUri = new URL(targetUrl, window.location.origin).toString();
    const safeOrgId = encodeURIComponent(orgId);
    const params = new URLSearchParams({
      post_logout_redirect_uri: postLogoutRedirectUri
    });
    if (idToken) {
      params.set("id_token_hint", idToken);
    }
    const logoutUrl = `${domain.replace(/\/+$/, "")}/orgs/${safeOrgId}/api/v1/oauth/logout?${params.toString()}`;
    if (accessToken) {
      authModule.revokeToken(accessToken, accessToken).catch(() => {
      });
    }
    tokensRef.current = { accessToken: null, refreshToken: null, expiresAt: null, idToken: null };
    await session.clearSession(null, { emit: false });
    window.location.replace(logoutUrl);
    await new Promise(() => {
    });
  }, [authModule, domain, orgId, afterSignOutUrl, session, dispatch]);
  (0, import_react.useEffect)(() => {
    let cancelled = false;
    async function init() {
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const returnedState = params.get("state");
      if (code && returnedState) {
        if (callbackHandledRef.current) return;
        callbackHandledRef.current = true;
        try {
          await handleCallback();
          if (cancelled) return;
          params.delete("code");
          params.delete("state");
          params.delete("iss");
          const cleanUrl = params.toString() ? `${window.location.pathname}?${params}` : window.location.pathname;
          window.history.replaceState({}, "", cleanUrl);
          return;
        } catch {
          callbackHandledRef.current = false;
          if (!cancelled) dispatch({ type: "UNAUTHENTICATED" });
          return;
        }
      }
      const { accessToken, expiresAt } = tokensRef.current;
      if (!accessToken) {
        dispatch({ type: "UNAUTHENTICATED" });
        return;
      }
      if (expiresAt && Date.now() >= expiresAt - 3e4) {
        const newToken = await refreshAccessToken();
        if (!newToken) {
          if (!cancelled) dispatch({ type: "UNAUTHENTICATED" });
          return;
        }
      }
      try {
        const currentToken = tokensRef.current.accessToken;
        if (!currentToken) {
          if (!cancelled) dispatch({ type: "UNAUTHENTICATED" });
          return;
        }
        const user2 = await fetchUser(currentToken);
        if (!cancelled) {
          dispatch({ type: "AUTHENTICATED", user: user2 });
        }
      } catch {
        if (!cancelled) dispatch({ type: "UNAUTHENTICATED" });
      }
    }
    init().then(() => {
      if (!cancelled) void session.hydrate();
    });
    return () => {
      cancelled = true;
    };
  }, [fetchUser, handleCallback, refreshAccessToken, session]);
  const contextValue = (0, import_react.useMemo)(() => ({
    ...state,
    signIn,
    signInWithRedirect,
    signInWithSocial,
    signUp,
    signOut,
    getToken,
    handleCallback,
    sendMagicLink,
    checkEmail,
    authStrategy,
    config: {
      domain,
      orgId,
      clientId,
      redirectUri: resolvedRedirectUri,
      afterSignInUrl,
      afterSignUpUrl,
      afterSignOutUrl
    }
  }), [state, signIn, signInWithRedirect, signInWithSocial, signUp, signOut, getToken, handleCallback, sendMagicLink, checkEmail, authStrategy, domain, orgId, clientId, resolvedRedirectUri, afterSignInUrl, afterSignUpUrl, afterSignOutUrl]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LumoAuthContext.Provider, { value: contextValue, children });
}

// src/components/SignIn.tsx
var import_react2 = require("react");

// src/utils/url.ts
function sanitizeRedirectUrl(url, defaultUrl = "/") {
  if (!url || typeof url !== "string") {
    return defaultUrl;
  }
  let sanitizedUrl = url.trim().replace(/[\x00-\x1F\x7F]/g, "");
  try {
    const parsedUrl = new URL(sanitizedUrl, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    if (sanitizedUrl.startsWith("/") && !sanitizedUrl.startsWith("//")) {
      return sanitizedUrl;
    }
    const dangerousSchemes = ["javascript:", "data:", "vbscript:", "file:"];
    if (dangerousSchemes.includes(parsedUrl.protocol.toLowerCase())) {
      return defaultUrl;
    }
    if (typeof window !== "undefined" && parsedUrl.origin !== window.location.origin) {
      return defaultUrl;
    }
    return parsedUrl.href;
  } catch {
    return defaultUrl;
  }
}

// src/components/SignIn.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var SOCIAL_ICONS = {
  google: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { className: "la-social-icon", viewBox: "0 0 24 24", fill: "none", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z", fill: "#4285F4" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z", fill: "#34A853" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z", fill: "#FBBC05" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z", fill: "#EA4335" })
  ] }),
  github: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "la-social-icon", viewBox: "0 0 24 24", fill: "currentColor", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" }) }),
  microsoft: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { className: "la-social-icon", viewBox: "0 0 24 24", fill: "none", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("rect", { x: "1", y: "1", width: "10", height: "10", fill: "#F25022" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("rect", { x: "13", y: "1", width: "10", height: "10", fill: "#7FBA00" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("rect", { x: "1", y: "13", width: "10", height: "10", fill: "#00A4EF" }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("rect", { x: "13", y: "13", width: "10", height: "10", fill: "#FFB900" })
  ] }),
  apple: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: "la-social-icon", viewBox: "0 0 24 24", fill: "currentColor", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" }) })
};
function getSocialLabel(provider) {
  const names = {
    google: "Google",
    github: "GitHub",
    microsoft: "Microsoft",
    apple: "Apple",
    facebook: "Facebook",
    linkedin: "LinkedIn",
    twitter: "X (Twitter)",
    gitlab: "GitLab"
  };
  return names[provider] || provider.charAt(0).toUpperCase() + provider.slice(1);
}
function SignIn({
  afterSignInUrl,
  signUpUrl,
  appearance,
  socialProviders = []
}) {
  const { signIn, signInWithSocial, config, status, authStrategy } = useLumoAuthContext();
  const resolvedAfterSignInUrl = afterSignInUrl || config.afterSignInUrl || "/";
  const resolvedSignUpUrl = signUpUrl || config.afterSignUpUrl || "/sign-up";
  const themeClass = appearance?.theme === "dark" ? "la-dark" : appearance?.theme === "light" ? "la-light" : "";
  if (status === "authenticated") {
    return null;
  }
  if (authStrategy === "pkce") {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      SignInPkce,
      {
        signIn,
        signInWithSocial,
        socialProviders,
        resolvedSignUpUrl,
        themeClass,
        appearance
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
    SignInPassword,
    {
      signIn,
      signInWithSocial,
      socialProviders,
      config,
      resolvedAfterSignInUrl,
      resolvedSignUpUrl,
      themeClass,
      appearance
    }
  );
}
function SignInPkce({
  signIn,
  signInWithSocial,
  socialProviders,
  resolvedSignUpUrl,
  themeClass,
  appearance
}) {
  const handleSocialLogin = (0, import_react2.useCallback)((provider) => {
    signInWithSocial(provider);
  }, [signInWithSocial]);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "div",
    {
      className: `la-card ${themeClass} ${appearance?.className || ""}`,
      style: appearance?.variables,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "la-card-header", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { className: "la-card-title", children: "Sign in" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "la-card-subtitle", children: "Welcome back! Please sign in to continue." })
        ] }),
        socialProviders.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "la-social-buttons", children: socialProviders.map((provider) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "button",
          {
            type: "button",
            className: "la-social-btn",
            onClick: () => handleSocialLogin(provider),
            children: [
              SOCIAL_ICONS[provider] || null,
              "Continue with ",
              getSocialLabel(provider)
            ]
          },
          provider
        )) }),
        socialProviders.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "la-divider", children: "or" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "button",
          {
            type: "button",
            className: "la-btn la-btn-primary",
            onClick: () => signIn(),
            children: "Sign in with email"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "la-footer", children: [
          "Don't have an account?",
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("a", { href: resolvedSignUpUrl, children: "Sign up" })
        ] })
      ]
    }
  );
}
function SignInPassword({
  signIn,
  signInWithSocial,
  socialProviders,
  config,
  resolvedAfterSignInUrl,
  resolvedSignUpUrl,
  themeClass,
  appearance
}) {
  const [email, setEmail] = (0, import_react2.useState)("");
  const [password, setPassword] = (0, import_react2.useState)("");
  const [error, setError] = (0, import_react2.useState)(null);
  const [loading, setLoading] = (0, import_react2.useState)(false);
  const handleSubmit = (0, import_react2.useCallback)(async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      if (typeof window !== "undefined") {
        window.location.href = sanitizeRedirectUrl(resolvedAfterSignInUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [signIn, email, password, resolvedAfterSignInUrl]);
  const handleSocialLogin = (0, import_react2.useCallback)((provider) => {
    signInWithSocial(provider);
  }, [signInWithSocial]);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "div",
    {
      className: `la-card ${themeClass} ${appearance?.className || ""}`,
      style: appearance?.variables,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "la-card-header", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("h2", { className: "la-card-title", children: "Sign in" }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("p", { className: "la-card-subtitle", children: "Welcome back! Please sign in to continue." })
        ] }),
        socialProviders.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "la-social-buttons", children: socialProviders.map((provider) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "button",
          {
            type: "button",
            className: "la-social-btn",
            onClick: () => handleSocialLogin(provider),
            disabled: loading,
            children: [
              SOCIAL_ICONS[provider] || null,
              "Continue with ",
              getSocialLabel(provider)
            ]
          },
          provider
        )) }),
        socialProviders.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "la-divider", children: "or" }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("form", { onSubmit: handleSubmit, children: [
          error && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "la-alert la-alert-error", role: "alert", children: error }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "la-form-group", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "la-label", htmlFor: "la-signin-email", children: "Email address" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "input",
              {
                id: "la-signin-email",
                className: "la-input",
                type: "email",
                placeholder: "name@example.com",
                value: email,
                onChange: (e) => setEmail(e.target.value),
                required: true,
                autoComplete: "email",
                disabled: loading
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "la-form-group", children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("label", { className: "la-label", htmlFor: "la-signin-password", children: "Password" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
              "input",
              {
                id: "la-signin-password",
                className: "la-input",
                type: "password",
                placeholder: "Enter your password",
                value: password,
                onChange: (e) => setPassword(e.target.value),
                required: true,
                autoComplete: "current-password",
                disabled: loading
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "la-forgot", children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("a", { href: `${config.domain}/account/forgot-password`, children: "Forgot password?" }) }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
            "button",
            {
              type: "submit",
              className: "la-btn la-btn-primary",
              disabled: loading || !email || !password,
              children: [
                loading ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: "la-spinner la-spinner-sm" }) : null,
                loading ? "Signing in\u2026" : "Sign in"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: "la-footer", children: [
          "Don't have an account?",
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("a", { href: resolvedSignUpUrl, children: "Sign up" })
        ] })
      ]
    }
  );
}

// src/components/SignUp.tsx
var import_react3 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
function getPasswordStrength(password) {
  if (!password) return { score: 0, label: "" };
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  const capped = Math.min(score, 4);
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  return { score: capped, label: labels[capped] };
}
function SignUp({
  afterSignUpUrl,
  signInUrl,
  appearance
}) {
  const { signUp, config, status, authStrategy } = useLumoAuthContext();
  const resolvedSignInUrl = signInUrl || "/sign-in";
  const themeClass = appearance?.theme === "dark" ? "la-dark" : appearance?.theme === "light" ? "la-light" : "";
  if (status === "authenticated") {
    return null;
  }
  if (authStrategy === "pkce") {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      "div",
      {
        className: `la-card ${themeClass} ${appearance?.className || ""}`,
        style: appearance?.variables,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "la-card-header", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h2", { className: "la-card-title", children: "Create your account" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "la-card-subtitle", children: "Get started \u2014 it only takes a minute." })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
            "button",
            {
              type: "button",
              className: "la-btn la-btn-primary",
              onClick: () => signUp({ email: "", password: "" }),
              children: "Create account"
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "la-footer", children: [
            "Already have an account?",
            " ",
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("a", { href: resolvedSignInUrl, children: "Sign in" })
          ] })
        ]
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
    SignUpPasswordForm,
    {
      signUp,
      resolvedAfterSignUpUrl: afterSignUpUrl || config.afterSignUpUrl || "/",
      resolvedSignInUrl,
      themeClass,
      appearance
    }
  );
}
function SignUpPasswordForm({
  signUp,
  resolvedAfterSignUpUrl,
  resolvedSignInUrl,
  themeClass,
  appearance
}) {
  const [firstName, setFirstName] = (0, import_react3.useState)("");
  const [lastName, setLastName] = (0, import_react3.useState)("");
  const [email, setEmail] = (0, import_react3.useState)("");
  const [password, setPassword] = (0, import_react3.useState)("");
  const [error, setError] = (0, import_react3.useState)(null);
  const [loading, setLoading] = (0, import_react3.useState)(false);
  const passwordStrength = (0, import_react3.useMemo)(() => getPasswordStrength(password), [password]);
  const handleSubmit = (0, import_react3.useCallback)(async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signUp({
        email,
        password,
        firstName: firstName || void 0,
        lastName: lastName || void 0
      });
      if (typeof window !== "undefined") {
        window.location.href = sanitizeRedirectUrl(resolvedAfterSignUpUrl);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [signUp, email, password, firstName, lastName, resolvedAfterSignUpUrl]);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
    "div",
    {
      className: `la-card ${themeClass} ${appearance?.className || ""}`,
      style: appearance?.variables,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "la-card-header", children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h2", { className: "la-card-title", children: "Create your account" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "la-card-subtitle", children: "Get started \u2014 it only takes a minute." })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("form", { onSubmit: handleSubmit, children: [
          error && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "la-alert la-alert-error", role: "alert", children: error }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", gap: "0.75rem" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "la-form-group", style: { flex: 1 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "la-label", htmlFor: "la-signup-firstname", children: "First name" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "input",
                {
                  id: "la-signup-firstname",
                  className: "la-input",
                  type: "text",
                  placeholder: "Jane",
                  value: firstName,
                  onChange: (e) => setFirstName(e.target.value),
                  autoComplete: "given-name",
                  disabled: loading
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "la-form-group", style: { flex: 1 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "la-label", htmlFor: "la-signup-lastname", children: "Last name" }),
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "input",
                {
                  id: "la-signup-lastname",
                  className: "la-input",
                  type: "text",
                  placeholder: "Doe",
                  value: lastName,
                  onChange: (e) => setLastName(e.target.value),
                  autoComplete: "family-name",
                  disabled: loading
                }
              )
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "la-form-group", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "la-label", htmlFor: "la-signup-email", children: "Email address" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                id: "la-signup-email",
                className: "la-input",
                type: "email",
                placeholder: "name@example.com",
                value: email,
                onChange: (e) => setEmail(e.target.value),
                required: true,
                autoComplete: "email",
                disabled: loading
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "la-form-group", children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("label", { className: "la-label", htmlFor: "la-signup-password", children: "Password" }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                id: "la-signup-password",
                className: "la-input",
                type: "password",
                placeholder: "Create a strong password",
                value: password,
                onChange: (e) => setPassword(e.target.value),
                required: true,
                minLength: 8,
                autoComplete: "new-password",
                disabled: loading
              }
            ),
            password && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "la-password-strength", children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "la-password-bar", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "div",
                {
                  className: "la-password-fill",
                  "data-strength": passwordStrength.score
                }
              ) }),
              passwordStrength.label && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "la-password-label", children: passwordStrength.label })
            ] })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
            "button",
            {
              type: "submit",
              className: "la-btn la-btn-primary",
              disabled: loading || !email || !password,
              style: { marginTop: "0.5rem" },
              children: [
                loading ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "la-spinner la-spinner-sm" }) : null,
                loading ? "Creating account\u2026" : "Create account"
              ]
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "la-footer", children: [
          "Already have an account?",
          " ",
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("a", { href: resolvedSignInUrl, children: "Sign in" })
        ] })
      ]
    }
  );
}

// src/components/AuthCallback.tsx
var import_react4 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
function AuthCallback({
  afterSignInUrl,
  loading,
  error: errorComponent
}) {
  const { handleCallback, config } = useLumoAuthContext();
  const [error, setError] = (0, import_react4.useState)(null);
  const resolvedAfterSignInUrl = afterSignInUrl || config.afterSignInUrl || "/";
  (0, import_react4.useEffect)(() => {
    let cancelled = false;
    handleCallback().then(() => {
      if (!cancelled && typeof window !== "undefined") {
        window.location.href = sanitizeRedirectUrl(resolvedAfterSignInUrl);
      }
    }).catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Authentication failed");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [handleCallback, resolvedAfterSignInUrl]);
  if (error) {
    if (errorComponent) {
      return typeof errorComponent === "function" ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_jsx_runtime4.Fragment, { children: errorComponent(error) }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_jsx_runtime4.Fragment, { children: errorComponent });
    }
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "la-card", children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "la-card-header", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h2", { className: "la-card-title", children: "Authentication Error" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: "la-alert la-alert-error", role: "alert", children: error }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "button",
        {
          type: "button",
          className: "la-btn la-btn-primary",
          onClick: () => {
            if (typeof window !== "undefined") {
              window.location.href = "/";
            }
          },
          children: "Return home"
        }
      )
    ] });
  }
  if (loading) {
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_jsx_runtime4.Fragment, { children: loading });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: "la-card", style: { textAlign: "center" }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: "la-spinner" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { style: { marginTop: "1rem", color: "var(--la-text-secondary)" }, children: "Completing sign-in\u2026" })
  ] });
}

// src/components/UserButton.tsx
var import_react5 = require("react");
var import_jsx_runtime5 = require("react/jsx-runtime");
function UserButton({
  afterSignOutUrl,
  showName = false,
  appearance
}) {
  const { user, isSignedIn, signOut, config } = useLumoAuthContext();
  const [isOpen, setIsOpen] = (0, import_react5.useState)(false);
  const containerRef = (0, import_react5.useRef)(null);
  const resolvedSignOutUrl = afterSignOutUrl || config.afterSignOutUrl || "/";
  (0, import_react5.useEffect)(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);
  (0, import_react5.useEffect)(() => {
    function handleEscape(e) {
      if (e.key === "Escape") setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);
  const handleSignOut = (0, import_react5.useCallback)(async () => {
    setIsOpen(false);
    await signOut({ afterSignOutUrl: sanitizeRedirectUrl(resolvedSignOutUrl) });
  }, [signOut, resolvedSignOutUrl]);
  if (!isSignedIn || !user) {
    return null;
  }
  const initials = [user.firstName, user.lastName].filter(Boolean).map((n) => n.charAt(0).toUpperCase()).join("") || user.email.charAt(0).toUpperCase();
  const themeClass = appearance?.theme === "dark" ? "la-dark" : appearance?.theme === "light" ? "la-light" : "";
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
    "div",
    {
      ref: containerRef,
      className: `la-user-button ${themeClass} ${appearance?.className || ""}`,
      style: appearance?.variables,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
          "button",
          {
            type: "button",
            className: "la-user-trigger",
            onClick: () => setIsOpen(!isOpen),
            "aria-expanded": isOpen,
            "aria-haspopup": "menu",
            "aria-label": "User menu",
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "la-user-avatar", children: user.avatarUrl ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("img", { src: user.avatarUrl, alt: user.displayName }) : initials }),
              showName && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "la-user-name", children: user.displayName })
            ]
          }
        ),
        isOpen && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "la-user-dropdown", role: "menu", children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "la-user-dropdown-header", children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "la-user-dropdown-name", children: user.displayName }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "la-user-dropdown-email", children: user.email })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
            "button",
            {
              type: "button",
              className: "la-dropdown-item",
              role: "menuitem",
              onClick: () => {
                setIsOpen(false);
                window.location.href = `${config.domain}/account/profile`;
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" }),
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("circle", { cx: "12", cy: "7", r: "4" })
                ] }),
                "Manage account"
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { className: "la-dropdown-divider" }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
            "button",
            {
              type: "button",
              className: "la-dropdown-item la-dropdown-item-danger",
              role: "menuitem",
              onClick: handleSignOut,
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }),
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("polyline", { points: "16 17 21 12 16 7" }),
                  /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("line", { x1: "21", y1: "12", x2: "9", y2: "12" })
                ] }),
                "Sign out"
              ]
            }
          )
        ] })
      ]
    }
  );
}

// src/components/UserAvatar.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
function UserAvatar({
  size = 32,
  shape = "circle",
  appearance
}) {
  const { user, isSignedIn } = useLumoAuthContext();
  if (!isSignedIn || !user) {
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      "span",
      {
        className: `la-avatar la-avatar-${shape} ${appearance?.className || ""}`,
        style: {
          width: size,
          height: size,
          fontSize: size * 0.4,
          ...appearance?.variables
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", width: size * 0.5, height: size * 0.5, children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("path", { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("circle", { cx: "12", cy: "7", r: "4" })
        ] })
      }
    );
  }
  const initials = [user.firstName, user.lastName].filter(Boolean).map((n) => n.charAt(0).toUpperCase()).join("") || user.email.charAt(0).toUpperCase();
  const themeClass = appearance?.theme === "dark" ? "la-dark" : appearance?.theme === "light" ? "la-light" : "";
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
    "span",
    {
      className: `la-avatar la-avatar-${shape} ${themeClass} ${appearance?.className || ""}`,
      style: {
        width: size,
        height: size,
        fontSize: size * 0.4,
        ...appearance?.variables
      },
      title: user.displayName,
      children: user.avatarUrl ? /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
        "img",
        {
          src: user.avatarUrl,
          alt: user.displayName,
          style: { width: "100%", height: "100%", objectFit: "cover" }
        }
      ) : initials
    }
  );
}

// src/components/UserProfile.tsx
var import_react6 = require("react");
var import_jsx_runtime7 = require("react/jsx-runtime");
var ICONS = {
  user: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("path", { d: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("circle", { cx: "12", cy: "7", r: "4" })
  ] }),
  mail: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("rect", { x: "2", y: "4", width: "20", height: "16", rx: "2" }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("path", { d: "m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" })
  ] }),
  shield: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("path", { d: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" }) }),
  key: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("path", { d: "m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" }) }),
  check: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("polyline", { points: "20 6 9 17 4 12" }) }),
  x: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "3", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
  ] }),
  signOut: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("svg", { width: "20", height: "20", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("polyline", { points: "16 17 21 12 16 7" }),
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("line", { x1: "21", y1: "12", x2: "9", y2: "12" })
  ] })
};
function UserProfile({
  afterSignOutUrl,
  mode = "full",
  appearance
}) {
  const { user, isSignedIn, isLoaded, signOut, config } = useLumoAuthContext();
  const [signingOut, setSigningOut] = (0, import_react6.useState)(false);
  const resolvedSignOutUrl = afterSignOutUrl || config.afterSignOutUrl || "/";
  const handleSignOut = (0, import_react6.useCallback)(async () => {
    setSigningOut(true);
    await signOut({ afterSignOutUrl: resolvedSignOutUrl });
  }, [signOut, resolvedSignOutUrl]);
  if (!isLoaded) {
    return /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "la-card", style: { textAlign: "center", padding: "2rem" }, children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "la-spinner" }) });
  }
  if (!isSignedIn || !user) {
    return null;
  }
  const initials = [user.firstName, user.lastName].filter(Boolean).map((n) => n.charAt(0).toUpperCase()).join("") || user.email.charAt(0).toUpperCase();
  const themeClass = appearance?.theme === "dark" ? "la-dark" : appearance?.theme === "light" ? "la-light" : "";
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
    "div",
    {
      className: `la-card la-profile-card ${themeClass} ${appearance?.className || ""}`,
      style: appearance?.variables,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "la-profile-header", children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "la-avatar la-avatar-circle la-profile-avatar", children: user.avatarUrl ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("img", { src: user.avatarUrl, alt: user.displayName }) : initials }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "la-profile-header-info", children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "la-profile-name", children: user.displayName }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "la-profile-email", children: user.email })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "la-profile-section", children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "la-profile-section-title", children: "Account" }),
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "la-profile-row", children: [
            ICONS.mail,
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "la-profile-row-label", children: "Email" }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "la-profile-row-value", children: user.email }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: `la-profile-badge ${user.emailVerified ? "la-badge-success" : "la-badge-warning"}`, children: [
              user.emailVerified ? ICONS.check : ICONS.x,
              user.emailVerified ? "Verified" : "Unverified"
            ] })
          ] }),
          user.firstName && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "la-profile-row", children: [
            ICONS.user,
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "la-profile-row-label", children: "Name" }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "la-profile-row-value", children: [user.firstName, user.lastName].filter(Boolean).join(" ") })
          ] })
        ] }),
        mode === "full" && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "la-profile-section", children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "la-profile-section-title", children: "Security" }),
            /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "la-profile-row", children: [
              ICONS.shield,
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "la-profile-row-label", children: "MFA" }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("span", { className: `la-profile-badge ${user.mfaEnabled ? "la-badge-success" : "la-badge-muted"}`, children: [
                user.mfaEnabled ? ICONS.check : ICONS.x,
                user.mfaEnabled ? "Enabled" : "Disabled"
              ] })
            ] })
          ] }),
          (user.roles.length > 0 || user.groups.length > 0) && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "la-profile-section", children: [
            /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "la-profile-section-title", children: "Roles & Groups" }),
            user.roles.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "la-profile-row", children: [
              ICONS.key,
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "la-profile-row-label", children: "Roles" }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "la-profile-tags", children: user.roles.map((role) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "la-profile-tag", children: role }, role)) })
            ] }),
            user.groups.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "la-profile-row", children: [
              ICONS.user,
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "la-profile-row-label", children: "Groups" }),
              /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "la-profile-tags", children: user.groups.map((group) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "la-profile-tag", children: group }, group)) })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "la-profile-section la-profile-actions", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(
          "button",
          {
            type: "button",
            className: "la-btn la-btn-outline la-profile-signout-btn",
            onClick: handleSignOut,
            disabled: signingOut,
            children: [
              signingOut ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "la-spinner la-spinner-sm" }) : ICONS.signOut,
              signingOut ? "Signing out\u2026" : "Sign out"
            ]
          }
        ) })
      ]
    }
  );
}

// src/hooks.ts
var import_react7 = require("react");
var import_client3 = require("@lumoauth/client");
function useAuth() {
  return useLumoAuthContext();
}
function useUser() {
  const { user } = useLumoAuthContext();
  return user;
}
function useSignIn() {
  const { signIn, signInWithRedirect, status } = useLumoAuthContext();
  return {
    signIn,
    signInWithRedirect,
    isLoading: status === "loading"
  };
}
function useSession() {
  const { isSignedIn, isLoaded, getToken, status } = useLumoAuthContext();
  return {
    isActive: isSignedIn,
    isLoaded,
    getToken,
    status
  };
}
function useLumoAuth() {
  const { getToken, config } = useLumoAuthContext();
  const client = (0, import_react7.useMemo)(
    () => new import_client3.LumoAuth({
      baseUrl: config.domain,
      orgId: config.orgId,
      clientId: config.clientId,
      token: () => getToken().then((t) => t || "")
    }),
    [config.domain, config.orgId, config.clientId, getToken]
  );
  return client;
}
function usePermission(slug) {
  const client = useLumoAuth();
  const { isSignedIn, isLoaded } = useLumoAuthContext();
  const [allowed, setAllowed] = (0, import_react7.useState)(false);
  const [isLoading, setIsLoading] = (0, import_react7.useState)(true);
  (0, import_react7.useEffect)(() => {
    if (!isLoaded || !isSignedIn) {
      setAllowed(false);
      setIsLoading(!isLoaded);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    client.permissions.check(slug).then((result) => {
      if (!cancelled) {
        setAllowed(result);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setAllowed(false);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [client, slug, isSignedIn, isLoaded]);
  return { allowed, isLoading };
}
function useZanzibar(request) {
  const client = useLumoAuth();
  const { isSignedIn, isLoaded } = useLumoAuthContext();
  const [allowed, setAllowed] = (0, import_react7.useState)(false);
  const [isLoading, setIsLoading] = (0, import_react7.useState)(true);
  const requestKey = `${request.object}:${request.relation}:${request.subject}`;
  (0, import_react7.useEffect)(() => {
    if (!isLoaded || !isSignedIn) {
      setAllowed(false);
      setIsLoading(!isLoaded);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    client.zanzibar.check(request).then((result) => {
      if (!cancelled) {
        setAllowed(result);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setAllowed(false);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [client, requestKey, isSignedIn, isLoaded]);
  return { allowed, isLoading };
}
function useAbac(request) {
  const client = useLumoAuth();
  const { isSignedIn, isLoaded } = useLumoAuthContext();
  const [allowed, setAllowed] = (0, import_react7.useState)(false);
  const [isLoading, setIsLoading] = (0, import_react7.useState)(true);
  const requestKey = `${request.resourceType}:${request.action}:${request.resourceId || ""}`;
  (0, import_react7.useEffect)(() => {
    if (!isLoaded || !isSignedIn) {
      setAllowed(false);
      setIsLoading(!isLoaded);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    client.abac.check(request).then((res) => {
      if (!cancelled) {
        setAllowed(res.allowed);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setAllowed(false);
        setIsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [client, requestKey, isSignedIn, isLoaded]);
  return { allowed, isLoading };
}
function useMagicLink() {
  const { sendMagicLink: sendMagicLinkCtx } = useLumoAuthContext();
  const [isLoading, setIsLoading] = (0, import_react7.useState)(false);
  const [isSent, setIsSent] = (0, import_react7.useState)(false);
  const [error, setError] = (0, import_react7.useState)(null);
  const sendMagicLink = (0, import_react7.useCallback)(async (email, redirectUri) => {
    setIsLoading(true);
    setError(null);
    try {
      await sendMagicLinkCtx(email, redirectUri);
      setIsSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send magic link");
    } finally {
      setIsLoading(false);
    }
  }, [sendMagicLinkCtx]);
  const reset = (0, import_react7.useCallback)(() => {
    setIsSent(false);
    setError(null);
    setIsLoading(false);
  }, []);
  return { sendMagicLink, isLoading, isSent, error, reset };
}
function useEmailFirst() {
  const { checkEmail: checkEmailCtx } = useLumoAuthContext();
  const [isLoading, setIsLoading] = (0, import_react7.useState)(false);
  const [exists, setExists] = (0, import_react7.useState)(null);
  const checkEmail = (0, import_react7.useCallback)(async (email) => {
    setIsLoading(true);
    try {
      const result = await checkEmailCtx(email);
      setExists(result);
      return result;
    } finally {
      setIsLoading(false);
    }
  }, [checkEmailCtx]);
  const reset = (0, import_react7.useCallback)(() => {
    setExists(null);
    setIsLoading(false);
  }, []);
  return { checkEmail, isLoading, exists, reset };
}

// src/components/Protect.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
function Protect({
  permission,
  zanzibar,
  abac,
  fallback = null,
  children
}) {
  const { isLoaded, isSignedIn } = useLumoAuthContext();
  if (permission) {
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      ProtectWithPermission,
      {
        permission,
        fallback,
        isLoaded,
        isSignedIn,
        children
      }
    );
  }
  if (zanzibar) {
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      ProtectWithZanzibar,
      {
        zanzibar,
        fallback,
        isLoaded,
        isSignedIn,
        children
      }
    );
  }
  if (abac) {
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      ProtectWithAbac,
      {
        abac,
        fallback,
        isLoaded,
        isSignedIn,
        children
      }
    );
  }
  if (!isLoaded) {
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "la-protect-loading", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "la-spinner" }) });
  }
  return isSignedIn ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_jsx_runtime8.Fragment, { children }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_jsx_runtime8.Fragment, { children: fallback });
}
function ProtectWithPermission({
  permission,
  fallback,
  isLoaded,
  isSignedIn,
  children
}) {
  const { allowed, isLoading } = usePermission(permission);
  if (!isLoaded || isLoading) {
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "la-protect-loading", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "la-spinner" }) });
  }
  if (!isSignedIn || !allowed) {
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_jsx_runtime8.Fragment, { children: fallback });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_jsx_runtime8.Fragment, { children });
}
function ProtectWithZanzibar({
  zanzibar,
  fallback,
  isLoaded,
  isSignedIn,
  children
}) {
  const { allowed, isLoading } = useZanzibar({
    object: zanzibar.object,
    relation: zanzibar.relation,
    subject: zanzibar.subject || "user:me"
  });
  if (!isLoaded || isLoading) {
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "la-protect-loading", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "la-spinner" }) });
  }
  if (!isSignedIn || !allowed) {
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_jsx_runtime8.Fragment, { children: fallback });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_jsx_runtime8.Fragment, { children });
}
function ProtectWithAbac({
  abac,
  fallback,
  isLoaded,
  isSignedIn,
  children
}) {
  const { allowed, isLoading } = useAbac({
    resourceType: abac.resourceType,
    action: abac.action,
    resourceId: abac.resourceId
  });
  if (!isLoaded || isLoading) {
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "la-protect-loading", children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "la-spinner" }) });
  }
  if (!isSignedIn || !allowed) {
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_jsx_runtime8.Fragment, { children: fallback });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_jsx_runtime8.Fragment, { children });
}

// src/components/Control.tsx
var import_react8 = require("react");
var import_jsx_runtime9 = require("react/jsx-runtime");
function SignedIn({ children }) {
  const { isLoaded, isSignedIn } = useLumoAuthContext();
  if (!isLoaded || !isSignedIn) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_jsx_runtime9.Fragment, { children });
}
function SignedOut({ children }) {
  const { isLoaded, isSignedIn } = useLumoAuthContext();
  if (!isLoaded || isSignedIn) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_jsx_runtime9.Fragment, { children });
}
function SignInButton({ children, signInUrl, className }) {
  const { signIn, authStrategy, config } = useLumoAuthContext();
  const handleClick = () => {
    if (authStrategy === "pkce") {
      signIn();
    } else if (signInUrl) {
      window.location.href = sanitizeRedirectUrl(signInUrl);
    } else {
      window.location.href = sanitizeRedirectUrl(config.afterSignInUrl || "/sign-in");
    }
  };
  if (children) {
    return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { onClick: handleClick, role: "button", tabIndex: 0, onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") handleClick();
    }, children });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", className, onClick: handleClick, children: "Sign in" });
}
function SignUpButton({ children, signUpUrl, className }) {
  const { config } = useLumoAuthContext();
  const handleClick = () => {
    const url = signUpUrl || config.afterSignUpUrl || "/sign-up";
    window.location.href = sanitizeRedirectUrl(url);
  };
  if (children) {
    return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { onClick: handleClick, role: "button", tabIndex: 0, onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") handleClick();
    }, children });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", className, onClick: handleClick, children: "Sign up" });
}
function SignOutButton({ children, afterSignOutUrl, className }) {
  const { signOut, config } = useLumoAuthContext();
  const handleClick = async () => {
    const redirectUrl = afterSignOutUrl || config.afterSignOutUrl || "/";
    await signOut({ afterSignOutUrl: sanitizeRedirectUrl(redirectUrl) });
  };
  if (children) {
    return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("span", { onClick: handleClick, role: "button", tabIndex: 0, onKeyDown: (e) => {
      if (e.key === "Enter" || e.key === " ") handleClick();
    }, children });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("button", { type: "button", className, onClick: handleClick, children: "Sign out" });
}
function RedirectToSignIn({ signInUrl }) {
  const { signIn, authStrategy } = useLumoAuthContext();
  (0, import_react8.useEffect)(() => {
    if (authStrategy === "pkce") {
      signIn();
    } else if (signInUrl && typeof window !== "undefined") {
      window.location.href = sanitizeRedirectUrl(signInUrl);
    }
  }, [signIn, authStrategy, signInUrl]);
  return null;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AuthCallback,
  LumoAuthProvider,
  Protect,
  RedirectToSignIn,
  SignIn,
  SignInButton,
  SignOutButton,
  SignUp,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserAvatar,
  UserButton,
  UserProfile,
  useAbac,
  useAuth,
  useEmailFirst,
  useLumoAuth,
  useMagicLink,
  usePermission,
  useSession,
  useSignIn,
  useUser,
  useZanzibar
});
//# sourceMappingURL=index.js.map