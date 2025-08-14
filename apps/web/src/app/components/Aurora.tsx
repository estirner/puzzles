"use client";
import React, { useEffect, useRef } from "react";

// A lightweight animated aurora backdrop using canvas gradients.
// No third-party libraries, fully client-side and disabled for prefers-reduced-motion.
export default function Aurora({ className = "", frozen = false }: { className?: string; frozen?: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let t = 0;

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    function resize() {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const width = rect.width || 1;
      const height = rect.height || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    const onResize = () => { resize(); };
    resize();
    window.addEventListener("resize", onResize);

    const colors = [
      [37, 99, 235],    // blue
      [244, 63, 94],    // rose
      [16, 185, 129],   // emerald
      [245, 158, 11],   // amber
    ];

    function paint() {
      if (!canvas) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx!.clearRect(0, 0, w, h);
      ctx!.globalCompositeOperation = "lighter";
      const blobs = 6;
      for (let i = 0; i < blobs; i++) {
        const r = (Math.sin(t * 0.002 + i) + 1) * 0.5; // 0..1
        const angle = (t * 0.0009 + i * 1.1) % (Math.PI * 2);
        const x = w * (0.5 + 0.35 * Math.cos(angle));
        const y = h * (0.5 + 0.35 * Math.sin(angle * 0.9));
        const radius = Math.min(w, h) * (0.25 + 0.12 * Math.sin(t * 0.0012 + i));
        const c = colors[i % colors.length];
        const grad = ctx!.createRadialGradient(x, y, 0, x, y, radius);
        grad.addColorStop(0, `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${0.10 + 0.08 * r})`);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx!.fillStyle = grad as any;
        ctx!.beginPath();
        ctx!.arc(x, y, radius, 0, Math.PI * 2);
        ctx!.fill();
      }
      ctx!.globalCompositeOperation = "source-over";
    }

    function loop() {
      if (!frozen) t += 16;
      paint();
      if (!mql.matches && !frozen) raf = requestAnimationFrame(loop);
    }
    if (!mql.matches) raf = requestAnimationFrame(loop);

    // React to reducedMotion setting toggled in Settings
    const stopIfReduced = () => {
      cancelAnimationFrame(raf);
      if (!mql.matches) raf = requestAnimationFrame(loop);
    };
    document.addEventListener('reduced-motion-toggle', stopIfReduced as any);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
      document.removeEventListener('reduced-motion-toggle', stopIfReduced as any);
    };
  }, [frozen]);

  return (
    <div className={className} aria-hidden>
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/5 via-transparent to-transparent" />
    </div>
  );
}


