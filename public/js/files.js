
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const el = {
    logoutButton: document.getElementById("logoutButton"),
    newFileButton: document.getElementById("newFileButton"),
    fileFormPanel: document.getElementById("fileFormPanel"),
    formHeading: document.getElementById("formHeading"),
    fileForm: document.getElementById("fileForm"),
    clientId: document.getElementById("clientId"),
    clientDisplay: document.getElementById("clientDisplay"),
    fileNumber: document.getElementById("fileNumber"),
    fileTitle: document.getElementById("fileTitle"),
    openedAt: document.getElementById("openedAt"),
    closedAt: document.getElementById("closedAt"),
    fileDescription: document.getElementById("fileDescription"),
    saveFileButton: document.getElementById("saveFileButton"),
    cancelFormButton: document.getElementById("cancelFormButton"),
    formMessage: document.getElementById("formMessage"),
    searchInput: document.getElementById("searchInput"),
    statusFilter: document.getElementById("statusFilter"),
    refreshButton: document.getElementById("refreshButton"),
    filesTableBody: document.getElementById("filesTableBody"),
    fileCount: document.getElementById("fileCount"),
    listMessage: document.getElementById("listMessage"),
    lookupForm: document.getElementById("lookupForm"),
    lookupFileNumber: document.getElementById("lookupFileNumber"),
    lookupButton: document.getElementById("lookupButton"),
    lookupMessage: document.getElementById("lookupMessage"),
    lookupResult: document.getElementById("lookupResult"),
  };

  let clients = [];
  let files = [];
  let editingFileId = null;
  let searchTimer = null;
  let isSaving = false;
  let isLoading = false;

  function showMessage(element, message, type = "error") {
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
      throw new Error("You do not have permission to manage files.");
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

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
  }

  function toDateInput(value) {
    if (!value) return "";

    if (typeof value === "string") {
      const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return date.toISOString().slice(0, 10);
  }

  function createCell(value) {
    const cell = document.createElement("td");
    cell.textContent = value || "—";
    return cell;
  }

  function createButton(label, className, handler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `button ${className}`;
    button.textContent = label;
    button.addEventListener("click", handler);
    return button;
  }

  async function loadClients(selectedId = "") {
    const data = await apiRequest("/api/clients?status=active");
    clients = data.clients;

    el.clientId.replaceChildren();

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select a client";
    el.clientId.appendChild(placeholder);

    for (const client of clients) {
      const option = document.createElement("option");
      option.value = String(client.id);
      option.textContent = `${client.client_code} — ${client.name}`;
      el.clientId.appendChild(option);
    }

    if (selectedId) {
      const exists = clients.some(
        (client) => String(client.id) === String(selectedId)
      );

      if (!exists) {
        const option = document.createElement("option");
        option.value = String(selectedId);
        option.textContent = "Previously selected client (inactive)";
        el.clientId.appendChild(option);
      }

      el.clientId.value = String(selectedId);
    }

    updateClientDisplay();
  }

  function updateClientDisplay() {
    const selectedId = el.clientId.value;

    const client = clients.find(
      (item) => String(item.id) === String(selectedId)
    );

    if (client) {
      el.clientDisplay.value =
        `${client.name} (${client.client_code})`;
    } else if (selectedId) {
      const option = Array.from(el.clientId.options).find(
        (item) => item.value === selectedId
      );

      el.clientDisplay.value = option ? option.textContent : "";
    } else {
      el.clientDisplay.value = "";
    }
  }

  function resetForm() {
    el.fileForm.reset();
    editingFileId = null;
    el.formHeading.textContent = "Add New File";
    el.saveFileButton.textContent = "Save File";
    el.fileNumber.readOnly = false;
    el.clientId.disabled = false;
    clearMessage(el.formMessage);
    updateClientDisplay();
  }

  function openCreateForm() {
    resetForm();
    el.fileFormPanel.classList.remove("hidden");
    el.fileNumber.focus();

    el.fileFormPanel.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function closeForm() {
    if (isSaving) return;

    resetForm();
    el.fileFormPanel.classList.add("hidden");
  }

  function openEditForm(file) {
    resetForm();

    editingFileId = file.id;
    el.formHeading.textContent = "Edit File";
    el.saveFileButton.textContent = "Update File";

    el.clientId.value = String(file.client_id);
    el.fileNumber.value = file.file_number;
    el.fileTitle.value = file.title || "";
    el.openedAt.value = toDateInput(file.opened_at);
    el.closedAt.value = toDateInput(file.closed_at);
    el.fileDescription.value = file.description || "";

    // Keep the unique file number stable after creation.
    el.fileNumber.readOnly = true;

    updateClientDisplay();

    el.fileFormPanel.classList.remove("hidden");
    el.fileFormPanel.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function renderFiles() {
    el.filesTableBody.replaceChildren();

    if (files.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");

      cell.colSpan = 6;
      cell.className = "empty-state";
      cell.textContent =
        "No files found. Add a file or change your filters.";

      row.appendChild(cell);
      el.filesTableBody.appendChild(row);
      el.fileCount.textContent = "0 files displayed";
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const file of files) {
      const row = document.createElement("tr");

      const fileCell = document.createElement("td");
      const title = document.createElement("div");
      const number = document.createElement("div");

      title.className = "file-name";
      title.textContent = file.title;

      number.className = "file-number";
      number.textContent = file.file_number;

      fileCell.append(title, number);

      const clientCell = document.createElement("td");
      const clientName = document.createElement("div");
      const clientCode = document.createElement("div");

      clientName.className = "file-name";
      clientName.textContent = file.client_name;

      clientCode.className = "file-number";
      clientCode.textContent = file.client_code;

      clientCell.append(clientName, clientCode);

      const openedCell = createCell(formatDate(file.opened_at));

      const statusCell = document.createElement("td");
      const badge = document.createElement("span");

      badge.className = `status-badge status-${String(
        file.status
      ).toLowerCase()}`;
      badge.textContent = file.status;
      statusCell.appendChild(badge);

      const createdCell = createCell(formatDate(file.created_at));

      const actionsCell = document.createElement("td");
      const actions = document.createElement("div");
      actions.className = "row-actions";

      actions.appendChild(
        createButton("Edit", "button-secondary", () => openEditForm(file))
      );

      if (file.status !== "Closed") {
        actions.appendChild(
          createButton("Close", "button-danger", () =>
            changeFileStatus(file, "Closed")
          )
        );
      } else {
        actions.appendChild(
          createButton("Reopen", "button-primary", () =>
            changeFileStatus(file, "Active")
          )
        );
      }

      if (file.status !== "Archived") {
        actions.appendChild(
          createButton("Archive", "button-secondary", () =>
            changeFileStatus(file, "Archived")
          )
        );
      }

     actionsCell.appendChild(actions);

row.append(
  fileCell,
  clientCell,
  openedCell,
  statusCell,
  createdCell,
  actionsCell
);
      fragment.appendChild(row);
    }

    el.filesTableBody.appendChild(fragment);

    el.fileCount.textContent =
      `${files.length} file${files.length === 1 ? "" : "s"} displayed`;
  }

  async function loadFiles() {
    if (isLoading) return;

    isLoading = true;
    el.refreshButton.disabled = true;
    clearMessage(el.listMessage);

    const loadingRow = document.createElement("tr");
    const loadingCell = document.createElement("td");

    loadingCell.colSpan = 6;
    loadingCell.className = "empty-state";
    loadingCell.textContent = "Loading files...";

    loadingRow.appendChild(loadingCell);
    el.filesTableBody.replaceChildren(loadingRow);

    try {
      const params = new URLSearchParams();
      const search = el.searchInput.value.trim();

      if (search) params.set("search", search);
      params.set("status", el.statusFilter.value);

      const data = await apiRequest(`/api/files?${params.toString()}`);

      files = data.files;
      renderFiles();
    } catch (error) {
      files = [];
      renderFiles();

      showMessage(
        el.listMessage,
        error.message || "Unable to load files."
      );
    } finally {
      isLoading = false;
      el.refreshButton.disabled = false;
    }
  }

  async function saveFile(event) {
    event.preventDefault();

    if (isSaving) return;

    if (!el.fileForm.reportValidity()) return;

    const payload = {
      client_id: el.clientId.value,
      file_number: el.fileNumber.value.trim(),
      title: el.fileTitle.value.trim(),
      description: el.fileDescription.value.trim(),
      opened_at: el.openedAt.value || null,
      closed_at: el.closedAt.value || null,
    };

    if (!payload.client_id || !payload.file_number || !payload.title) {
      showMessage(
        el.formMessage,
        "Client, file number and file title are required."
      );
      return;
    }

    if (
      payload.opened_at &&
      payload.closed_at &&
      payload.closed_at < payload.opened_at
    ) {
      showMessage(
        el.formMessage,
        "Closed date cannot be earlier than the opened date."
      );
      return;
    }

    const isEditing = editingFileId !== null;
    const url = isEditing
      ? `/api/files/${encodeURIComponent(editingFileId)}`
      : "/api/files";

    isSaving = true;
    el.saveFileButton.disabled = true;
    el.cancelFormButton.disabled = true;
    el.saveFileButton.textContent = isEditing ? "Updating..." : "Saving...";

    clearMessage(el.formMessage);

    try {
      const data = await apiRequest(url, {
        method: isEditing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      showMessage(
        el.formMessage,
        data.message || "File saved successfully.",
        "success"
      );

      resetForm();
      el.fileFormPanel.classList.add("hidden");

      await loadFiles();
    } catch (error) {
      showMessage(
        el.formMessage,
        error.message || "Unable to save file."
      );
    } finally {
      isSaving = false;
      el.saveFileButton.disabled = false;
      el.cancelFormButton.disabled = false;
      el.saveFileButton.textContent =
        editingFileId !== null ? "Update File" : "Save File";
    }
  }

  async function changeFileStatus(file, status) {
    const confirmed = window.confirm(
      `Are you sure you want to change "${file.file_number}" to ${status}?`
    );

    if (!confirmed) return;

    try {
      const data = await apiRequest(
        `/api/files/${encodeURIComponent(file.id)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        }
      );

      showMessage(
        el.listMessage,
        data.message || "File status updated.",
        "success"
      );

      await loadFiles();
    } catch (error) {
      showMessage(
        el.listMessage,
        error.message || "Unable to update file status."
      );
    }
  }

  function renderLookupResult(file) {
    el.lookupResult.replaceChildren();

    const fields = [
      ["File Number", file.file_number],
      ["File Title", file.title],
      ["Client Name", file.client_name],
      ["Client Code", file.client_code],
      ["Status", file.status],
      ["Opened Date", formatDate(file.opened_at)],
      ["Closed Date", formatDate(file.closed_at)],
      ["Description", file.description || "—"],
    ];

    for (const [label, value] of fields) {
      const line = document.createElement("div");
      const strong = document.createElement("strong");

      strong.textContent = `${label}: `;
      line.append(strong, document.createTextNode(String(value)));
      el.lookupResult.appendChild(line);
    }

    el.lookupResult.classList.remove("hidden");
  }

  async function lookupFile(event) {
    event.preventDefault();

    const fileNumber = el.lookupFileNumber.value.trim();

    if (!fileNumber) {
      showMessage(el.lookupMessage, "Enter a file number.");
      return;
    }

    el.lookupButton.disabled = true;
    el.lookupButton.textContent = "Searching...";
    el.lookupResult.classList.add("hidden");
    el.lookupResult.replaceChildren();
    clearMessage(el.lookupMessage);

    try {
      const data = await apiRequest(
        `/api/files/lookup/${encodeURIComponent(fileNumber)}`
      );

      renderLookupResult(data.file);

      showMessage(
        el.lookupMessage,
        "File found successfully.",
        "success"
      );
    } catch (error) {
      showMessage(
        el.lookupMessage,
        error.message || "File lookup failed."
      );
    } finally {
      el.lookupButton.disabled = false;
      el.lookupButton.textContent = "Find File";
    }
  }

  async function logout() {
    el.logoutButton.disabled = true;

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      window.location.replace("/login.html");
    }
  }

  el.newFileButton.addEventListener("click", openCreateForm);
  el.cancelFormButton.addEventListener("click", closeForm);
  el.fileForm.addEventListener("submit", saveFile);
  el.clientId.addEventListener("change", updateClientDisplay);
  el.refreshButton.addEventListener("click", loadFiles);
  el.statusFilter.addEventListener("change", loadFiles);
  el.lookupForm.addEventListener("submit", lookupFile);
  el.logoutButton.addEventListener("click", logout);

  el.searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadFiles, 300);
  });

  async function initialize() {
    try {
      const isAdmin = await verifyAdminSession();

      if (!isAdmin) return;

      await loadClients();
      await loadFiles();
    } catch (error) {
      showMessage(
        el.listMessage,
        error.message || "Unable to initialize Files Master."
      );
    }
  }

  initialize();
});
