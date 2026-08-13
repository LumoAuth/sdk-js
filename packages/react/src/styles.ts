// ─── Runtime CSS Injection ────────────────────────────────────────────
// All LumoAuth component styles are injected via a <style> tag at runtime.
// This means consumers do NOT need to import any CSS file or configure
// their bundler. Works out of the box with Next.js, Vite, CRA, etc.

const STYLE_ID = 'lumoauth-react-styles';

let injected = false;

export function injectStyles(): void {
    if (injected) return;
    if (typeof document === 'undefined') return; // SSR guard

    if (document.getElementById(STYLE_ID)) {
        injected = true;
        return;
    }

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS_CONTENT;
    document.head.appendChild(style);
    injected = true;
}

// ─── CSS Content ──────────────────────────────────────────────────────

const CSS_CONTENT = `
/* ═══════════════════════════════════════════════════════════════════════
   @lumoauth/react — Self-contained component styles
   ═══════════════════════════════════════════════════════════════════════ */

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

/* ─── Card Container ─────────────────────────────────────────────────── */

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

/* ─── Form Elements ──────────────────────────────────────────────────── */

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

/* ─── Buttons ────────────────────────────────────────────────────────── */

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

/* ─── Spinner ────────────────────────────────────────────────────────── */

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

/* ─── Alert / Error ──────────────────────────────────────────────────── */

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

/* ─── Divider ────────────────────────────────────────────────────────── */

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

/* ─── Social Button ──────────────────────────────────────────────────── */

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

/* ─── Footer Link ────────────────────────────────────────────────────── */

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

/* ─── Password Strength ──────────────────────────────────────────────── */

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

/* ─── UserButton ─────────────────────────────────────────────────────── */

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

/* ─── Protect Loading ────────────────────────────────────────────────── */

.la-protect-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
}

/* ─── Forgot Password Link ──────────────────────────────────────────── */

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

/* ─── UserAvatar (standalone) ────────────────────────────────────────── */

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

/* ─── UserProfile Card ───────────────────────────────────────────────── */

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
