
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("vendorForm");
  const formPanel = document.getElementById("vendorFormPanel");
  const addButton = document.getElementById("addVendorBtn");
  const cancelButton = document.getElementById("cancelVendorBtn");
  const refreshButton = document.getElementById("refreshVendorsBtn");
  const searchInput = document.getElementById("vendorSearch");
  const statusFilter = document.getElementById("vendorStatusFilter");
  const tableBody = document.getElementById("vendorsTableBody");
  const messageBox = document.getElementById("pageMessage");
  const submitButton = document.getElementById("saveVendorBtn");
  const vendorCount = document.getElementById("vendorCount");

  let vendors = [];
  let editingVendorId = null;
  let searchTimer = null;

  function showMessage(message, type = "error") {
    messageBox.textContent = message;
    messageBox.className = `message ${type}`;
    messageBox.style.display = "block";
  }

  function clearMessage() {
    messageBox.textContent = "";
    messageBox.className = "message";
    messageBox.style.display = "none";
  }

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result.success === false) {
      if (response.status === 401) {
        throw new Error("Session expired. Please log in again.");
      }

      if (response.status === 403) {
        throw new Error("Only an authorized Admin can manage vendors.");
      }

      throw new Error(
        result.message || `Request failed with status ${response.status}.`
      );
    }

    return result;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function openForm(vendor = null) {
    clearMessage();
    form.reset();

    editingVendorId = vendor ? vendor.id : null;

    document.getElementById("vendorId").value = vendor?.id ?? "";
    document.getElementById("vendorCode").value = vendor?.vendor_code ?? "";
    document.getElementById("vendorName").value = vendor?.name ?? "";
    document.getElementById("contactPerson").value =
      vendor?.contact_person ?? "";
    document.getElementById("vendorEmail").value = vendor?.email ?? "";
    document.getElementById("vendorPhone").value = vendor?.phone ?? "";
    document.getElementById("taxNumber").value = vendor?.tax_number ?? "";
    document.getElementById("vendorAddress").value = vendor?.address ?? "";
    document.getElementById("vendorNotes").value = vendor?.notes ?? "";

    document.getElementById("formTitle").textContent =
      vendor ? "Edit Vendor" : "Add New Vendor";

    submitButton.textContent = vendor ? "Update Vendor" : "Save Vendor";

    document.getElementById("vendorCode").disabled = false;
    formPanel.classList.remove("hidden");

    formPanel.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    document.getElementById("vendorCode").focus();
  }

  function closeForm() {
    formPanel.classList.add("hidden");
    form.reset();
    document.getElementById("vendorId").value = "";
    editingVendorId = null;
    submitButton.disabled = false;
    submitButton.textContent = "Save Vendor";
    clearMessage();
  }

  function renderVendors() {
    if (vendorCount) {
      vendorCount.textContent =
        `${vendors.length} ${vendors.length === 1 ? "vendor" : "vendors"}`;
    }

    if (!vendors.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="7">
            <div class="empty-state">No vendors found.</div>
          </td>
        </tr>`;
      return;
    }

    tableBody.innerHTML = vendors.map((vendor) => {
      const active = vendor.is_active === true;

      return `
        <tr>
          <td>
            <span class="vendor-name">${escapeHtml(vendor.name)}</span>
          </td>
          <td>${escapeHtml(vendor.vendor_code)}</td>
          <td>${escapeHtml(vendor.contact_person || "—")}</td>
          <td>
            ${escapeHtml(vendor.phone || "—")}
            ${vendor.email
              ? `<span class="secondary-text">${escapeHtml(vendor.email)}</span>`
              : ""}
          </td>
          <td>${escapeHtml(vendor.tax_number || "—")}</td>
          <td>
            <span class="status ${active ? "status-active" : "status-inactive"}">
              ${active ? "Active" : "Inactive"}
            </span>
          </td>
          <td>
            <div class="table-actions">
              <button
                type="button"
                class="btn btn-secondary btn-small"
                data-action="edit"
                data-id="${escapeHtml(vendor.id)}">
                Edit
              </button>
              <button
                type="button"
                class="btn btn-secondary btn-small"
                data-action="status"
                data-id="${escapeHtml(vendor.id)}"
                data-active="${active}">
                ${active ? "Deactivate" : "Activate"}
              </button>
            </div>
          </td>
        </tr>`;
    }).join("");
  }

  async function loadVendors() {
    tableBody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">Loading vendors...</div>
        </td>
      </tr>`;

    try {
      const params = new URLSearchParams();
      const search = searchInput.value.trim();
      const status = statusFilter.value || "all";

      if (search) params.set("search", search);
      params.set("status", status);

      const result = await apiRequest(`/api/vendors?${params.toString()}`);

      vendors = Array.isArray(result.vendors) ? result.vendors : [];
      renderVendors();
    } catch (error) {
      vendors = [];
      renderVendors();
      showMessage(error.message);
    }
  }

  async function saveVendor(event) {
    event.preventDefault();
    clearMessage();

    const vendor = {
      vendor_code: document.getElementById("vendorCode").value.trim(),
      name: document.getElementById("vendorName").value.trim(),
      contact_person: document.getElementById("contactPerson").value.trim(),
      email: document.getElementById("vendorEmail").value.trim(),
      phone: document.getElementById("vendorPhone").value.trim(),
      tax_number: document.getElementById("taxNumber").value.trim(),
      address: document.getElementById("vendorAddress").value.trim(),
      notes: document.getElementById("vendorNotes").value.trim(),
    };

    if (!vendor.vendor_code || !vendor.name) {
      showMessage("Vendor Code and Vendor Name are required.");
      return;
    }

    const wasEditing = editingVendorId !== null;
    const url = wasEditing
      ? `/api/vendors/${encodeURIComponent(editingVendorId)}`
      : "/api/vendors";

    submitButton.disabled = true;
    submitButton.textContent = wasEditing ? "Updating..." : "Saving...";

    try {
      const result = await apiRequest(url, {
        method: wasEditing ? "PUT" : "POST",
        body: JSON.stringify(vendor),
      });

      closeForm();
      await loadVendors();

      showMessage(
        result.message ||
          (wasEditing
            ? "Vendor updated successfully."
            : "Vendor created successfully."),
        "success"
      );
    } catch (error) {
      showMessage(error.message);
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = editingVendorId !== null
        ? "Update Vendor"
        : "Save Vendor";
    }
  }

  async function changeVendorStatus(id, currentlyActive) {
    const action = currentlyActive ? "deactivate" : "activate";

    if (!confirm(`Are you sure you want to ${action} this vendor?`)) {
      return;
    }

    try {
      const result = await apiRequest(
        `/api/vendors/${encodeURIComponent(id)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_active: !currentlyActive }),
        }
      );

      await loadVendors();

      showMessage(
        result.message || `Vendor ${action}d successfully.`,
        "success"
      );
    } catch (error) {
      showMessage(error.message);
    }
  }

  addButton.addEventListener("click", () => openForm());

  cancelButton.addEventListener("click", closeForm);

  refreshButton.addEventListener("click", () => {
    clearMessage();
    loadVendors();
  });

  form.addEventListener("submit", saveVendor);

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadVendors, 300);
  });

  statusFilter.addEventListener("change", loadVendors);

  tableBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const vendor = vendors.find(
      (item) => String(item.id) === button.dataset.id
    );

    if (!vendor) {
      showMessage("Vendor record not found. Refresh and try again.");
      return;
    }

    if (button.dataset.action === "edit") {
      openForm(vendor);
    }

    if (button.dataset.action === "status") {
      changeVendorStatus(
        vendor.id,
        button.dataset.active === "true"
      );
    }
  });

  loadVendors();
});
