"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("auditSearch");
  const actionFilter = document.getElementById("auditAction");
  const entityFilter = document.getElementById("auditEntity");
  const applyButton = document.getElementById("auditApply");
  const resetButton = document.getElementById("auditReset");
  const message = document.getElementById("auditMessage");
  const tableBody = document.getElementById("auditTableBody");

  function setMessage(text) {
    message.textContent = text;
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short"
    }).format(date);
  }

  function formatFieldLabel(key) {
    const labels = {
      sku: "SKU",
      name: "Name",
      description: "Description",
      category_name: "Category",
      brand_name: "Brand",
      unit_name: "Unit",
      unit_abbreviation: "Unit Abbreviation",
      reorder_level: "Reorder Level",
      is_active: "Status",
      title: "Title",
      file_number: "File Number",
      client_name: "Client",
      contact_person: "Contact Person",
      email: "Email",
      phone: "Phone",
      address: "Address",
      quantity: "Quantity",
      unit_cost: "Unit Cost",
      movement_type: "Movement Type",
      reference_number: "Reference Number",
      vendor_name: "Vendor",
      notes: "Notes",
      status: "Status",
      occurred_at: "Transaction Date",
      created_at: "Created At",
      updated_at: "Updated At",
      application_deadline: "Application Deadline"
    };

    return labels[key] || key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function formatFieldValue(key, value) {
    if (value === null || value === undefined || value === "") {
      return "—";
    }

    if (key === "is_active") {
      if (value === true) return "Active";
      if (value === false) return "Inactive";
    }

    if (
      ["created_at", "updated_at", "occurred_at", "application_deadline"]
        .includes(key) &&
      typeof value === "string" &&
      !Number.isNaN(Date.parse(value))
    ) {
      return formatDate(value);
    }

    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }

    if (typeof value === "object") {
      return JSON.stringify(value);
    }

    return String(value);
  }

  function formatValues(value) {
    if (value === null || value === undefined) {
      return "—";
    }

    if (typeof value !== "object" || Array.isArray(value)) {
      return String(value);
    }

    const ignoredFields = new Set([
      "id",
      "created_by",
      "updated_by",
      "user_id"
    ]);

    const entries = Object.entries(value)
      .filter(([key]) => !ignoredFields.has(key));

    if (entries.length === 0) {
      return "No additional details";
    }

    return entries
      .map(([key, item]) => {
        const label = formatFieldLabel(key);
        const displayValue = formatFieldValue(key, item);

        return `${label}: ${displayValue}`;
      })
      .join("\n");
  }

  function createCell(value, className = "") {
    const cell = document.createElement("td");

    cell.textContent =
      value === null || value === undefined || value === ""
        ? "—"
        : String(value);

    if (className) {
      cell.className = className;
    }

    return cell;
  }

  function createDetailsCell(value) {
    const cell = document.createElement("td");

    cell.className = "audit-details";
    cell.style.whiteSpace = "pre-line";
    cell.textContent = formatValues(value);

    return cell;
  }

  function renderLogs(logs) {
    tableBody.replaceChildren();

    if (!Array.isArray(logs) || logs.length === 0) {
      const row = document.createElement("tr");
      const cell = createCell("No audit logs found.");

      cell.colSpan = 7;
      row.appendChild(cell);
      tableBody.appendChild(row);

      setMessage("No records match the selected filters.");
      return;
    }

    const fragment = document.createDocumentFragment();

    logs.forEach((log) => {
      const row = document.createElement("tr");

      row.appendChild(createCell(formatDate(log.created_at)));

      const userText = log.user_name
        ? `${log.user_name}${log.user_email ? ` (${log.user_email})` : ""}`
        : "System / Unknown user";

      row.appendChild(createCell(userText));

      const actionCell = document.createElement("td");
      const actionBadge = document.createElement("span");

      actionBadge.className = "audit-action";
      actionBadge.textContent = log.action || "—";

      actionCell.appendChild(actionBadge);
      row.appendChild(actionCell);

      row.appendChild(createCell(log.entity_type));
      row.appendChild(createCell(log.entity_id));
      row.appendChild(createDetailsCell(log.old_values));
      row.appendChild(createDetailsCell(log.new_values));

      fragment.appendChild(row);
    });

    tableBody.appendChild(fragment);
    setMessage(`Showing ${logs.length} audit record(s).`);
  }

  async function loadAuditLogs() {
    applyButton.disabled = true;
    setMessage("Loading audit logs...");

    tableBody.replaceChildren();

    const loadingRow = document.createElement("tr");
    const loadingCell = createCell("Loading audit logs...");

    loadingCell.colSpan = 7;
    loadingRow.appendChild(loadingCell);
    tableBody.appendChild(loadingRow);

    const params = new URLSearchParams();
    const search = searchInput.value.trim();
    const action = actionFilter.value;
    const entityType = entityFilter.value;

    if (search) params.set("search", search);
    if (action) params.set("action", action);
    if (entityType) params.set("entity_type", entityType);

    params.set("limit", "100");

    try {
      const response = await fetch(
        `/api/audit-logs?${params.toString()}`,
        {
          method: "GET",
          credentials: "same-origin",
          headers: {
            Accept: "application/json"
          }
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success !== true) {
        throw new Error(data.message || "Unable to load audit logs.");
      }

      renderLogs(data.auditLogs);
    } catch (error) {
      tableBody.replaceChildren();

      const row = document.createElement("tr");
      const cell = createCell(
        error.message || "An error occurred while loading audit logs."
      );

      cell.colSpan = 7;
      row.appendChild(cell);
      tableBody.appendChild(row);

      setMessage(
        "Audit logs could not be loaded. Check your login and server."
      );
    } finally {
      applyButton.disabled = false;
    }
  }

  applyButton.addEventListener("click", loadAuditLogs);

  resetButton.addEventListener("click", () => {
    searchInput.value = "";
    actionFilter.value = "";
    entityFilter.value = "";
    loadAuditLogs();
  });

  searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      loadAuditLogs();
    }
  });

  loadAuditLogs();
});