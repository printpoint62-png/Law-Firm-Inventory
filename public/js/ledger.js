
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const ledgerBody = document.getElementById("ledgerBody");
  const resultCount = document.getElementById("resultCount");
  const pageInfo = document.getElementById("pageInfo");
  const prevButton = document.getElementById("prevButton");
  const nextButton = document.getElementById("nextButton");
  const filterForm = document.getElementById("filterForm");
  const resetButton = document.getElementById("resetButton");
  const pageSize = document.getElementById("pageSize");
  const exportButton = document.getElementById("exportButton");

  let currentPage = 1;
  let totalPages = 1;
  let currentRows = [];
  let requestNumber = 0;

  const escapeHTML = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (character) => {
      const entities = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      };
      return entities[character];
    });

  const formatNumber = (value) => {
    const number = Number(value);
    return Number.isFinite(number)
      ? number.toLocaleString("en-IN", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 3
        })
      : "—";
  };

  const formatMoney = (value) => {
    const number = Number(value);
    return Number.isFinite(number)
      ? number.toLocaleString("en-IN", {
          style: "currency",
          currency: "INR",
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })
      : "—";
  };

  const formatDate = (value) => {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const showMessage = (message, isError = false) => {
    ledgerBody.innerHTML = `
      <tr>
        <td colspan="11" class="status ${isError ? "error" : ""}">
          ${escapeHTML(message)}
        </td>
      </tr>
    `;
  };

  const renderRows = (rows) => {
    if (!rows.length) {
      showMessage("No transactions found for the selected filters.");
      return;
    }

    ledgerBody.innerHTML = rows.map((row) => {
      const stockIn = Number(row.stock_in || 0);
      const stockOut = Number(row.stock_out || 0);

      const clientFile = [
        row.client_name,
        row.file_number
      ].filter(Boolean);

      return `
        <tr>
          <td class="number">${escapeHTML(formatDate(row.occurred_at))}</td>

          <td>
            <strong>${escapeHTML(row.transaction_number || "—")}</strong>
            <div class="muted">${escapeHTML(row.reference_number || "")}</div>
          </td>

          <td>
            <div class="product-name">${escapeHTML(row.product_name || "—")}</div>
            <div class="muted">SKU: ${escapeHTML(row.sku || "—")}</div>
          </td>

          <td>
            <span class="movement">${escapeHTML(row.movement_type || "—")}</span>
          </td>

          <td class="number positive">
            ${stockIn > 0 ? "+" : ""}${escapeHTML(formatNumber(stockIn))}
          </td>

          <td class="number negative">
            ${stockOut > 0 ? "-" : ""}${escapeHTML(formatNumber(stockOut))}
          </td>

          <td class="number"><strong>${escapeHTML(formatNumber(row.balance_after))}</strong></td>

          <td class="number">${escapeHTML(formatMoney(row.unit_cost))}</td>

          <td>
            ${escapeHTML(clientFile.join(" / ") || "—")}
            ${row.file_title ? `<div class="muted">${escapeHTML(row.file_title)}</div>` : ""}
          </td>

          <td>${escapeHTML(row.issued_to_name || "—")}</td>

          <td>${escapeHTML(row.created_by_name || "—")}</td>
        </tr>
      `;
    }).join("");
  };

  const loadLedger = async () => {
    const thisRequest = ++requestNumber;
    showMessage("Loading transactions...");
    resultCount.textContent = "Loading...";

    const query = new URLSearchParams();
    query.set("page", String(currentPage));
    query.set("limit", pageSize.value);

    const filterIds = [
      ["search", "search"],
      ["movement_type", "movementType"],
      ["reference_number", "reference"],
      ["from", "fromDate"],
      ["to", "toDate"]
    ];

    filterIds.forEach(([parameter, elementId]) => {
      const element = document.getElementById(elementId);
      const value = element?.value?.trim();

      if (value) query.set(parameter, value);
    });

    try {
      const response = await fetch(`/api/ledger?${query.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin"
      });

      let result;

      try {
        result = await response.json();
      } catch {
        throw new Error("Server returned an invalid response. Please try again.");
      }

      if (thisRequest !== requestNumber) return;

      if (response.status === 401) {
        showMessage("Your session has expired. Please log in again.", true);
        resultCount.textContent = "Not authenticated";
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(result.message || `Unable to load ledger (${response.status}).`);
      }

      currentRows = Array.isArray(result.data) ? result.data : [];

      const pagination = result.pagination || {};
      totalPages = Math.max(1, Number(pagination.totalPages) || 1);
      currentPage = Number(pagination.page) || currentPage;

      renderRows(currentRows);

      const total = Number(pagination.total) || 0;
      resultCount.textContent = `${total.toLocaleString("en-IN")} transaction(s)`;
      pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

      prevButton.disabled = currentPage <= 1;
      nextButton.disabled = currentPage >= totalPages;
    } catch (error) {
      if (thisRequest !== requestNumber) return;

      currentRows = [];
      showMessage(error.message || "Unable to load ledger.", true);
      resultCount.textContent = "Could not load transactions";
      pageInfo.textContent = `Page ${currentPage}`;
      prevButton.disabled = true;
      nextButton.disabled = true;

      console.error("Stock ledger error:", error);
    }
  };

  filterForm.addEventListener("submit", (event) => {
    event.preventDefault();
    currentPage = 1;
    loadLedger();
  });

  resetButton.addEventListener("click", () => {
    filterForm.reset();
    pageSize.value = "25";
    currentPage = 1;
    loadLedger();
  });

  pageSize.addEventListener("change", () => {
    currentPage = 1;
    loadLedger();
  });

  prevButton.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage -= 1;
      loadLedger();
    }
  });

  nextButton.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage += 1;
      loadLedger();
    }
  });

  exportButton.addEventListener("click", () => {
    if (!currentRows.length) {
      alert("There are no transactions on this page to export.");
      return;
    }

    const columns = [
      ["Date & Time", (row) => formatDate(row.occurred_at)],
      ["Transaction Number", (row) => row.transaction_number],
      ["Reference Number", (row) => row.reference_number],
      ["SKU", (row) => row.sku],
      ["Product", (row) => row.product_name],
      ["Movement Type", (row) => row.movement_type],
      ["Stock In", (row) => row.stock_in],
      ["Stock Out", (row) => row.stock_out],
      ["Balance After", (row) => row.balance_after],
      ["Unit Cost", (row) => row.unit_cost],
      ["Client", (row) => row.client_name],
      ["File Number", (row) => row.file_number],
      ["File Title", (row) => row.file_title],
      ["Issued To", (row) => row.issued_to_name],
      ["Created By", (row) => row.created_by_name],
      ["Notes", (row) => row.notes]
    ];

    const csvEscape = (value) => {
      let text = String(value ?? "");

      // Prevent spreadsheet formula injection for text values.
      if (/^[\s]*[=+\-@]/.test(text)) {
        text = "'" + text;
      }

      return `"${text.replace(/"/g, '""')}"`;
    };

    const csv = [
      columns.map(([heading]) => csvEscape(heading)).join(","),
      ...currentRows.map((row) =>
        columns.map(([, getValue]) => csvEscape(getValue(row))).join(",")
      )
    ].join("\r\n");

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `stock-ledger-page-${currentPage}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  loadLedger();
});
