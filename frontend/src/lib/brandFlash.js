import { useEffect, useRef, useState } from "react";

// ── Tunables (частота / длительность вспышки), общие для всех логотипов ────
export const FLASH_GAP_MIN_MS = 5000; // минимальная пауза между вспышками
export const FLASH_GAP_MAX_MS = 8000; // максимальная пауза между вспышками
export const FLASH_DURATION_MS = 650; // длительность одной вспышки (0.4–0.8 c)

// A jagged lightning polyline across a width×height box — fresh path each flash.
export function makeBolt(width, height, segments) {
  const mid = height / 2;
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const x = (width / segments) * i;
    const edge = i === 0 || i === segments;
    const jitter = edge ? height * 0.12 : height * 0.4;
    const y = mid + (Math.random() * 2 - 1) * jitter;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

// Periodic, randomised electric flash. Returns { flash, bolt }. Respects
// prefers-reduced-motion (no flashes — only the static glow stays in CSS).
export function useBrandFlash(width = 200, height = 50, segments = 9) {
  const [flash, setFlash] = useState(false);
  const [bolt, setBolt] = useState(() => ({ id: 0, path: makeBolt(width, height, segments) }));
  const timers = useRef([]);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (mq?.matches) return;

    let cancelled = false;
    let n = 0;
    const push = (t) => timers.current.push(t);
    const clearAll = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };

    const schedule = () => {
      const gap = FLASH_GAP_MIN_MS + Math.random() * (FLASH_GAP_MAX_MS - FLASH_GAP_MIN_MS);
      push(
        setTimeout(() => {
          if (cancelled) return;
          n += 1;
          setBolt({ id: n, path: makeBolt(width, height, segments) });
          setFlash(true);
          push(setTimeout(() => !cancelled && setFlash(false), FLASH_DURATION_MS));
          schedule();
        }, gap)
      );
    };
    schedule();

    const onChange = (e) => {
      if (e.matches) {
        cancelled = true;
        clearAll();
        setFlash(false);
      }
    };
    mq?.addEventListener?.("change", onChange);

    return () => {
      cancelled = true;
      clearAll();
      mq?.removeEventListener?.("change", onChange);
    };
  }, [width, height, segments]);

  return { flash, bolt };
}

// Per-mark colour/duration CSS variables (core = ядро свечения, arc = молния).
export function brandStyleVars(core, arc) {
  return {
    "--brand-flash": `${FLASH_DURATION_MS}ms`,
    "--brand-core": core,
    "--brand-arc": arc,
  };
}
