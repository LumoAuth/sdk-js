'use client';

import { Protect, SignedIn, SignedOut, usePermission, useZanzibar, useAbac, useUser } from '@lumoauth/react';

export default function AuthorizationPage() {
    return (
        <>
            <h1>Authorization</h1>
            <p className="lede">RBAC permissions, Zanzibar relationships, and ABAC policies.</p>

            <SignedOut>
                <p>Sign in to evaluate authorization.</p>
            </SignedOut>

            <SignedIn>
                <div className="note">
                    Every card below returns <b>denied</b> until the matching data exists in your
                    organization — a role binding, a relation tuple, an ABAC policy. Denied here means
                    &quot;not configured&quot;, not &quot;broken&quot;.
                </div>

                <h2>RBAC — usePermission</h2>
                <Rbac />

                <h2>Zanzibar (ReBAC) — useZanzibar</h2>
                <Rebac />

                <h2>ABAC — useAbac</h2>
                <Abac />

                <h2>&lt;Protect&gt;</h2>
                <div className="card">
                    <Protect
                        permission="documents.edit"
                        fallback={<p data-testid="protect-denied">Denied: needs documents.edit</p>}
                    >
                        <p data-testid="protect-allowed">Granted: you have documents.edit</p>
                    </Protect>
                </div>
            </SignedIn>
        </>
    );
}

function Rbac() {
    const { allowed, isLoading } = usePermission('documents.edit');
    return (
        <div className="card">
            <code>documents.edit</code> →{' '}
            <b data-testid="rbac-result">{isLoading ? '…' : String(allowed)}</b>
        </div>
    );
}

function Rebac() {
    // `subject` is required: the SDK does not infer it from the session.
    const user = useUser();
    const { allowed, isLoading } = useZanzibar({
        object: 'document:readme',
        relation: 'viewer',
        subject: user ? `user:${user.id}` : 'user:anonymous',
    });
    return (
        <div className="card">
            <code>document:readme#viewer</code> →{' '}
            <b data-testid="zanzibar-result">{isLoading ? '…' : String(allowed)}</b>
        </div>
    );
}

function Abac() {
    const { allowed, isLoading } = useAbac({
        resourceType: 'document',
        action: 'read',
        resourceId: 'doc-1',
    });
    return (
        <div className="card">
            <code>document:read</code> →{' '}
            <b data-testid="abac-hook-result">{isLoading ? '…' : String(allowed)}</b>
            <p className="note">
                <code>useAbac()</code> collapses every failure — including a transport error — to{' '}
                <code>false</code>. The Home page calls <code>client.abac.check()</code> directly so it can
                distinguish a real denial from a 404.
            </p>
        </div>
    );
}
