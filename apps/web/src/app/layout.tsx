import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "./ServiceWorkerRegister";
import { Header } from "./components/Header";
import PageBackground from "./components/PageBackground";
// Removed SettingsProvider and SettingsDrawer per design simplification

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", preload: false });
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", preload: false });

export const metadata: Metadata = {
  title: "Puzzles – Privacy-first, offline, open",
  description: "A beautiful, open compendium of puzzles. No accounts. No tracking. Offline-capable.",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isDev = process.env.NODE_ENV !== 'production';
  const csp = [
    "default-src 'self'",
    isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    isDev ? "connect-src 'self' ws:" : "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ');
  return (
    <html lang="en" className={`${inter.variable} ${display.variable}`}>
      <head>
        <meta httpEquiv="Permissions-Policy" content="geolocation=(), camera=(), microphone=(), payment=(), interest-cohort=()" />
        <meta httpEquiv="Referrer-Policy" content="no-referrer" />
        {/* Inject CSP via meta for output: export */}
        <meta httpEquiv="Content-Security-Policy" content={csp} />
      </head>
      <body className={inter.className}>
        <PageBackground />
        <Header />
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
