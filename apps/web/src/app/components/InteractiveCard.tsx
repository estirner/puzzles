"use client";
import Link from "next/link";
import React, { useRef } from "react";

type Props = {
  href?: string;
  className?: string;
  children: React.ReactNode;
};

export default function InteractiveCard({ href, className = "", children }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const px = x / rect.width - 0.5; // -0.5..0.5
    const py = y / rect.height - 0.5;
    const rx = (py * -1) * 8; // tilt degrees
    const ry = px * 12;
    el.style.setProperty("--rx", `${rx}deg`);
    el.style.setProperty("--ry", `${ry}deg`);
    el.style.setProperty("--mx", `${x}px`);
    el.style.setProperty("--my", `${y}px`);
  }
  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", `0deg`);
    el.style.setProperty("--ry", `0deg`);
  }

  const content = (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={`tilt card-surface card-hover relative overflow-hidden ${className}`}
    >
      <div className="shine pointer-events-none absolute inset-0" />
      <div className="tilt-inner relative z-10">{children}</div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block will-change-transform">
        {content}
      </Link>
    );
  }
  return content;
}


