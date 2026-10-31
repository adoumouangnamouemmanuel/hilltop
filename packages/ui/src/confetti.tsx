"use client";

import { motion, useReducedMotion } from "framer-motion";

const COLORS = ["#a8323f", "#d9b45a", "#1f7a4d", "#121010"];

// Fixed angles keep server and client output identical.
const pieces = (count: number, spread: number) =>
  Array.from({ length: count }, (_, i) => ({
    angle: (i / count) * Math.PI * 2,
    dist: spread + (i % 3) * (spread / 3),
    color: COLORS[i % COLORS.length],
  }));

/** A one-shot burst of dots from the centre of its parent. Skipped when motion is reduced. */
export function Confetti({
  count = 16,
  spread = 70,
  delay = 0.3,
  size = 8,
}: {
  count?: number;
  spread?: number;
  delay?: number;
  size?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <span className="pointer-events-none absolute inset-0" aria-hidden>
      {pieces(count, spread).map((p, i) => (
        <motion.span
          key={i}
          className="absolute top-1/2 left-1/2 rounded-full"
          style={{ backgroundColor: p.color, width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }}
          initial={{ x: 0, y: 0, opacity: 0 }}
          animate={{ x: Math.cos(p.angle) * p.dist, y: Math.sin(p.angle) * p.dist, opacity: [0, 1, 0] }}
          transition={{ delay, duration: 1.1, ease: "easeOut" }}
        />
      ))}
    </span>
  );
}
