import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { apiError } from "../api/client.js";

const AuthContext = createContext(null);

const PRIVILEGED = new Set(["admin", "lab", "sue"]);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = useCallback(async () => {
    const token = localStorage.getItem("siz_token");
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/api/auth/me");
      setUser(data);
    } catch {
      localStorage.removeItem("siz_token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  const login = useCallback(async (username, password) => {
    const form = new URLSearchParams();
    form.append("username", username);
    form.append("password", password);
    try {
      const { data } = await api.post("/api/auth/login", form, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      localStorage.setItem("siz_token", data.access_token);
      const me = await api.get("/api/auth/me");
      setUser(me.data);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: apiError(e, "Не удалось войти") };
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("siz_token");
    setUser(null);
    window.location.href = "/login";
  }, []);

  const roleCode = user?.role?.code;
  const isAdmin = roleCode === "admin";
  const isPrivileged = PRIVILEGED.has(roleCode);

  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, roleCode, isAdmin, isPrivileged, refresh: loadMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
