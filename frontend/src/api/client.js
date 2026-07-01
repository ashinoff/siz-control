import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL || "";

const api = axios.create({ baseURL });

// Attach the JWT (if present) to every request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("siz_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear the session and bounce to login. Requests may opt out of the
// redirect with `skipAuthRedirect` (e.g. the platform-token exchange, which
// handles failure gracefully by falling back to the normal login).
api.interceptors.response.use(
  (resp) => resp,
  (error) => {
    if (error.response && error.response.status === 401 && !error.config?.skipAuthRedirect) {
      const onLogin = window.location.pathname === "/login";
      localStorage.removeItem("siz_token");
      if (!onLogin) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

// Extract a human-readable message from a FastAPI error response.
export function apiError(error, fallback = "Произошла ошибка") {
  const d = error?.response?.data?.detail;
  if (!d) return fallback;
  if (typeof d === "string") return d;
  if (Array.isArray(d)) {
    return d.map((e) => e.msg || JSON.stringify(e)).join("; ");
  }
  return fallback;
}

export default api;
