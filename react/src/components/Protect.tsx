import React from 'react';
import { usePermission, useZanzibar, useAbac } from '../hooks';
import { useLumoAuthContext } from '../provider';
import type { ProtectProps } from '../types';

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
 * // ReBAC (Zanzibar)
 * <Protect zanzibar={{ object: 'doc:123', relation: 'editor', subject: 'user:alice' }}>
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
    const { isLoaded, isSignedIn } = useLumoAuthContext();

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

function ProtectWithZanzibar({
    zanzibar,
    fallback,
    isLoaded,
    isSignedIn,
    children,
}: {
    zanzibar: { object: string; relation: string; subject?: string };
    fallback: React.ReactNode;
    isLoaded: boolean;
    isSignedIn: boolean;
    children: React.ReactNode;
}) {
    const { allowed, isLoading } = useZanzibar({
        object: zanzibar.object,
        relation: zanzibar.relation,
        subject: zanzibar.subject || 'user:me',
    });

    if (!isLoaded || isLoading) {
        return <div className="la-protect-loading"><span className="la-spinner" /></div>;
    }
    if (!isSignedIn || !allowed) {
        return <>{fallback}</>;
    }
    return <>{children}</>;
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
