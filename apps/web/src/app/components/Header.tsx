"use client";
import Link from 'next/link';
import React from 'react';
import InteractiveCard from './InteractiveCard';

const nav = [
  { href: '/explore', label: 'Explore' },
  { href: '/sudoku', label: 'Sudoku' },
  { href: '/nonograms', label: 'Nonograms' },
  { href: '/crosswords', label: 'Crosswords' },
  { href: '/wordsearch', label: 'Word Search' },
  { href: '/cryptogram', label: 'Cryptogram' },
  { href: '/akari', label: 'Akari' },
  { href: '/kakuro', label: 'Kakuro' },
  { href: '/hashi', label: 'Hashi' },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 bg-transparent">
      <div className="w-full bg-white/10 backdrop-blur-2xl supports-[backdrop-filter]:bg-white/10 border-b border-white/15">
        <div className="mx-auto max-w-7xl flex h-16 items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_20px_6px_rgba(34,211,238,0.6)]" />
            <span className="text-2xl md:text-3xl font-extrabold tracking-tight gradient-text">Puzzles</span>
          </Link>
          <div className="flex items-center gap-3">
            <nav className="hidden items-center gap-2 md:flex">
              {nav.map((n) => (
                <InteractiveCard key={n.href} href={n.href} className="nav-card">
                  <span className="px-2 text-sm">{n.label}</span>
                </InteractiveCard>
              ))}
            </nav>
            <a
              href="https://github.com/estirner/puzzles"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View source on GitHub"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md ring-1 ring-white/20 hover:ring-white/40 transition"
              title="GitHub"
            >
              <img
                src="/github.svg"
                alt="GitHub"
                className="h-5 w-5 opacity-80 hover:opacity-100"
              />
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}


