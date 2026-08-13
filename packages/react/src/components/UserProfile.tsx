import React, { useState, useCallback } from 'react';
import { useLumoAuthContext } from '../provider';
import type { UserProfileProps } from '../types';

// ─── User Profile Icons ───────────────────────────────────────────────

const ICONS = {
    user: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
    ),
    mail: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
    ),
    shield: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
    ),
    key: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
        </svg>
    ),
    check: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
        </svg>
    ),
    x: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    ),
    signOut: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
    ),
};

// ─── UserProfile Component ────────────────────────────────────────────

/**
 * Renders a user profile card showing account details, roles,
 * security status, and a sign-out action.
 *
 * @example
 * ```tsx
 * import { UserProfile } from '@lumoauth/react';
 *
 * // Full profile card
 * <UserProfile />
 *
 * // With sign-out redirect
 * <UserProfile afterSignOutUrl="/" />
 *
 * // Compact mode (hides roles and security sections)
 * <UserProfile mode="compact" />
 * ```
 */
export function UserProfile({
    afterSignOutUrl,
    mode = 'full',
    appearance,
}: UserProfileProps) {
    const { user, isSignedIn, isLoaded, signOut, config } = useLumoAuthContext();
    const [signingOut, setSigningOut] = useState(false);

    const resolvedSignOutUrl = afterSignOutUrl || config.afterSignOutUrl || '/';

    const handleSignOut = useCallback(async () => {
        setSigningOut(true);
        await signOut({ afterSignOutUrl: resolvedSignOutUrl });
    }, [signOut, resolvedSignOutUrl]);

    if (!isLoaded) {
        return (
            <div className="la-card" style={{ textAlign: 'center', padding: '2rem' }}>
                <span className="la-spinner" />
            </div>
        );
    }

    if (!isSignedIn || !user) {
        return null;
    }

    const initials = [user.firstName, user.lastName]
        .filter(Boolean)
        .map((n) => n!.charAt(0).toUpperCase())
        .join('') || user.email.charAt(0).toUpperCase();

    const themeClass = appearance?.theme === 'dark'
        ? 'la-dark'
        : appearance?.theme === 'light'
            ? 'la-light'
            : '';

    return (
        <div
            className={`la-card la-profile-card ${themeClass} ${appearance?.className || ''}`}
            style={appearance?.variables as React.CSSProperties}
        >
            {/* Header with avatar and name */}
            <div className="la-profile-header">
                <span className="la-avatar la-avatar-circle la-profile-avatar">
                    {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.displayName} />
                    ) : (
                        initials
                    )}
                </span>
                <div className="la-profile-header-info">
                    <div className="la-profile-name">{user.displayName}</div>
                    <div className="la-profile-email">{user.email}</div>
                </div>
            </div>

            {/* Account details */}
            <div className="la-profile-section">
                <div className="la-profile-section-title">Account</div>
                <div className="la-profile-row">
                    {ICONS.mail}
                    <span className="la-profile-row-label">Email</span>
                    <span className="la-profile-row-value">{user.email}</span>
                    <span className={`la-profile-badge ${user.emailVerified ? 'la-badge-success' : 'la-badge-warning'}`}>
                        {user.emailVerified ? ICONS.check : ICONS.x}
                        {user.emailVerified ? 'Verified' : 'Unverified'}
                    </span>
                </div>
                {user.firstName && (
                    <div className="la-profile-row">
                        {ICONS.user}
                        <span className="la-profile-row-label">Name</span>
                        <span className="la-profile-row-value">
                            {[user.firstName, user.lastName].filter(Boolean).join(' ')}
                        </span>
                    </div>
                )}
            </div>

            {mode === 'full' && (
                <>
                    {/* Security */}
                    <div className="la-profile-section">
                        <div className="la-profile-section-title">Security</div>
                        <div className="la-profile-row">
                            {ICONS.shield}
                            <span className="la-profile-row-label">MFA</span>
                            <span className={`la-profile-badge ${user.mfaEnabled ? 'la-badge-success' : 'la-badge-muted'}`}>
                                {user.mfaEnabled ? ICONS.check : ICONS.x}
                                {user.mfaEnabled ? 'Enabled' : 'Disabled'}
                            </span>
                        </div>
                    </div>

                    {/* Roles & Groups */}
                    {(user.roles.length > 0 || user.groups.length > 0) && (
                        <div className="la-profile-section">
                            <div className="la-profile-section-title">Roles & Groups</div>
                            {user.roles.length > 0 && (
                                <div className="la-profile-row">
                                    {ICONS.key}
                                    <span className="la-profile-row-label">Roles</span>
                                    <div className="la-profile-tags">
                                        {user.roles.map((role) => (
                                            <span key={role} className="la-profile-tag">{role}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {user.groups.length > 0 && (
                                <div className="la-profile-row">
                                    {ICONS.user}
                                    <span className="la-profile-row-label">Groups</span>
                                    <div className="la-profile-tags">
                                        {user.groups.map((group) => (
                                            <span key={group} className="la-profile-tag">{group}</span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}

            {/* Sign out */}
            <div className="la-profile-section la-profile-actions">
                <button
                    type="button"
                    className="la-btn la-btn-outline la-profile-signout-btn"
                    onClick={handleSignOut}
                    disabled={signingOut}
                >
                    {signingOut ? <span className="la-spinner la-spinner-sm" /> : ICONS.signOut}
                    {signingOut ? 'Signing out…' : 'Sign out'}
                </button>
            </div>
        </div>
    );
}
