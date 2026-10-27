import React from 'react';
import { usePermission, useZanzibar, useAbac } from '../hooks';
import { useLumoAuthContext } from '../provider';
import type { LumoAuthUser, ProtectProps } from '../types';

// ─── Protect Component ────────────────────────────────────────────────

/**
 * Authorization gate component. Renders children only if the user
 * has the required permission, relationship, or policy access.
 *
 * Supports RBAC, ReBAC (Zanzibar), and ABAC checks.
 *
 * @example
 * ```tsx
 * // RBAC
 * <Protect permission="documents.edit" fallback={<NoAccess />}>
 *   <EditForm />
 * </Protect>
 *
 * // ReBAC (Zanzibar). Without `subject`, the check is about the
 * // signed-in user (`user:<sub>`).
 * <Protect zanzibar={{ object: 'doc:123', relation: 'editor' }}>
 *   <EditForm />
 * </Protect>
 *
 * // ABAC
 * <Protect abac={{ resourceType: 'document', action: 'read', resourceId: 'doc-123' }}>
 *   <ReadView />
 * </Protect>
 * ```
 */
export function Protect({
    permission,
    zanzibar,
    abac,
    fallback = null,
    children,
}: ProtectProps) {
    const { isLoaded, isSignedIn, user } = useLumoAuthContext();

    // Determine which check to use
    if (permission) {
        return (
            <ProtectWithPermission
                permission={permission}
                fallback={fallback}
                isLoaded={isLoaded}
                isSignedIn={isSignedIn}
            >
                {children}
            </ProtectWithPermission>
        );
    }

    if (zanzibar) {
        return (
            <ProtectWithZanzibar
                zanzibar={zanzibar}
                fallback={fallback}
                isLoaded={isLoaded}
                isSignedIn={isSignedIn}
                user={user}
            >
                {children}
            </ProtectWithZanzibar>
        );
    }

    if (abac) {
        return (
            <ProtectWithAbac
                abac={abac}
                fallback={fallback}
                isLoaded={isLoaded}
                isSignedIn={isSignedIn}
            >
                {children}
            </ProtectWithAbac>
        );
    }

    // If no check specified, just check if user is signed in
    if (!isLoaded) {
        return <div className="la-protect-loading"><span className="la-spinner" /></div>;
    }
    return isSignedIn ? <>{children}</> : <>{fallback}</>;
}

// ─── Internal Sub-components ──────────────────────────────────────────

function ProtectWithPermission({
    permission,
    fallback,
    isLoaded,
    isSignedIn,
    children,
}: {
    permission: string;
    fallback: React.ReactNode;
    isLoaded: boolean;
    isSignedIn: boolean;
    children: React.ReactNode;
}) {
    const { allowed, isLoading } = usePermission(permission);

    if (!isLoaded || isLoading) {
        return <div className="la-protect-loading"><span className="la-spinner" /></div>;
    }
    if (!isSignedIn || !allowed) {
        return <>{fallback}</>;
    }
    return <>{children}</>;
}

/**
 * The Zanzibar subject for a `<Protect zanzibar>` check: the explicit
 * `subject` when given, else `user:<sub>` of the signed-in user. `null` when
 * there is no subject to ask about (nobody is signed in).
 *
 * @internal Exported for tests.
 */
export function resolveZanzibarSubject(
    explicit: string | undefined,
    user: Pick<LumoAuthUser, 'id' | 'sub'> | null | undefined,
): string | null {
    if (explicit) return explicit;
    const sub = user?.sub || user?.id;
    return sub ? `user:${sub}` : null;
}

/** @internal Exported for tests. */
export function ProtectWithZanzibar({
    zanzibar,
    fallback,
    isLoaded,
    isSignedIn,
    user,
    children,
}: {
    zanzibar: { object: string; relation: string; subject?: string };
    fallback: React.ReactNode;
    isLoaded: boolean;
    isSignedIn: boolean;
    user: Pick<LumoAuthUser, 'id' | 'sub'> | null;
    children: React.ReactNode;
}) {
    if (!isLoaded) {
        return <div className="la-protect-loading"><span className="la-spinner" /></div>;
    }
    const subject = isSignedIn ? resolveZanzibarSubject(zanzibar.subject, user) : null;
    if (!subject) {
        // Nobody is signed in (or the profile has no subject yet): there is
        // no one to ask about, so render the fallback and send no request.
        return <>{fallback}</>;
    }
    return (
        <ZanzibarCheck
            object={zanzibar.object}
            relation={zanzibar.relation}
            subject={subject}
            fallback={fallback}
        >
            {children}
        </ZanzibarCheck>
    );
}

function ZanzibarCheck({
    object,
    relation,
    subject,
    fallback,
    children,
}: {
    object: string;
    relation: string;
    subject: string;
    fallback: React.ReactNode;
    children: React.ReactNode;
}) {
    const { allowed, isLoading } = useZanzibar({ object, relation, subject });

    if (isLoading) {
        return <div className="la-protect-loading"><span className="la-spinner" /></div>;
    }
    return allowed ? <>{children}</> : <>{fallback}</>;
}

function ProtectWithAbac({
    abac,
    fallback,
    isLoaded,
    isSignedIn,
    children,
}: {
    abac: { resourceType: string; action: string; resourceId?: string };
    fallback: React.ReactNode;
    isLoaded: boolean;
    isSignedIn: boolean;
    children: React.ReactNode;
}) {
    const { allowed, isLoading } = useAbac({
        resourceType: abac.resourceType,
        action: abac.action,
        resourceId: abac.resourceId,
    });

    if (!isLoaded || isLoading) {
        return <div className="la-protect-loading"><span className="la-spinner" /></div>;
    }
    if (!isSignedIn || !allowed) {
        return <>{fallback}</>;
    }
    return <>{children}</>;
}
