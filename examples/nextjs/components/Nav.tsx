'use client';

import Link from 'next/link';

const ROUTES: Array<[string, string]> = [
    ['/', 'Home'],
    ['/sign-in', 'Sign in'],
    ['/embedded', 'Embedded'],
    ['/sign-up', 'Sign up'],
    ['/dashboard', 'Dashboard'],
    ['/authorization', 'Authorization'],
    ['/storage', 'Storage'],
    ['/cross-tab', 'Cross-tab'],
];

export function Nav() {
    return (
        <nav>
            {ROUTES.map(([href, label]) => (
                <Link key={href} href={href}>
                    {label}
                </Link>
            ))}
        </nav>
    );
}
