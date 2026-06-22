import React from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import {
  IconDashboard,
  IconShield,
  IconBox,
  IconWarehouse,
  IconUsers,
  IconArrowOut,
  IconArrowIn,
  IconMove,
  IconCheckShield,
  IconClock,
  IconReport,
  IconBook,
  IconShieldUser,
  IconList,
} from "./icons.jsx";

const DEADLINE_SUBS = [
  { key: "exp_expiring", label: "Истекает экспл.", countKey: "expiring_soon" },
  { key: "exp_expired", label: "Просрочено экспл.", countKey: "expired" },
  { key: "ver_expiring", label: "Истекает поверка", countKey: "verification_expiring" },
  { key: "ver_expired", label: "Просрочена поверка", countKey: "verification_expired" },
];

const SECTIONS = [
  {
    label: "Обзор",
    items: [{ to: "/", icon: IconDashboard, label: "Главная", end: true }],
  },
  {
    label: "Учет",
    items: [
      { to: "/ppe", icon: IconShield, label: "СИЗ" },
      { to: "/equipment", icon: IconBox, label: "Материалы и оборудование" },
      { to: "/warehouse", icon: IconWarehouse, label: "Склад" },
      { to: "/employees", icon: IconUsers, label: "Персонал" },
    ],
  },
  {
    label: "Операции",
    items: [
      { to: "/issue", icon: IconArrowOut, label: "Выдача" },
      { to: "/return", icon: IconArrowIn, label: "Возврат" },
      { to: "/move", icon: IconMove, label: "Перемещение", privileged: true },
      { to: "/verify", icon: IconCheckShield, label: "Поверка", privileged: true },
    ],
  },
  {
    label: "Контроль",
    items: [
      { to: "/deadlines", icon: IconClock, label: "Контроль сроков", hasDeadlineSubs: true },
      { to: "/reports", icon: IconReport, label: "Отчеты" },
      { to: "/journal", icon: IconList, label: "Журнал действий" },
    ],
  },
  {
    label: "Администрирование",
    items: [
      { to: "/catalog", icon: IconBook, label: "Справочники", privileged: true },
      { to: "/users", icon: IconShieldUser, label: "Пользователи", admin: true },
    ],
  },
];

export default function Sidebar({ open, alertCounts = {}, onNavigate }) {
  const { isAdmin, isPrivileged } = useAuth();
  const location = useLocation();

  const visible = (item) => {
    if (item.admin && !isAdmin) return false;
    if (item.privileged && !isPrivileged) return false;
    return true;
  };

  const totalAlerts =
    (alertCounts.expiring_soon || 0) +
    (alertCounts.expired || 0) +
    (alertCounts.verification_expiring || 0) +
    (alertCounts.verification_expired || 0);

  const isOnDeadlines = location.pathname === "/deadlines";

  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="sidebar-brand">
        <div className="logo">СК</div>
        <div>
          <div className="title">СИЗ Контроль</div>
          <div className="subtitle">Учет и контроль</div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {SECTIONS.map((section) => {
          const items = section.items.filter(visible);
          if (!items.length) return null;
          return (
            <div key={section.label}>
              <div className="nav-section-label">{section.label}</div>
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <React.Fragment key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                      onClick={onNavigate}
                    >
                      <Icon className="ico" size={18} />
                      <span>{item.label}</span>
                      {item.hasDeadlineSubs && totalAlerts > 0 && (
                        <span className="badge-count">{totalAlerts}</span>
                      )}
                    </NavLink>
                    {item.hasDeadlineSubs && isOnDeadlines && (
                      <div className="nav-subs">
                        {DEADLINE_SUBS.map((sub) => {
                          const cnt = alertCounts[sub.countKey] || 0;
                          return (
                            <div key={sub.key} className="nav-sub-item">
                              <span>{sub.label}</span>
                              {cnt > 0 && <span className="badge-count">{cnt}</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
