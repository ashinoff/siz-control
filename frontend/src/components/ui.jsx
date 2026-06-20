import React, { useEffect } from "react";
import { IconX, IconSearch, IconAlert } from "./icons.jsx";

export function Spinner() {
  return <div className="spinner" />;
}

export function Badge({ kind = "badge-gray", children, dot = true }) {
  return (
    <span className={`badge ${kind}`}>
      {dot && <span className="bdot" />}
      {children}
    </span>
  );
}

export function EmptyState({ title = "Нет данных", hint, icon }) {
  return (
    <div className="empty">
      {icon && <div className="ico">{icon}</div>}
      <div style={{ fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>
        {title}
      </div>
      {hint && <div style={{ fontSize: 13 }}>{hint}</div>}
    </div>
  );
}

export function Modal({ open, title, children, onClose, footer, wide = false }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className={`modal ${wide ? "wide" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Закрыть">
            <IconX size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, required }) {
  return (
    <div className="field">
      {label && (
        <label>
          {label} {required && <span style={{ color: "var(--red)" }}>*</span>}
        </label>
      )}
      {children}
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function Input(props) {
  return <input className="input" {...props} />;
}

export function Textarea(props) {
  return <textarea className="textarea" {...props} />;
}

export function Select({ children, ...props }) {
  return (
    <select className="select" {...props}>
      {children}
    </select>
  );
}

export function SearchBox({ value, onChange, placeholder = "Поиск..." }) {
  return (
    <div className="search">
      <IconSearch size={16} />
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export function Alert({ kind = "info", children }) {
  return <div className={`alert alert-${kind}`}>{children}</div>;
}

export function ConfirmDialog({ open, title, message, confirmText = "Подтвердить", danger, onConfirm, onClose }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {danger && (
          <span style={{ color: "var(--red)", flexShrink: 0, marginTop: 1 }}>
            <IconAlert size={22} />
          </span>
        )}
        <p style={{ margin: 0, fontSize: 14, color: "var(--text)" }}>{message}</p>
      </div>
    </Modal>
  );
}
