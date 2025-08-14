import React from 'react';

export function GlassCard({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-2xl border border-neutral-800/80 bg-neutral-900/50 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}


