import React, { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { Field, Input, Alert } from "../components/ui.jsx";
import rosetiLogo from "../assets/rosseti.svg";
import { useBrandFlash, brandStyleVars } from "../lib/brandFlash.js";

export default function Login() {
  const { login } = useAuth();
  const { flash, bolt } = useBrandFlash(220, 120, 11);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const res = await login(username.trim(), password);
    setBusy(false);
    if (!res.ok) setError(res.error);
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand brand-flash" style={brandStyleVars("#2e8bff", "#1565d8")}>
          {/* Lightning on the background of the title block. */}
          <svg className="brand-bolt" viewBox="0 0 220 120" preserveAspectRatio="none" aria-hidden="true">
            {flash && (
              <polyline key={bolt.id} className="brand-bolt-line" points={bolt.path} fill="none" pathLength="1" />
            )}
          </svg>
          <div className={`login-logo brand-spark-box${flash ? " is-flash" : ""}`}>
            <img className="rosseti" src={rosetiLogo} alt="Россети" draggable="false" />
          </div>
          <h1 className={`brand-spark${flash ? " is-flash" : ""}`}>СИЗ Контроль</h1>
          <p className="sub">Система учета средств защиты, материалов и оборудования</p>
        </div>

        {error && <Alert kind="error">{error}</Alert>}

        <Field label="Логин">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            placeholder="Введите логин"
          />
        </Field>
        <Field label="Пароль">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Введите пароль"
          />
        </Field>

        <button
          type="submit"
          className="btn btn-primary"
          style={{ width: "100%", marginTop: 6, padding: "10px" }}
          disabled={busy || !username || !password}
        >
          {busy ? "Вход..." : "Войти"}
        </button>
      </form>
    </div>
  );
}
