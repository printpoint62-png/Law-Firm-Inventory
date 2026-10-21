"use strict";

(() => {
 const API_URL = "/api/users";

  const form = document.getElementById("create-user-form");
  const createButton = document.getElementById("create-user-button");
  const resetButton = document.getElementById("reset-form-button");
  const formMessage = document.getElementById("form-message");
  const listMessage = document.getElementById("list-message");
  const tableBody = document.getElementById("users-table-body");
  const searchInput = document.getElementById("search-users");
  const roleFilter = document.getElementById("filter-role");
  const statusFilter = document.getElementById("filter-status");

  let users = [];
  let loadingUsers = false;
  const pendingStatusIds = new Set();

  function showMessage(element, message, type = "info") {
    element.textContent = message;
    element.className = `message show ${type}`;
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
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
    });

    const contentType = response.headers.get("content-type") || "";
    let result = {};

    if (contentType.includes("application/json")) {
      result = await response.json();
    }

    if (response.status === 401) {
      window.location.assign("/login.html");
      throw new Error("Your session has expired. Please log in again.");
    }

    if (!response.ok || result.success === false) {
      throw new Error(
        result.message || `Request failed (${response.status}).`
      );
    }

    return result;
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function makeBadge(text, className) {
    const badge = document.createElement("span");
    badge.className = `badge ${className}`;
    badge.textContent = text;
    return badge;
  }

  function makeCell() {
    return document.createElement("td");
  }

  function getRoleClass(role) {
    if (role === "Admin") return "admin";
    if (role === "HR") return "hr";
    return "staff";
  }

  function renderUsers() {
    const search = searchInput.value.trim().toLowerCase();
    const selectedRole = roleFilter.value;
    const selectedStatus = statusFilter.value;

    const filteredUsers = users.filter((user) => {
      const searchable = [
        user.full_name,
        user.email,
        user.phone,
        user.role,
      ].filter(Boolean).join(" ").toLowerCase();

      const matchesSearch = !search || searchable.includes(search);
      const matchesRole = !selectedRole || user.role === selectedRole;

      const active = user.is_active === true;
      const matchesStatus =
        !selectedStatus ||
        (selectedStatus === "active" && active) ||
        (selectedStatus === "inactive" && !active);

      return matchesSearch && matchesRole && matchesStatus;
    });

    tableBody.replaceChildren();

    if (filteredUsers.length === 0) {
      const row = document.createElement("tr");
      const cell = makeCell();
      cell.colSpan = 7;
      cell.className = "empty";
      cell.textContent = users.length
        ? "No users match your search or filters."
        : "No user accounts found.";
      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }

    filteredUsers.forEach((user) => {
      const row = document.createElement("tr");

      const userCell = makeCell();
      const name = document.createElement("div");
      name.className = "user-name";
      name.textContent = user.full_name || "Unnamed user";

      const email = document.createElement("div");
      email.className = "user-email";
      email.textContent = user.email || "No email";

      userCell.append(name, email);
      row.appendChild(userCell);

      const phoneCell = makeCell();
      phoneCell.textContent = user.phone || "—";
      row.appendChild(phoneCell);

      const roleCell = makeCell();
      roleCell.appendChild(
        makeBadge(user.role || "Unknown", getRoleClass(user.role))
      );
      row.appendChild(roleCell);

      const statusCell = makeCell();
      statusCell.appendChild(
        makeBadge(
          user.is_active === true ? "Active" : "Inactive",
          user.is_active === true ? "active" : "inactive"
        )
      );
      row.appendChild(statusCell);

      const loginCell = makeCell();
      loginCell.textContent = formatDate(user.last_login_at);
      row.appendChild(loginCell);

      const createdCell = makeCell();
      createdCell.textContent = formatDate(user.created_at);
      row.appendChild(createdCell);

      const actionCell = makeCell();
      const actionWrapper = document.createElement("div");
      actionWrapper.className = "table-actions";

      if (user.role === "Admin") {
        const protectedLabel = document.createElement("span");
        protectedLabel.className = "hint";
        protectedLabel.textContent = "Protected";
        actionWrapper.appendChild(protectedLabel);
      } else {
        const button = document.createElement("button");
        const isActive = user.is_active === true;
        const isPending = pendingStatusIds.has(Number(user.id));

        button.type = "button";
        button.className = isActive ? "danger" : "success";
        button.textContent = isPending
          ? "Updating…"
          : isActive
            ? "Deactivate"
            : "Activate";
        button.disabled = isPending;
        button.setAttribute(
          "aria-label",
          `${isActive ? "Deactivate" : "Activate"} ${user.full_name || "user"}`
        );

        button.addEventListener("click", () => {
          changeUserStatus(user, !isActive);
        });

        actionWrapper.appendChild(button);
      }

      actionCell.appendChild(actionWrapper);
      row.appendChild(actionCell);

      tableBody.appendChild(row);
    });
  }

  async function loadUsers() {
    if (loadingUsers) return;

    loadingUsers = true;
    tableBody.innerHTML =
      '<tr><td colspan="7" class="empty">Loading users…</td></tr>';
    clearMessage(listMessage);

    try {
      const result = await apiRequest(API_URL);
      users = Array.isArray(result.data) ? result.data : [];
      renderUsers();
    } catch (error) {
      users = [];
      tableBody.replaceChildren();

      const row = document.createElement("tr");
      const cell = makeCell();
      cell.colSpan = 7;
      cell.className = "empty";
      cell.textContent = "Could not load users.";
      row.appendChild(cell);
      tableBody.appendChild(row);

      showMessage(listMessage, error.message, "error");
    } finally {
      loadingUsers = false;
    }
  }

  async function changeUserStatus(user, isActive) {
    const userId = Number(user.id);

    if (!Number.isSafeInteger(userId) || userId <= 0) {
      showMessage(listMessage, "Invalid user ID.", "error");
      return;
    }

    const action = isActive ? "activate" : "deactivate";
    const name = user.full_name || user.email || `User #${userId}`;

    if (!window.confirm(`Are you sure you want to ${action} ${name}?`)) {
      return;
    }

    pendingStatusIds.add(userId);
    renderUsers();
    clearMessage(listMessage);

    try {
      const result = await apiRequest(`${API_URL}/${userId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      });

      showMessage(
        listMessage,
        result.message || "User status updated successfully.",
        "success-message"
      );

      await loadUsers();
    } catch (error) {
      showMessage(listMessage, error.message, "error");
    } finally {
      pendingStatusIds.delete(userId);
      renderUsers();
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(formMessage);

    const formData = new FormData(form);

    const payload = {
      fullName: String(formData.get("fullName") || "").trim(),
      email: String(formData.get("email") || "").trim().toLowerCase(),
      phone: String(formData.get("phone") || "").trim(),
      password: String(formData.get("password") || ""),
      role: String(formData.get("role") || ""),
    };

    if (payload.fullName.length < 2) {
      showMessage(
        formMessage,
        "Full name must contain at least 2 characters.",
        "error"
      );
      return;
    }

    if (!payload.email || !payload.email.includes("@")) {
      showMessage(formMessage, "Enter a valid email address.", "error");
      return;
    }

    if (payload.password.length < 12 || payload.password.length > 128) {
      showMessage(
        formMessage,
        "Password must contain between 12 and 128 characters.",
        "error"
      );
      return;
    }

    if (!["Admin", "HR", "Staff"].includes(payload.role)) {
  showMessage(
    formMessage,
    "Select Admin, HR or Staff as the role.",
    "error"
  );
  return;
}

    createButton.disabled = true;
    resetButton.disabled = true;
    createButton.textContent = "Creating…";

    try {
      const result = await apiRequest(API_URL, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      form.reset();

      showMessage(
        formMessage,
        result.message || "User account created successfully.",
        "success-message"
      );

      await loadUsers();
    } catch (error) {
      showMessage(formMessage, error.message, "error");
    } finally {
      createButton.disabled = false;
      resetButton.disabled = false;
      createButton.textContent = "Create Account";
    }
  });

  searchInput.addEventListener("input", renderUsers);
  roleFilter.addEventListener("change", renderUsers);
  statusFilter.addEventListener("change", renderUsers);

  loadUsers();
})();