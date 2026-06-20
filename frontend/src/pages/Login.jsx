import React, { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import { Field, Input, Alert } from "../components/ui.jsx";

export default function Login() {
  const { login } = useAuth();
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
        <div className="login-logo">СК</div>
        <h1>СИЗ Контроль</h1>
        <p className="sub">Система учета средств защиты, материалов и оборудования</p>

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

        <div className="login-demo">
          Демо-доступ: <code>admin</code> / <code>admin123</code>
          <br />
          Пользователь РЭС: <code>res_adler</code> / <code>demo123</code>
        </div>
      </form>
    </div>
  );
}
