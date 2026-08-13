import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useLumoAuthContext } from '../provider';
import type { UserButtonProps } from '../types';
import { sanitizeRedirectUrl } from '../utils/url';

// ─── UserButton Component ─────────────────────────────────────────────

/**
 * Clerk-style user avatar button with dropdown menu.
 *
 * @example
 * ```tsx
 * import { UserButton } from '@lumoauth/react';
 * <UserButton afterSignOutUrl="/" />
 * ```
 */
export function UserButton({
    afterSignOutUrl,
    showName = false,
    appearance,
}: UserButtonProps) {
    const { user, isSignedIn, signOut, config } = useLumoAuthContext();
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const resolvedSignOutUrl = afterSignOutUrl || config.afterSignOutUrl || '/';

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    // Close on Escape
    useEffect(() => {
        function handleEscape(e: KeyboardEvent) {
            if (e.key === 'Escape') setIsOpen(false);
        }
        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            return () => document.removeEventListener('keydown', handleEscape);
        }
    }, [isOpen]);

    const handleSignOut = useCallback(async () => {
        setIsOpen(false);
        await signOut({ afterSignOutUrl: sanitizeRedirectUrl(resolvedSignOutUrl) });
    }, [signOut, resolvedSignOutUrl]);

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
            ref={containerRef}
            className={`la-user-button ${themeClass} ${appearance?.className || ''}`}
            style={appearance?.variables as React.CSSProperties}
        >
            <button
                type="button"
                className="la-user-trigger"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-haspopup="menu"
                aria-label="User menu"
            >
                <span className="la-user-avatar">
                    {user.avatarUrl ? (
                        <img src={user.avatarUrl} alt={user.displayName} />
                    ) : (
                        initials
                    )}
                </span>
                {showName && (
                    <span className="la-user-name">{user.displayName}</span>
                )}
            </button>

            {isOpen && (
                <div className="la-user-dropdown" role="menu">
                    <div className="la-user-dropdown-header">
                        <div className="la-user-dropdown-name">
                            {user.displayName}
                        </div>
                        <div className="la-user-dropdown-email">
                            {user.email}
                        </div>
                    </div>

                    <button
                        type="button"
                        className="la-dropdown-item"
                        role="menuitem"
                        onClick={() => {
                            setIsOpen(false);
                            window.location.href = `${config.domain}/account/profile`;
                        }}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                        Manage account
                    </button>

                    <div className="la-dropdown-divider" />

                    <button
                        type="button"
                        className="la-dropdown-item la-dropdown-item-danger"
                        role="menuitem"
                        onClick={handleSignOut}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        Sign out
                    </button>
                </div>
            )}
        </div>
    );
}
