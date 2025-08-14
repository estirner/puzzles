"use client";
import React, { useEffect, useRef } from "react";

export default function ParallaxHero({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let targetX = 0; let targetY = 0;
    let px = 0; let py = 0;

    const onMove = (e: MouseEvent) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      targetX = (e.clientX / w) - 0.5;
      targetY = (e.clientY / h) - 0.5;
    };

    function loop() {
      px += (targetX - px) * 0.06;
      py += (targetY - py) * 0.06;
      if (el) {
        el.style.setProperty('--px', px.toFixed(4));
        el.style.setProperty('--py', py.toFixed(4));
      }
      raf = requestAnimationFrame(loop);
    }
    window.addEventListener('mousemove', onMove);
    raf = requestAnimationFrame(loop);
    return () => { window.removeEventListener('mousemove', onMove); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}


