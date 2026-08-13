import type { Metadata } from 'next';
import { Providers } from './providers';
import { StatusBar } from '@/components/StatusBar';
import { Nav } from '@/components/Nav';
import './globals.css';

export const metadata: Metadata = {
    title: 'LumoAuth — React SDK showcase',
    description: 'Every working component and hook in @lumoauth/react.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>
                <Providers>
                    <StatusBar />
                    <Nav />
                    <main>{children}</main>
                </Providers>
            </body>
        </html>
    );
}
