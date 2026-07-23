"use client";

import { useId } from "react";

/**
 * IIQE 做題家 brand mark — an OMR answer-sheet outline.
 *
 * Line-based (stroke) mark in `currentColor`, so it stays light in both
 * themes: near-black strokes in light mode, near-white strokes in dark
 * mode — no solid tile glaring in the dark header. Three hollow option
 * bubbles plus a filled, ticked bottom-right option (答對了); the tick
 * is knocked out of the filled bubble with an SVG mask so it shows the
 * surface behind it. Mask id is derived from useId so multiple
 * instances on one page never collide.
 */
export function SiteMark({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const tick = `sm-tick-${uid}`;

  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true" focusable="false">
      <defs>
        <mask id={tick} maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
          <rect width="64" height="64" fill="#fff" />
          <path
            d="M38.6 42.6l3.1 3.1 5.9-7.3"
            fill="none"
            stroke="#000"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </mask>
      </defs>
      <rect x="4.5" y="4.5" width="55" height="55" rx="13" stroke="currentColor" strokeWidth="4.5" />
      <g stroke="currentColor" strokeWidth="3.6">
        <circle cx="22" cy="22" r="6.8" />
        <circle cx="42" cy="22" r="6.8" />
        <circle cx="22" cy="42" r="6.8" />
      </g>
      <circle cx="42" cy="42" r="9.5" fill="currentColor" mask={`url(#${tick})`} />
    </svg>
  );
}
