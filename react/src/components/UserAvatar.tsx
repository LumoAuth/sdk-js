import React from 'react';
import { useLumoAuthContext } from '../provider';
import type { UserAvatarProps } from '../types';

// ─── UserAvatar Component ─────────────────────────────────────────────

/**
 * Renders the current user's avatar. Displays the profile image
 * if available, otherwise shows initials.
 *
 * @example
 * ```tsx
 * import { UserAvatar } from '@lumoauth/react';
 *
 * // Default (32px)
 * <UserAvatar />
 *
 * // Large with custom size
 * <UserAvatar size={48} />
 *
 * // Square shape
 * <UserAvatar shape="square" />
 * ```
 */
export function UserAvatar({
    size = 32,
    shape = 'circle',
    appearance,
}: UserAvatarProps) {
    const { user, isSignedIn } = useLumoAuthContext();

    if (!isSignedIn || !user) {
        return (
            <span
                className={`la-avatar la-avatar-${shape} ${appearance?.className || ''}`}
                style={{
                    width: size,
                    height: size,
                    fontSize: size * 0.4,
                    ...(appearance?.variables as React.CSSProperties),
                }}
            >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width={size * 0.5} height={size * 0.5}>
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                </svg>
            </span>
        );
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
        <span
            className={`la-avatar la-avatar-${shape} ${themeClass} ${appearance?.className || ''}`}
            style={{
                width: size,
                height: size,
                fontSize: size * 0.4,
                ...(appearance?.variables as React.CSSProperties),
            }}
            title={user.displayName}
        >
            {user.avatarUrl ? (
                <img
                    src={user.avatarUrl}
                    alt={user.displayName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
            ) : (
                initials
            )}
        </span>
    );
}
