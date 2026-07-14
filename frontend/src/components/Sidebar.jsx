import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import BrandMark from "./BrandMark.jsx";
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
  IconGear,
  IconClipboard,
  IconChartBar,
  IconUpload,
  IconDatabase,
  IconWriteoff,
  IconTrash,
  IconAlert,
} from "./icons.jsx";

const SECTIONS = [
  {
    label: "Обзор",
    items: [{ to: "/", icon: IconDashboard, label: "Главная", end: true }],
  },
  {
    label: "Учет",
    items: [
      { to: "/all", icon: IconList, label: "Всё" },
      { to: "/ppe", icon: IconShield, label: "СИЗ" },
      { to: "/materials", icon: IconBox, label: "Материалы" },
      { to: "/equipment", icon: IconGear, label: "Оборудование" },
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
      { to: "/verify", icon: IconCheckShield, label: "Поверка", privileged: true, neon: true },
      { to: "/writeoff", icon: IconWriteoff, label: "Списание", neon: "amber" },
    ],
  },
  {
    label: "ТОН",
    items: [
      { to: "/norms", icon: IconClipboard, label: "Нормы по должностям" },
      { to: "/compliance", icon: IconChartBar, label: "Укомплектованность" },
    ],
  },
  {
    label: "Аналитика",
    items: [
      { to: "/holdings", icon: IconChartBar, label: "Наличие" },
    ],
  },
  {
    label: "Контроль",
    items: [
      { to: "/deadlines", icon: IconClock, label: "Контроль сроков", alertKey: true, neon: true },
      { to: "/reports", icon: IconReport, label: "Отчеты" },
      { to: "/journal", icon: IconList, label: "Журнал действий" },
      { to: "/documents", icon: IconBook, label: "Нормативные акты" },
    ],
  },
  {
    label: "Охрана труда",
    items: [
      { to: "/ot/deadlines", icon: IconAlert, label: "Контроль сроков ОТ", otAlertKey: true, neon: true },
      { to: "/ot/report", icon: IconClipboard, label: "Отчёт по ОТ" },
    ],
  },
  {
    label: "Администрирование",
    items: [
      { to: "/catalog", icon: IconBook, label: "Справочники", privileged: true },
      { to: "/import", icon: IconUpload, label: "Импорт позиций", admin: true },
      { to: "/import-issued", icon: IconUpload, label: "Импорт выданного", admin: true },
      { to: "/dbcheck", icon: IconCheckShield, label: "Проверка базы", admin: true },
      { to: "/trash", icon: IconTrash, label: "Удалённое", admin: true, neon: true },
      { to: "/backup", icon: IconDatabase, label: "Бэкап базы", admin: true },
      { to: "/users", icon: IconShieldUser, label: "Пользователи", admin: true },
    ],
  },
];

export default function Sidebar({ open, alerts = 0, otAlerts = 0, onNavigate }) {
  const { isAdmin, isPrivileged } = useAuth();

  const visible = (item) => {
    if (item.admin && !isAdmin) return false;
    if (item.privileged && !isPrivileged) return false;
    return true;
  };

  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <BrandMark />
      <nav className="sidebar-nav">
        {SECTIONS.map((section) => {
          const items = section.items.filter(visible);
          if (!items.length) return null;
          return (
            <div key={section.label}>
              <div className="nav-section-label">{section.label}</div>
              {items.map((item) => {
                const Icon = item.icon;
                const neonStyle =
                  item.neon === "amber"
                    ? { color: "#e8830c", filter: "drop-shadow(0 0 4px rgba(232,131,12,0.9))" }
                    : item.neon
                    ? { color: "#ff1f2e", filter: "drop-shadow(0 0 4px rgba(255,31,46,0.9))" }
                    : undefined;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
                    onClick={onNavigate}
                  >
                    <Icon className="ico" size={18} style={neonStyle} />
                    <span>{item.label}</span>
                    {item.alertKey && alerts > 0 && (
                      <span className="badge-count">{alerts}</span>
                    )}
                    {item.otAlertKey && otAlerts > 0 && (
                      <span className="badge-count">{otAlerts}</span>
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
