import React from 'react';
import { GlassCard } from '@repo/ui';

export function PuzzleLayout({
  title,
  toolbar,
  sidebar,
  children,
}: {
  title: string;
  toolbar?: React.ReactNode;
  sidebar?: React.ReactNode;
  children: React.ReactNode;
}) {
  const hasSidebar = Boolean(sidebar);
  const wrappedToolbar = React.isValidElement(toolbar)
    ? React.cloneElement(toolbar as React.ReactElement<any>, {
        className: `${((toolbar as any)?.props?.className ?? '')} flex flex-wrap max-w-full`.
          replace(/\s+/g, ' ').trim()
      })
    : toolbar;
  return (
    <main className="relative min-h-[calc(100vh-4rem)] overflow-hidden">
      {/* Freeze aurora on puzzle pages to avoid distraction */}
      
      <section className="mx-auto w-full max-w-screen-2xl px-6 py-10">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 md:gap-4">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight gradient-text whitespace-nowrap">{title}</h1>
          {/* Responsive toolbar: below title on small screens; wraps as needed */}
          <div className="w-full md:w-auto max-w-full">
            <div className="flex items-start justify-start md:justify-end max-w-full">
              {wrappedToolbar}
            </div>
          </div>
        </div>
        <div className={`mt-8 grid grid-cols-1 gap-8 ${hasSidebar ? 'lg:grid-cols-[minmax(0,1fr)_20rem]' : ''}`}>
          <GlassCard className="min-w-0 overflow-auto p-4 max-h-[85vh]">
            {children}
          </GlassCard>
          {hasSidebar && (
            <GlassCard>
              {sidebar}
            </GlassCard>
          )}
        </div>
      </section>
    </main>
  );
}


