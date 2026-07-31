const THEME_KEY = "inventario_querendona-theme";

let currentUser = window.Auth.requireSession();
let cashFlowReport = null;
let toastTimer = null;

const formatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

const reportDateFormatter = new Intl.DateTimeFormat("es-MX", {
  day: "2-digit",
  month: "short",
  year: "numeric"
});

const els = {
  currentUserName: document.querySelector("#currentUserName"),
  currentUserRole: document.querySelector("#currentUserRole"),
  mobileCurrentUserName: document.querySelector("#mobileCurrentUserName"),
  mobileCurrentUserRole: document.querySelector("#mobileCurrentUserRole"),
  logoutButtons: document.querySelectorAll("#logoutButton, #mobileLogoutButton"),
  themeButtons: document.querySelectorAll("#themeToggle, #mobileThemeToggle"),
  form: document.querySelector("#cashFlowForm"),
  date: document.querySelector("#cashFlowDate"),
  cashSales: document.querySelector("#cashFlowCashSales"),
  cardSales: document.querySelector("#cashFlowCardSales"),
  note: document.querySelector("#cashFlowNote"),
  entryTotal: document.querySelector("#cashFlowEntryTotal"),
  start: document.querySelector("#cashFlowStart"),
  end: document.querySelector("#cashFlowEnd"),
  loadReport: document.querySelector("#loadCashFlowReport"),
  downloadReports: document.querySelectorAll("#downloadCashFlowReport, #mobileDownloadCashFlowReport"),
  clearForm: document.querySelector("#clearCashFlowForm"),
  totalSales: document.querySelector("#cashFlowTotalSales"),
  totalExpenses: document.querySelector("#cashFlowTotalExpenses"),
  net: document.querySelector("#cashFlowNet"),
  endingBalance: document.querySelector("#cashFlowEndingBalance"),
  openingBalance: document.querySelector("#cashFlowOpeningBalance"),
  rows: document.querySelector("#cashFlowRows"),
  toast: document.querySelector("#toast")
};

async function init() {
  document.body.classList.toggle("dark", localStorage.getItem(THEME_KEY) === "dark");
  currentUser = await window.Auth.verifySession();
  if (!currentUser) {
    window.location.replace("login.html");
    return;
  }

  if (currentUser.role !== "admin") {
    showToast("Solo administradores pueden ver flujo de caja.");
    setTimeout(() => {
      window.location.replace("index.html");
    }, 900);
    return;
  }

  renderSession();
  bindEvents();
  setDefaultDates();
  updateEntryTotal();
  await loadCashFlowReport();
}

function bindEvents() {
  els.logoutButtons.forEach((button) => button.addEventListener("click", logout));
  els.themeButtons.forEach((button) => button.addEventListener("click", toggleTheme));
  els.form.addEventListener("submit", saveCashFlowEntry);
  els.clearForm.addEventListener("click", resetCashFlowForm);
  els.cashSales.addEventListener("input", updateEntryTotal);
  els.cardSales.addEventListener("input", updateEntryTotal);
  els.start.addEventListener("change", () => handleWeekDateChange(els.start.value));
  els.end.addEventListener("change", () => handleWeekDateChange(els.end.value));
  els.loadReport.addEventListener("click", loadCashFlowReport);
  els.downloadReports.forEach((button) => button.addEventListener("click", downloadCashFlowReport));
}

function renderSession() {
  els.currentUserName.textContent = currentUser?.name || "Sin sesion";
  els.currentUserRole.textContent = currentUser?.label || "Administrador";
  els.mobileCurrentUserName.textContent = currentUser?.name || "Sin sesion";
  els.mobileCurrentUserRole.textContent = currentUser?.label || "Administrador";
}

function setDefaultDates() {
  const now = new Date();
  els.date.value = formatDateInput(now);
  setWeekRange(now);
}

function parseDateInputValue(value) {
  const [year, month, day] = String(value || "").split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function weekRangeForDate(value) {
  const reference = value instanceof Date ? value : parseDateInputValue(value);
  if (!reference || Number.isNaN(reference.getTime())) return null;

  const start = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    from: formatDateInput(start),
    to: formatDateInput(end)
  };
}

function setWeekRange(value) {
  const range = weekRangeForDate(value);
  if (!range) return false;

  els.start.value = range.from;
  els.end.value = range.to;
  return true;
}

function handleWeekDateChange(value) {
  if (!setWeekRange(value)) return;
  cashFlowReport = null;
  loadCashFlowReport();
}

function cashFlowQueryString() {
  const params = new URLSearchParams({
    from: els.start.value,
    to: els.end.value
  });
  return params.toString();
}

function updateEntryTotal() {
  const cash = Number(els.cashSales.value || 0);
  const card = Number(els.cardSales.value || 0);
  els.entryTotal.textContent = formatter.format(cash + card);
}

function resetCashFlowForm() {
  els.form.reset();
  els.date.value = formatDateInput(new Date());
  updateEntryTotal();
}

