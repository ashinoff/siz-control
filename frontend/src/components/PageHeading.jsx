import React from "react";
import { useLocation } from "react-router-dom";
import { routeMeta } from "../lib/menuMeta.js";

// Content-area page title with the route's menu icon beside it, glowing in
// neon blue. The icon is derived from the current route, so pages only pass
// their title text: <PageHeading>Персонал</PageHeading>.
export default function PageHeading({ children }) {
  const { pathname } = useLocation();
  const meta = routeMeta(pathname);
  const Icon = meta?.icon;
  const iconClass =
    meta?.neon === "red"
      ? "page-h1-ico page-h1-ico-red"
      : meta?.neon === "amber"
      ? "page-h1-ico page-h1-ico-amber"
      : "page-h1-ico";

  return (
    <h1 className="page-h1">
      {Icon && <Icon className={iconClass} size={26} />}
      <span>{children}</span>
    </h1>
  );
}
