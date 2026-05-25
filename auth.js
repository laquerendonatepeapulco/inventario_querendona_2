const AUTH_TOKEN_KEY = "inventario_querendona-token";
const AUTH_USER_KEY = "inventario_querendona-user";

function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_USER_KEY)) || null;
  } catch {
    return null;
  }
}

function saveCurrentUser(user, token) {
  if (user && token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
    localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  }
}

async function authenticate(username, password) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "No se pudo iniciar sesion");
  saveCurrentUser(payload.user, payload.token);
  return payload.user;
}

async function verifySession() {
  if (!getToken()) return null;
  const response = await apiFetch("/api/session", { redirectOnUnauthorized: false });
  if (!response.ok) {
    saveCurrentUser(null);
    return null;
  }
  const payload = await response.json();
  saveCurrentUser(payload.user, getToken());
  return payload.user;
}

function requireSession() {
  const user = getCurrentUser();
  if (!user || !getToken()) window.location.replace("login.html");
  return user;
}

async function logout() {
  if (getToken()) {
    await apiFetch("/api/auth/logout", { method: "POST", redirectOnUnauthorized: false }).catch(() => {});
  }
  saveCurrentUser(null);
}

async function apiFetch(url, options = {}) {
  const { redirectOnUnauthorized = true, headers, ...rest } = options;
  const response = await fetch(url, {
    ...rest,
    headers: {
      ...(headers || {}),
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {})
    }
  });

  if (response.status === 401 && redirectOnUnauthorized) {
    saveCurrentUser(null);
    window.location.replace("login.html");
  }

  return response;
}

window.Auth = {
  apiFetch,
  authenticate,
  getCurrentUser,
  getToken,
  logout,
  requireSession,
  saveCurrentUser,
  verifySession
};
