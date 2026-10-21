
"use strict";

const $ = (id) => document.getElementById(id);

const formatNumber = (value) =>
  Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 3,
  });

const formatMoney = (value) =>
  Number(value || 0).toLocaleString("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  });

const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function showStatus(message, type = "") {
  const element = $("statusMessage");
  element.textContent = message;
  element.className = `status ${type}`.trim();
  element.classList.remove("hidden");
}

function showEmptyRow(id, columns, message) {
  $(id).innerHTML =
    `<tr><td colspan="${columns}" class="empty">${escapeHtml(message)}</td></tr>`;
}

function getFilters() {
  const startDate = $("startDate").value;
  const endDate = $("endDate").value;

  if (!startDate || !endDate) {
    throw new Error("Please select both report dates.");
  }

  if (startDate > endDate) {
    throw new Error("From date cannot be after To date.");
  }

  return { startDate, endDate };
}

function buildQuery(filters) {
  return new URLSearchParams(filters).toString();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401 || response.status === 403) {
    throw new Error("Your session may have expired. Please sign in again.");
  }

  if (!response.ok || data.success === false) {
    throw new Error(data.message || "Unable to load reports.");
  }

  return data;
}

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function renderSummary(summary = {}) {
  $("totalStockIn").textContent = formatNumber(summary.total_stock_in);
  $("totalStockOut").textContent = formatNumber(summary.total_stock_out);
  $("transactionCount").textContent = formatNumber(summary.transaction_count);
  $("netValueChange").textContent = formatMoney(summary.net_stock_value_change);
}

function renderProducts(rows = []) {
  const body = $("productsBody");

  if (!rows.length) {
    showEmptyRow("productsBody", 6, "No product movements for this period.");
    return;
  }

  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.sku)}</td>
      <td>${escapeHtml(row.product_name)}</td>
      <td>${escapeHtml(row.unit_name || "—")}</td>
      <td class="number">${formatNumber(row.stock_in)}</td>
      <td class="number">${formatNumber(row.stock_out)}</td>
      <td class="number">${formatMoney(row.consumption_cost)}</td>
    </tr>
  `).join("");
}

function renderClients(rows = []) {
  const body = $("clientsBody");

  if (!rows.length) {
    showEmptyRow("clientsBody", 4, "No client consumption for this period.");
    return;
  }

  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.client_name)}</td>
      <td class="number">${formatNumber(row.transaction_count)}</td>
      <td class="number">${formatNumber(row.total_quantity)}</td>
      <td class="number">${formatMoney(row.total_cost)}</td>
    </tr>
  `).join("");
}

function renderFiles(rows = []) {
  const body = $("filesBody");

  if (!rows.length) {
    showEmptyRow("filesBody", 6, "No file consumption for this period.");
    return;
  }

  body.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.file_number)}</td>
      <td>${escapeHtml(row.file_title)}</td>
      <td>${escapeHtml(row.client_name || "—")}</td>
      <td class="number">${formatNumber(row.transaction_count)}</td>
      <td class="number">${formatNumber(row.total_quantity)}</td>
      <td class="number">${formatMoney(row.total_cost)}</td>
    </tr>
  `).join("");
}

function renderMovements(rows = []) {
  const body = $("movementsBody");
  $("movementCount").textContent = `${formatNumber(rows.length)} records`;

  if (!rows.length) {
    showEmptyRow("movementsBody", 9, "No transactions found for this period.");
    return;
  }

  body.innerHTML = rows.map((row) => {
    const clientFile = [
      row.client_name,
      row.file_number,
    ].filter(Boolean).join(" / ") || "—";

    return `
      <tr>
        <td>${escapeHtml(formatDate(row.occurred_at))}</td>
        <td>${escapeHtml(row.transaction_number)}</td>
        <td>${escapeHtml(row.movement_type)}</td>
        <td>${escapeHtml(row.product_name)}<br>
          <span class="muted">${escapeHtml(row.sku)}</span>
        </td>
        <td class="number">${formatNumber(row.quantity)} ${escapeHtml(row.unit_name || "")}</td>
        <td class="number">${formatMoney(row.unit_cost)}</td>
        <td class="number">${formatMoney(row.total_cost)}</td>
        <td>${escapeHtml(clientFile)}</td>
        <td>${escapeHtml(row.created_by_name || "—")}</td>
      </tr>
    `;
  }).join("");
}

async function loadReports() {
  const applyButton = $("applyFilters");
  applyButton.disabled = true;

  try {
    const filters = getFilters();
    showStatus("Loading reports for the selected dates...");

    const data = await fetchJson(`/api/reports?${buildQuery(filters)}`);

    renderSummary(data.summary);
    renderProducts(data.products);
    renderClients(data.clients);
    renderFiles(data.files);
    renderMovements(data.movements);

    showStatus(
      `Reports loaded for ${filters.startDate} to ${filters.endDate}.`,
      "success"
    );
  } catch (error) {
    showStatus(error.message || "Unable to load reports.", "error");
  } finally {
    applyButton.disabled = false;
  }
}

async function exportCsv() {
  const button = $("exportButton");
  button.disabled = true;

  try {
    const filters = getFilters();
    showStatus("Preparing CSV export...");

    const response = await fetch(
      `/api/reports/export.csv?${buildQuery(filters)}`,
      {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "text/csv" },
      }
    );

    if (response.status === 401 || response.status === 403) {
      throw new Error("Your session may have expired. Please sign in again.");
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || "CSV export failed.");
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = objectUrl;
    link.download = `inventory-report-${filters.startDate}-to-${filters.endDate}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(objectUrl);
    showStatus("CSV report downloaded successfully.", "success");
  } catch (error) {
    showStatus(error.message || "Unable to export CSV.", "error");
  } finally {
    button.disabled = false;
  }
}

async function logout() {
  try {
    const response = await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      showStatus("Sign out failed. Please try again.", "error");
      return;
    }

    window.location.href = "/login.html";
  } catch {
    showStatus("Unable to sign out. Please try again.", "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);

  $("startDate").value = localDateString(firstDay);
  $("endDate").value = localDateString(today);

  $("filterForm").addEventListener("submit", (event) => {
    event.preventDefault();
    loadReports();
  });

  $("exportButton").addEventListener("click", exportCsv);
  $("logoutButton").addEventListener("click", logout);

  loadReports();
});