function fillCashFlowForm(item) {
  els.date.value = item.date;
  els.cashSales.value = item.cashSales || "";
  els.cardSales.value = item.cardSales || "";
  els.note.value = item.note || "";
  updateEntryTotal();
  els.cashSales.focus();
}

async function saveCashFlowEntry(event) {
  event.preventDefault();

  const payload = {
    date: els.date.value,
    cashSales: Number(els.cashSales.value || 0),
    cardSales: Number(els.cardSales.value || 0),
    note: els.note.value.trim()
  };

  if (!payload.date) {
    showToast("Selecciona la fecha de venta.");
    return;
  }

  if (!Number.isFinite(payload.cashSales) || payload.cashSales < 0 || !Number.isFinite(payload.cardSales) || payload.cardSales < 0) {
    showToast("Captura ventas validas.");
    return;
  }

  const response = await window.Auth.apiFetch("/api/cash-flow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json();
  if (!response.ok) {
    showToast(result.error || "No se pudo guardar el flujo de caja.");
    return;
  }

  setWeekRange(payload.date);
  cashFlowReport = null;
  await loadCashFlowReport();
  showToast("Ventas guardadas en flujo de caja.");
}

async function loadCashFlowReport() {
  if (!els.start.value || !els.end.value) {
    showToast("Selecciona fecha inicial y final.");
    return;
  }
  setWeekRange(els.start.value);

  const response = await window.Auth.apiFetch(`/api/cash-flow?${cashFlowQueryString()}`);
  const payload = await response.json();
  if (!response.ok) {
    showToast(payload.error || "No se pudo generar el flujo de caja.");
    return;
  }

  cashFlowReport = payload;
  renderCashFlowReport();
}

function renderCashFlowReport() {
  const summary = cashFlowReport?.summary || { totalSales: 0, totalExpenses: 0, netFlow: 0 };

  els.totalSales.textContent = formatter.format(summary.totalSales || 0);
  els.totalExpenses.textContent = formatter.format(summary.totalExpenses || 0);
  els.net.textContent = formatter.format(summary.netFlow || 0);
  els.endingBalance.textContent = formatter.format(cashFlowReport?.endingBalance || 0);
  els.openingBalance.textContent = `Inicial: ${formatter.format(cashFlowReport?.openingBalance || 0)}`;
  els.rows.innerHTML = "";

  if (!cashFlowReport) {
    els.rows.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="empty-state">Genera el flujo para ver ventas, gastos y saldo acumulado.</div>
        </td>
      </tr>`;
    return;
  }

  cashFlowReport.rows.forEach((item) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td class="expense-concept-column" data-label="Fecha">
        <strong>${escapeHtml(formatReportDateLabel(item.date))}</strong>
        <small>${item.expenseEntries || 0} gastos</small>
      </td>
      <td data-label="Venta efectivo">${formatter.format(item.cashSales)}</td>
      <td data-label="Venta tarjeta">${formatter.format(item.cardSales)}</td>
      <td data-label="Venta total">${formatter.format(item.totalSales)}</td>
      <td data-label="Gastos">${formatter.format(item.expenses)}</td>
      <td data-label="Flujo dia">${formatter.format(item.dailyFlow)}</td>
      <td data-label="Acumulado">${formatter.format(item.accumulated)}</td>
      <td data-label="Nota">${escapeHtml(item.note || "Sin nota")}</td>
      <td data-label="Acciones">
        <button class="ghost-button table-edit-button" type="button" data-action="edit-cash-flow" data-date="${escapeHtml(item.date)}">Editar</button>
      </td>
    `;
    els.rows.append(row);
  });

  els.rows.querySelectorAll("[data-action='edit-cash-flow']").forEach((button) => {
    button.addEventListener("click", () => {
      const item = cashFlowReport?.rows.find((row) => row.date === button.dataset.date);
      if (item) fillCashFlowForm(item);
    });
  });
}

async function downloadCashFlowReport() {
  if (!els.start.value || !els.end.value) {
    showToast("Selecciona fecha inicial y final.");
    return;
  }
  setWeekRange(els.start.value);

  const response = await window.Auth.apiFetch(`/api/cash-flow.xlsx?${cashFlowQueryString()}`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    showToast(payload.error || "No se pudo descargar el flujo de caja.");
    return;
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `flujo-caja-${els.start.value}-a-${els.end.value}.xlsx`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("Flujo de caja descargado.");
}

async function logout() {
  await window.Auth.logout();
  window.location.href = "login.html";
}

function toggleTheme() {
  const nextTheme = document.body.classList.contains("dark") ? "light" : "dark";
  localStorage.setItem(THEME_KEY, nextTheme);
  document.body.classList.toggle("dark", nextTheme === "dark");
  showToast(nextTheme === "dark" ? "Tema oscuro activado." : "Tema claro activado.");
}

function formatReportDateLabel(value) {
  const date = parseDateInputValue(value);
  if (!date) return value || "";
  return reportDateFormatter.format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message) {
  if (!els.toast) return;
  clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 3200);
}

init();
