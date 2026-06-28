import React, { useEffect, useRef, useState } from "react";

// ── Tunables (частота / длительность / яркость вспышки) ───────────────────
const FLASH_GAP_MIN_MS = 5000; // минимальная пауза между вспышками
const FLASH_GAP_MAX_MS = 8000; // максимальная пауза между вспышками
const FLASH_DURATION_MS = 650; // длительность одной вспышки (0.4–0.8 c)
const GLOW_CORE = "#dff6ff"; // бело-голубое ядро свечения (яркость)
const GLOW_ARC = "#5ad0ff"; // электрический синий (молния / дуга)

// A jagged lightning polyline across a width×height box. Endpoints stay near
// the vertical centre, the middle is jittered — a fresh path every flash.
function makeBolt(width, height, segments) {
  const mid = height / 2;
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const x = (width / segments) * i;
    const edge = i === 0 || i === segments;
    const jitter = edge ? height * 0.16 : height * 0.42;
    const y = mid + (Math.random() * 2 - 1) * jitter;
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(" ");
}

function newBolt(id) {
  return { id, title: makeBolt(150, 34, 7), arc: makeBolt(32, 32, 5) };
}

export default function BrandMark() {
  const [flash, setFlash] = useState(false);
  const [bolt, setBolt] = useState(() => newBolt(0));
  const timers = useRef([]);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    // Respect reduced motion: no flashes at all, only the faint static glow.
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
          setBolt(newBolt(n)); // new random lightning path
          setFlash(true);
          push(setTimeout(() => !cancelled && setFlash(false), FLASH_DURATION_MS));
          schedule(); // queue the next flash at a fresh random gap
        }, gap)
      );
    };
    schedule();

    // If the user turns reduced-motion on mid-session, stop flashing.
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
  }, []);

  const cls = `brand-electric${flash ? " is-flash" : ""}`;
  const styleVars = {
    "--brand-flash": `${FLASH_DURATION_MS}ms`,
    "--brand-core": GLOW_CORE,
    "--brand-arc": GLOW_ARC,
  };

  return (
    <div className="sidebar-brand" style={styleVars}>
      <div className={`logo ${cls}`}>
        <span>СК</span>
        <svg className="brand-arc" viewBox="0 0 32 32" preserveAspectRatio="none" aria-hidden="true">
          {flash && (
            <polyline key={bolt.id} className="brand-arc-line" points={bolt.arc} fill="none" pathLength="1" />
          )}
        </svg>
      </div>
      <div className="brand-text">
        <div className="title-wrap">
          <div className={`title ${cls}`}>СИЗ Контроль</div>
          <svg className="brand-bolt" viewBox="0 0 150 34" preserveAspectRatio="none" aria-hidden="true">
            {flash && (
              <polyline key={bolt.id} className="brand-bolt-line" points={bolt.title} fill="none" pathLength="1" />
            )}
          </svg>
        </div>
        <div className="subtitle">Учет и контроль</div>
      </div>
    </div>
  );
}
