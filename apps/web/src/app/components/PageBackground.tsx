"use client";
import React from "react";
import { usePathname } from "next/navigation";
import Aurora from "./Aurora";

export default function PageBackground() {
  const pathname = usePathname();
  const p = pathname || "/";
  const isSolver =
    p.startsWith("/sudoku") ||
    p.startsWith("/nonograms") ||
    p.startsWith("/crosswords") ||
    p.startsWith("/wordsearch") ||
    p.startsWith("/cryptogram") ||
    p.startsWith("/kakuro") ||
    // dynamic puzzle routes like /{type}/{id}
    p.split("/").filter(Boolean).length >= 2;

  return (
    <Aurora className="pointer-events-none fixed inset-0 -z-10" frozen={isSolver} />
  );
}


