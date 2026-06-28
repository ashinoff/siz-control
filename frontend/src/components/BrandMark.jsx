import React from "react";
import rosetiLogo from "../assets/rosseti.svg";
import { useBrandFlash, brandStyleVars } from "../lib/brandFlash.js";

// Россети emblem for the badge (recoloured white via CSS to sit on the blue).
function RosetiMark() {
  return <img className="rosseti" src={rosetiLogo} alt="Россети" draggable="false" />;
}

export default function BrandMark() {
  const { flash, bolt } = useBrandFlash(200, 50, 9);
  const fl = flash ? " is-flash" : "";

  return (
    <div className="sidebar-brand brand-flash" style={brandStyleVars("#dff6ff", "#5ad0ff")}>
      {/* Lightning on the background, spanning the whole brand rectangle. */}
      <svg className="brand-bolt" viewBox="0 0 200 50" preserveAspectRatio="none" aria-hidden="true">
        {flash && (
          <polyline key={bolt.id} className="brand-bolt-line" points={bolt.path} fill="none" pathLength="1" />
        )}
      </svg>
      <div className={`logo brand-spark-box${fl}`}>
        <RosetiMark />
      </div>
      <div className="brand-text">
        <div className={`title brand-spark${fl}`}>СИЗ Контроль</div>
        <div className="subtitle">Учет и контроль</div>
      </div>
    </div>
  );
}
