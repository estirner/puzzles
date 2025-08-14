"use client";
import React, { useRef } from "react";

export type InteractiveCardProps = {
  className?: string;
  children: React.ReactNode;
  onClick?: () => void;
  role?: string;
  title?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

export function InteractiveCard({ className = "", children, onClick, role, title, onMouseEnter, onMouseLeave }: InteractiveCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  function onMove(e: React.MouseEvent) {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left; const y = e.clientY - r.top;
    const px = x / r.width - 0.5; const py = y / r.height - 0.5;
    el.style.setProperty("--rx", `${py * -8}deg`);
    el.style.setProperty("--ry", `${px * 12}deg`);
    el.style.setProperty("--mx", `${x}px`); el.style.setProperty("--my", `${y}px`);
  }
  function onLeave() { const el = ref.current; if (!el) return; el.style.setProperty("--rx","0deg"); el.style.setProperty("--ry","0deg"); }
  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={() => { onLeave(); onMouseLeave?.(); }}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      role={role}
      title={title}
      className={`tilt relative overflow-hidden rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 hover:bg-white/[0.08] ${className}`}
    >
      <div className="shine pointer-events-none absolute inset-0" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export default InteractiveCard;


