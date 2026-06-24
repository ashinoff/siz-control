import React, { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "./Sidebar.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import api, { apiError } from "../api/client.js";
import { initials, ROLE_LABEL } from "../lib/format.js";
import { IconLogout, IconMenu, IconKey } from "./icons.jsx";
import { Modal, Field, Input, Alert } from "./ui.jsx";

const TITLES = {
  "/": "Главная",
  "/ppe": "Средства индивидуальной защиты",
  "/materials": "Материалы",
  "/equipment": "Оборудование",
  "/warehouse": "Склад",
  "/employees": "Персонал",
  "/issue": "Выдача",
  "/return": "Возврат",
  "/move": "Перемещение",
  "/verify": "Поверка",
  "/norms": "ТОН — Нормы по должностям",
  "/compliance": "Укомплектованность",
  "/deadlines": "Контроль сроков",
  "/reports": "Отчеты",
  "/journal": "Журнал действий",
  "/catalog": "Справочники",
  "/import": "Импорт позиций",
  "/import-issued": "Импорт реестра выданного",
  "/dbcheck": "Проверка базы данных",
  "/backup": "Резервное копирование",
  "/users": "Пользователи",
};

export default function Layout() {
  const { user, logout, roleCode } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [alerts, setAlerts] = useState(0);
  const [pwOpen, setPwOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let active = true;
    api
      .get("/api/dashboard")
      .then(({ data }) => {
        if (active) setAlerts(data.alert_items || 0);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [location.pathname]);

  const title = TITLES[location.pathname] || "СИЗ Контроль";

  return (
    <div className="app-shell">
      <Sidebar open={sidebarOpen} alerts={alerts} />
      <div className="main-area">
        <header className="topbar">
          <button
            className="btn btn-icon btn-ghost menu-toggle"
            onClick={() => setSidebarOpen((o) => !o)}
          >
            <IconMenu size={20} />
          </button>
          <div className="page-title">{title}</div>
          <div className="spacer" />
          <div style={{ position: "relative" }}>
            <div className="user-chip" onClick={() => setMenuOpen((o) => !o)}>
              <div className="avatar">{initials(user?.full_name)}</div>
              <div>
                <div className="uname">{user?.full_name}</div>
                <div className="urole">{ROLE_LABEL[roleCode] || roleCode}</div>
              </div>
            </div>
            {menuOpen && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 8px)",
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRadius: 9,
                  boxShadow: "var(--shadow)",
                  minWidth: 200,
                  padding: 6,
                  zIndex: 50,
                }}
              >
                <button
                  className="btn btn-ghost"
                  style={{ width: "100%", justifyContent: "flex-start" }}
                  onClick={() => {
                    setPwOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  <IconKey size={17} /> Сменить пароль
                </button>
                <button
                  className="btn btn-ghost"
                  style={{ width: "100%", justifyContent: "flex-start", color: "var(--red)" }}
                  onClick={logout}
                >
                  <IconLogout size={17} /> Выйти
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="page">
          <Outlet />
        </main>
      </div>
      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}

function ChangePasswordModal({ open, onClose }) {
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setMsg(null);
    setBusy(true);
    try {
      await api.post("/api/auth/change-password", {
        old_password: oldPw,
        new_password: newPw,
      });
      setMsg({ kind: "success", text: "Пароль изменен" });
      setOldPw("");
      setNewPw("");
    } catch (e) {
      setMsg({ kind: "error", text: apiError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Смена пароля"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Закрыть
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !oldPw || !newPw}>
            Сохранить
          </button>
        </>
      }
    >
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Field label="Текущий пароль" required>
        <Input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
      </Field>
      <Field label="Новый пароль" required hint="Минимум 4 символа">
        <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
      </Field>
    </Modal>
  );
}
