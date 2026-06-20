import React from "react";
import { NavLink } from "react-router-dom";
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
      { to: "/deadlines", icon: IconClock, label: "Контроль сроков", alertKey: true },
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

export default function Sidebar({ open, alerts = 0, onNavigate }) {
  const { isAdmin, isPrivileged } = useAuth();

  const visible = (item) => {
    if (item.admin && !isAdmin) return false;
    if (item.privileged && !isPrivileged) return false;
    return true;
  };

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
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                    onClick={onNavigate}
                  >
                    <Icon className="ico" size={18} />
                    <span>{item.label}</span>
                    {item.alertKey && alerts > 0 && (
                      <span className="badge-count">{alerts}</span>
                    )}
                  </NavLink>
                );
              })}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
