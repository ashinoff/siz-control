import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api, { apiError } from "../api/client.js";

const AuthContext = createContext(null);

const PRIVILEGED = new Set(["admin", "lab", "sue"]);

// Origin of the platform that embeds SIZ in an iframe (platform SSO, step 4).
const PLATFORM_ORIGIN =
  import.meta.env.VITE_PLATFORM_ORIGIN || "https://sue-system-ashinoff.amvera.io";
// Are we running inside an iframe (i.e. potentially embedded by the platform)?
const EMBEDDED = typeof window !== "undefined" && window.self !== window.top;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // While we wait for / exchange a platform token, show "Вход через платформу…"
  // instead of the login form. Only starts pending when embedded in an iframe.
  const [ssoPending, setSsoPending] = useState(EMBEDDED);

  const loadMe = useCallback(async () => {
    // Embedded in the platform iframe: never trust a stale localStorage session,
    // require a fresh platform-token exchange instead (avoids showing the
    // previous user before the new token arrives).
    if (EMBEDDED) {
      localStorage.removeItem("siz_token");
      setUser(null);
      setLoading(false);
      return;
    }
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

  // Platform SSO: exchange a Keycloak token (posted by the platform into the
  // iframe) for a native SIZ session. Falls back silently to normal login on
  // any failure (SSO off, no access, invalid token).
  const exchangePlatformToken = useCallback(
    async (kcToken) => {
      setSsoPending(true);
      try {
        const { data } = await api.post("/api/auth/platform", null, {
          headers: { Authorization: `Bearer ${kcToken}` },
          skipAuthRedirect: true, // handle failure here, don't bounce to /login
        });
        localStorage.setItem("siz_token", data.access_token);
        const me = await api.get("/api/auth/me");
        setUser(me.data);
        return true;
      } catch {
        // In the iframe, clear the session so a previous user doesn't linger.
        if (EMBEDDED) {
          localStorage.removeItem("siz_token");
          setUser(null);
        }
        return false; // fall back to the normal login form
      } finally {
        setSsoPending(false);
      }
    },
    []
  );

  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== PLATFORM_ORIGIN) return; // only trust the platform
      const data = event.data;
      if (!data || data.type !== "platform-auth" || !data.token) return;
      exchangePlatformToken(data.token);
    };
    window.addEventListener("message", onMessage);
    // Tell the platform we're ready to receive the token — closes the race
    // where the platform posts the token before this listener is attached.
    if (EMBEDDED) {
      window.parent.postMessage({ type: "siz-ready" }, PLATFORM_ORIGIN);
    }
    // If embedded but no platform message arrives, stop waiting after a bit and
    // reveal the normal login (fallback).
    const timer = EMBEDDED ? setTimeout(() => setSsoPending(false), 5000) : null;
    return () => {
      window.removeEventListener("message", onMessage);
      if (timer) clearTimeout(timer);
    };
  }, [exchangePlatformToken]);

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
      value={{ user, loading, ssoPending, login, logout, roleCode, isAdmin, isPrivileged, refresh: loadMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
