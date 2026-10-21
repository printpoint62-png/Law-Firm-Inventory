
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const elements = {
    logoutButton: document.getElementById("logoutButton"),
    newClientButton: document.getElementById("newClientButton"),
    clientFormPanel: document.getElementById("clientFormPanel"),
    formHeading: document.getElementById("formHeading"),
    clientForm: document.getElementById("clientForm"),
    clientCode: document.getElementById("clientCode"),
    clientName: document.getElementById("clientName"),
    contactPerson: document.getElementById("contactPerson"),
    clientEmail: document.getElementById("clientEmail"),
    clientPhone: document.getElementById("clientPhone"),
    clientAddress: document.getElementById("clientAddress"),
    clientNotes: document.getElementById("clientNotes"),
    saveClientButton: document.getElementById("saveClientButton"),
    cancelFormButton: document.getElementById("cancelFormButton"),
    formMessage: document.getElementById("formMessage"),
    searchInput: document.getElementById("searchInput"),
    statusFilter: document.getElementById("statusFilter"),
    refreshButton: document.getElementById("refreshButton"),
    clientsTableBody: document.getElementById("clientsTableBody"),
    clientCount: document.getElementById("clientCount"),
    listMessage: document.getElementById("listMessage"),
  };

  let editingClientId = null;
  let clients = [];
  let searchTimer = null;
  let isSaving = false;
  let isLoading = false;

  function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `message ${type}`;
  }

  function clearMessage(element) {
    element.textContent = "";
    element.className = "message";
  }

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });

    let data;

    try {
      data = await response.json();
    } catch {
      throw new Error("The server returned an unexpected response.");
    }

    if (response.status === 401) {
      window.location.replace("/login.html");
      throw new Error("Your session has expired. Please sign in again.");
    }

    if (response.status === 403) {
      throw new Error("You do not have permission to manage clients.");
    }

    if (!response.ok || data.success !== true) {
      throw new Error(data.message || "The request could not be completed.");
    }

    return data;
  }

  async function verifyAdminSession() {
    const data = await apiRequest("/api/auth/me");

    if (!data.user || data.user.role !== "Admin") {
      window.location.replace("/dashboard.html");
      return false;
    }

    return true;
  }

  function resetForm() {
    elements.clientForm.reset();
    editingClientId = null;
    elements.formHeading.textContent = "Add New Client";
    elements.saveClientButton.textContent = "Save Client";
    elements.clientCode.readOnly = false;
    clearMessage(elements.formMessage);
  }

  function openCreateForm() {
    resetForm();
    elements.clientFormPanel.classList.remove("hidden");
    elements.clientCode.focus();
    elements.clientFormPanel.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function closeForm() {
    if (isSaving) return;

    resetForm();
    elements.clientFormPanel.classList.add("hidden");
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  function createCell(text, className = "") {
    const cell = document.createElement("td");
    cell.textContent = text || "—";

    if (className) {
      cell.className = className;
    }

    return cell;
  }

  function createActionButton(label, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `button ${className}`;
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  function renderClients() {
    elements.clientsTableBody.replaceChildren();

    if (clients.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");

      cell.colSpan = 6;
      cell.className = "empty-state";
      cell.textContent = "No clients found. Add a client or change your filters.";

      row.appendChild(cell);
      elements.clientsTableBody.appendChild(row);
      elements.clientCount.textContent = "0 clients displayed";
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const client of clients) {
      const row = document.createElement("tr");

      const identityCell = document.createElement("td");
      const name = document.createElement("div");
      const code = document.createElement("div");

      name.className = "client-name";
      name.textContent = client.name;

      code.className = "client-code";
      code.textContent = client.client_code;

      identityCell.append(name, code);

      const contactCell = createCell(client.contact_person);
      const detailsCell = document.createElement("td");

      const email = document.createElement("div");
      const phone = document.createElement("div");

      email.textContent = client.email || "—";
      phone.textContent = client.phone || "—";
      phone.style.marginTop = "4px";
      phone.style.color = "#667085";

      detailsCell.append(email, phone);

      const statusCell = document.createElement("td");
      const badge = document.createElement("span");

      badge.className = client.is_active
        ? "status-badge status-active"
        : "status-badge status-inactive";

      badge.textContent = client.is_active ? "Active" : "Inactive";
      statusCell.appendChild(badge);

      const createdCell = createCell(formatDate(client.created_at));

      const actionsCell = document.createElement("td");
      const actions = document.createElement("div");
      actions.className = "row-actions";

      actions.appendChild(
        createActionButton("Edit", "button-secondary", () => {
          openEditForm(client);
        })
      );

      actions.appendChild(
        createActionButton(
          client.is_active ? "Deactivate" : "Reactivate",
          client.is_active ? "button-danger" : "button-primary",
          () => changeClientStatus(client)
        )
      );

      actionsCell.appendChild(actions);

      row.append(
        identityCell,
        contactCell,
        detailsCell,
        statusCell,
        createdCell,
        actionsCell
      );

      fragment.appendChild(row);
    }

    elements.clientsTableBody.appendChild(fragment);
    elements.clientCount.textContent =
      `${clients.length} client${clients.length === 1 ? "" : "s"} displayed`;
  }

  async function loadClients() {
    if (isLoading) return;

    isLoading = true;
    elements.refreshButton.disabled = true;
    clearMessage(elements.listMessage);

    elements.clientsTableBody.replaceChildren();

    const loadingRow = document.createElement("tr");
    const loadingCell = document.createElement("td");

    loadingCell.colSpan = 6;
    loadingCell.className = "empty-state";
    loadingCell.textContent = "Loading clients...";
    loadingRow.appendChild(loadingCell);
    elements.clientsTableBody.appendChild(loadingRow);

    try {
      const params = new URLSearchParams();

      const search = elements.searchInput.value.trim();
      const status = elements.statusFilter.value;

      if (search) params.set("search", search);
      params.set("status", status);

      const data = await apiRequest(`/api/clients?${params.toString()}`);

      clients = data.clients;
      renderClients();
    } catch (error) {
      clients = [];
      renderClients();
      showMessage(
        elements.listMessage,
        error.message || "Unable to load clients.",
        "error"
      );
    } finally {
      isLoading = false;
      elements.refreshButton.disabled = false;
    }
  }

  function openEditForm(client) {
    resetForm();

    editingClientId = client.id;
    elements.formHeading.textContent = "Edit Client";
    elements.saveClientButton.textContent = "Update Client";

    elements.clientCode.value = client.client_code;
    elements.clientName.value = client.name;
    elements.contactPerson.value = client.contact_person || "";
    elements.clientEmail.value = client.email || "";
    elements.clientPhone.value = client.phone || "";
    elements.clientAddress.value = client.address || "";
    elements.clientNotes.value = client.notes || "";

    // Keep client codes stable after creation to protect references.
    elements.clientCode.readOnly = true;

    elements.clientFormPanel.classList.remove("hidden");
    elements.clientName.focus();

    elements.clientFormPanel.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  async function saveClient(event) {
    event.preventDefault();

    if (isSaving) return;

    if (!elements.clientForm.reportValidity()) return;

    const payload = {
      client_code: elements.clientCode.value.trim(),
      name: elements.clientName.value.trim(),
      contact_person: elements.contactPerson.value.trim(),
      email: elements.clientEmail.value.trim(),
      phone: elements.clientPhone.value.trim(),
      address: elements.clientAddress.value.trim(),
      notes: elements.clientNotes.value.trim(),
    };

    if (!payload.client_code || !payload.name) {
      showMessage(
        elements.formMessage,
        "Client code and client name are required.",
        "error"
      );
      return;
    }

    const editing = editingClientId !== null;
    const url = editing
      ? `/api/clients/${encodeURIComponent(editingClientId)}`
      : "/api/clients";

    isSaving = true;
    elements.saveClientButton.disabled = true;
    elements.cancelFormButton.disabled = true;
    elements.saveClientButton.textContent = editing
      ? "Updating..."
      : "Saving...";

    clearMessage(elements.formMessage);

    try {
      const data = await apiRequest(url, {
        method: editing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      showMessage(
        elements.formMessage,
        data.message || "Client saved successfully.",
        "success"
      );

      resetForm();
      elements.clientFormPanel.classList.add("hidden");

      await loadClients();
    } catch (error) {
      showMessage(
        elements.formMessage,
        error.message || "Unable to save client.",
        "error"
      );
    } finally {
      isSaving = false;
      elements.saveClientButton.disabled = false;
      elements.cancelFormButton.disabled = false;
      elements.saveClientButton.textContent =
        editingClientId !== null ? "Update Client" : "Save Client";
    }
  }

  async function changeClientStatus(client) {
    const action = client.is_active ? "deactivate" : "reactivate";

    const confirmed = window.confirm(
      `Are you sure you want to ${action} "${client.name}"?`
    );

    if (!confirmed) return;

    try {
      const data = await apiRequest(
        `/api/clients/${encodeURIComponent(client.id)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            is_active: !client.is_active,
          }),
        }
      );

      showMessage(
        elements.listMessage,
        data.message || "Client status updated.",
        "success"
      );

      await loadClients();
    } catch (error) {
      showMessage(
        elements.listMessage,
        error.message || "Unable to update client status.",
        "error"
      );
    }
  }

  async function logout() {
    elements.logoutButton.disabled = true;

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      window.location.replace("/login.html");
    }
  }

  elements.newClientButton.addEventListener("click", openCreateForm);
  elements.cancelFormButton.addEventListener("click", closeForm);
  elements.clientForm.addEventListener("submit", saveClient);
  elements.refreshButton.addEventListener("click", loadClients);
  elements.statusFilter.addEventListener("change", loadClients);
  elements.logoutButton.addEventListener("click", logout);

  elements.searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadClients, 300);
  });

  async function initialize() {
    try {
      const isAdmin = await verifyAdminSession();

      if (!isAdmin) return;

      await loadClients();
    } catch (error) {
      showMessage(
        elements.listMessage,
        error.message || "Unable to verify your session.",
        "error"
      );
    }
  }

  initialize();
});
