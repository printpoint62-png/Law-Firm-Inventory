
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const $ = (id) => document.getElementById(id);

  const form = $("purchaseForm");
  const formPanel = $("purchaseFormPanel");
  const addButton = $("addPurchaseBtn");
  const cancelFormButton = $("cancelFormBtn");
  const refreshButton = $("refreshPurchasesBtn");
  const applyFiltersButton = $("applyPurchaseFiltersBtn");
  const searchInput = $("purchaseSearch");
  const statusFilter = $("purchaseStatusFilter");
  const tableBody = $("purchasesTableBody");
  const messageBox = $("pageMessage");
  const submitButton = $("savePurchaseBtn");
  const purchaseCount = $("purchaseCount");
  const itemsBody = $("purchaseItemsBody");
  const vendorSelect = $("purchaseVendor");
  const detailsPanel = $("purchaseDetailsPanel");

  let purchases = [];
  let vendors = [];
  let products = [];
  let editingPurchaseId = null;
  let searchTimer = null;
  let loadingReferences = false;
  let savingPurchase = false;

  function showMessage(message, type = "error") {
    messageBox.textContent = message;
    messageBox.className = `message ${type}`;
    messageBox.classList.remove("hidden");
  }

  function clearMessage() {
    messageBox.textContent = "";
    messageBox.className = "message hidden";
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
        throw new Error("You do not have permission to manage purchases.");
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

  function firstValue(object, ...keys) {
    for (const key of keys) {
      if (object && object[key] !== undefined && object[key] !== null) {
        return object[key];
      }
    }

    return "";
  }

  function purchaseRowsFrom(result) {
    if (Array.isArray(result.purchases)) return result.purchases;
    if (Array.isArray(result.data)) return result.data;
    if (Array.isArray(result.data?.purchases)) return result.data.purchases;
    return [];
  }

  function purchaseFrom(result) {
    if (result.purchase && typeof result.purchase === "object") {
      return result.purchase;
    }

    if (result.data?.purchase && typeof result.data.purchase === "object") {
      return result.data.purchase;
    }

    if (result.data && !Array.isArray(result.data) && typeof result.data === "object") {
      return result.data;
    }

    return result;
  }

  function itemRowsFrom(purchase) {
    const items = firstValue(purchase, "items", "purchase_items");
    return Array.isArray(items) ? items : [];
  }

  function money(value) {
    const amount = Number(value);
    const safeAmount = Number.isFinite(amount) ? amount : 0;

    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeAmount);
  }

  function numberText(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return "0";

    return number.toLocaleString("en-IN", {
      maximumFractionDigits: 3,
    });
  }

  function formatDate(value) {
    if (!value) return "—";

    const raw = String(value);

    // Preserve the date portion from a database date value to avoid
    // changing the calendar day due to timezone conversion.
    const dateOnly = raw.match(/^(\d{4}-\d{2}-\d{2})/);

    if (dateOnly) {
      const [year, month, day] = dateOnly[1].split("-");
      return `${day}/${month}/${year}`;
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleDateString("en-IN");
  }

  function localToday() {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().slice(0, 10);
  }

  function getId(object, ...keys) {
    return String(firstValue(object, ...keys) ?? "");
  }

  function getStatus(purchase) {
    return String(firstValue(purchase, "status") || "Draft");
  }

  function getPurchaseNumber(purchase) {
    return firstValue(purchase, "purchase_number", "purchaseNumber", "number") || "—";
  }

  function getVendorName(purchase) {
    return firstValue(purchase, "vendor_name", "vendorName", "name") || "—";
  }

  function getPurchaseDate(purchase) {
    return firstValue(purchase, "purchase_date", "purchaseDate", "date");
  }

  function getInvoiceNumber(purchase) {
    return firstValue(purchase, "invoice_number", "invoiceNumber") || "—";
  }

  function getTotalQuantity(purchase) {
    return firstValue(purchase, "total_quantity", "totalQuantity", "quantity_total") || 0;
  }

  function getTotalAmount(purchase) {
    return firstValue(purchase, "total_amount", "totalAmount", "grand_total") || 0;
  }

  function getItemCount(purchase) {
    const explicit = firstValue(purchase, "item_count", "itemCount");

    if (explicit !== "") return Number(explicit) || 0;

    return itemRowsFrom(purchase).length;
  }

  function statusClass(status) {
    const normalized = String(status).toLowerCase();

    if (normalized === "posted") return "status-posted";
    if (normalized === "cancelled") return "status-cancelled";

    return "status-draft";
  }

  async function loadReferences() {
    loadingReferences = true;
    vendorSelect.innerHTML = '<option value="">Loading vendors...</option>';
    $("addPurchaseBtn").disabled = true;

    try {
      const [vendorResult, productResult] = await Promise.all([
        apiRequest("/api/vendors?status=active"),
        apiRequest("/api/products?status=active"),
      ]);

      vendors = Array.isArray(vendorResult.vendors)
        ? vendorResult.vendors.filter((vendor) => vendor.is_active === true)
        : [];

      products = Array.isArray(productResult.products)
        ? productResult.products.filter((product) => product.is_active === true)
        : [];

      renderVendorOptions();
    } catch (error) {
      vendorSelect.innerHTML = '<option value="">Unable to load vendors</option>';
      showMessage(error.message);
    } finally {
      loadingReferences = false;
      $("addPurchaseBtn").disabled = false;
    }
  }

  function renderVendorOptions(selectedId = "") {
    const activeVendors = vendors.filter((vendor) => vendor.is_active === true);

    vendorSelect.innerHTML = [
      '<option value="">Select vendor</option>',
      ...activeVendors.map((vendor) => {
        const id = getId(vendor, "id");
        const code = firstValue(vendor, "vendor_code", "vendorCode");
        const name = firstValue(vendor, "name", "vendor_name", "vendorName");
        const label = code ? `${code} — ${name}` : name;

        return `<option value="${escapeHtml(id)}">${escapeHtml(label)}</option>`;
      }),
    ].join("");

    vendorSelect.value = String(selectedId || "");
  }

  function productLabel(product) {
    const sku = firstValue(product, "sku");
    const name = firstValue(product, "name", "product_name", "productName");
    const unit = firstValue(product, "unit_abbreviation", "unitAbbreviation");

    return `${sku ? `${sku} — ` : ""}${name || "Unnamed product"}${unit ? ` (${unit})` : ""}`;
  }

  function productOptions(selectedId = "") {
    return [
      '<option value="">Select product</option>',
      ...products.map((product) => {
        const id = getId(product, "id");
        return `<option value="${escapeHtml(id)}" ${String(selectedId) === id ? "selected" : ""}>${escapeHtml(productLabel(product))}</option>`;
      }),
    ].join("");
  }

  function openForm(purchase = null) {
    clearMessage();
    detailsPanel.classList.add("hidden");
    form.reset();
    itemsBody.innerHTML = "";

    editingPurchaseId = purchase ? getId(purchase, "id", "purchase_id", "purchaseId") : null;

    $("purchaseId").value = editingPurchaseId || "";
    $("formTitle").textContent = purchase
      ? `Edit Draft — ${getPurchaseNumber(purchase)}`
      : "Create Purchase Draft";

    $("purchaseDate").value = purchase
      ? String(getPurchaseDate(purchase) || "").slice(0, 10)
      : localToday();

    $("invoiceNumber").value = firstValue(
      purchase,
      "invoice_number",
      "invoiceNumber"
    ) || "";

    $("purchaseNotes").value = firstValue(purchase, "notes") || "";

    renderVendorOptions(
      firstValue(purchase, "vendor_id", "vendorId") || ""
    );

    const existingItems = purchase ? itemRowsFrom(purchase) : [];

    if (existingItems.length) {
      existingItems.forEach((item) => addItemRow(item));
    } else {
      addItemRow();
    }

    const isDraft = !purchase || getStatus(purchase).toLowerCase() === "draft";

    vendorSelect.disabled = !isDraft;
    $("invoiceNumber").disabled = !isDraft;
    $("purchaseDate").disabled = !isDraft;
    $("purchaseNotes").disabled = !isDraft;
    $("addItemBtn").classList.toggle("hidden", !isDraft);

    itemsBody.querySelectorAll("input, select, button").forEach((element) => {
      element.disabled = !isDraft;
    });

    submitButton.classList.toggle("hidden", !isDraft);
    submitButton.textContent = purchase ? "Update Draft" : "Save Draft";

    formPanel.classList.remove("hidden");

    formPanel.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    updateTotals();
  }

  function closeForm() {
    formPanel.classList.add("hidden");
    form.reset();
    itemsBody.innerHTML = "";
    editingPurchaseId = null;
    submitButton.disabled = false;
    submitButton.textContent = "Save Draft";
    clearMessage();
  }

  function addItemRow(item = null) {
    const row = document.createElement("tr");
    row.className = "purchase-item-row";

    const productId = firstValue(item, "product_id", "productId") || "";
    const quantity = firstValue(item, "quantity") ?? "";
    const unitCost = firstValue(item, "unit_cost", "unitCost") ?? "";
    const notes = firstValue(item, "notes") || "";

    row.innerHTML = `
      <td>
        <select class="product-select" data-field="productId" required>
          ${productOptions(productId)}
        </select>
      </td>
      <td>
        <input data-field="quantity" type="number" min="0.001" step="0.001"
          inputmode="decimal" value="${escapeHtml(quantity)}" required>
      </td>
      <td>
        <input data-field="unitCost" type="number" min="0" step="0.01"
          inputmode="decimal" value="${escapeHtml(unitCost)}" required>
      </td>
      <td>
        <strong class="line-total number">${money(Number(quantity || 0) * Number(unitCost || 0))}</strong>
      </td>
      <td>
        <input class="item-notes" data-field="notes" maxlength="1000"
          value="${escapeHtml(notes)}" placeholder="Optional">
      </td>
      <td>
        <button type="button" class="btn btn-danger btn-small" data-action="remove-item">
          Remove
        </button>
      </td>
    `;

    itemsBody.appendChild(row);
    updateTotals();
  }

  function readItemRows() {
    return [...itemsBody.querySelectorAll(".purchase-item-row")].map((row) => {
      const productId = row.querySelector('[data-field="productId"]').value;
      const quantity = row.querySelector('[data-field="quantity"]').value;
      const unitCost = row.querySelector('[data-field="unitCost"]').value;
      const notes = row.querySelector('[data-field="notes"]').value.trim();

      return {
        productId,
        quantity: Number(quantity),
        unitCost: Number(unitCost),
        notes,
      };
    });
  }

  function updateTotals() {
    let totalQuantity = 0;
    let totalAmount = 0;

    const rows = [...itemsBody.querySelectorAll(".purchase-item-row")];

    rows.forEach((row) => {
      const quantity = Number(row.querySelector('[data-field="quantity"]').value || 0);
      const unitCost = Number(row.querySelector('[data-field="unitCost"]').value || 0);
      const lineTotal = quantity * unitCost;

      totalQuantity += Number.isFinite(quantity) ? quantity : 0;
      totalAmount += Number.isFinite(lineTotal) ? lineTotal : 0;

      row.querySelector(".line-total").textContent = money(lineTotal);
    });

    $("totalLines").textContent = String(rows.length);
    $("totalQuantity").textContent = numberText(totalQuantity);
    $("totalAmount").textContent = money(totalAmount);
  }

  function renderPurchases() {
    if (purchaseCount) {
      purchaseCount.textContent =
        `${purchases.length} ${purchases.length === 1 ? "purchase" : "purchases"}`;
    }

    if (!purchases.length) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="9"><div class="empty-state">No purchases found.</div></td>
        </tr>`;
      return;
    }

    tableBody.innerHTML = purchases.map((purchase) => {
      const id = getId(purchase, "id", "purchase_id", "purchaseId");
      const status = getStatus(purchase);
      const isDraft = status.toLowerCase() === "draft";

      return `
        <tr>
          <td>
            <strong>${escapeHtml(getPurchaseNumber(purchase))}</strong>
          </td>
          <td>${escapeHtml(formatDate(getPurchaseDate(purchase)))}</td>
          <td>${escapeHtml(getVendorName(purchase))}</td>
          <td>${escapeHtml(getInvoiceNumber(purchase))}</td>
          <td class="number">${escapeHtml(getItemCount(purchase))}</td>
          <td class="number">${escapeHtml(numberText(getTotalQuantity(purchase)))}</td>
          <td class="number"><strong>${escapeHtml(money(getTotalAmount(purchase)))}</strong></td>
          <td>
            <span class="status ${statusClass(status)}">${escapeHtml(status)}</span>
          </td>
          <td>
            <div class="table-actions">
              <button type="button" class="btn btn-secondary btn-small"
                data-action="view" data-id="${escapeHtml(id)}">View</button>
              ${isDraft ? `
                <button type="button" class="btn btn-secondary btn-small"
                  data-action="edit" data-id="${escapeHtml(id)}">Edit</button>
                <button type="button" class="btn btn-primary btn-small"
                  data-action="post" data-id="${escapeHtml(id)}">Post</button>
                <button type="button" class="btn btn-danger btn-small"
                  data-action="cancel" data-id="${escapeHtml(id)}">Cancel</button>
              ` : ""}
            </div>
          </td>
        </tr>`;
    }).join("");
  }

  async function loadPurchases() {
    tableBody.innerHTML = `
      <tr>
        <td colspan="9"><div class="empty-state">Loading purchases...</div></td>
      </tr>`;

    try {
      const params = new URLSearchParams();
      const search = searchInput.value.trim();
      const status = statusFilter.value || "all";

      if (search) params.set("search", search);
      params.set("status", status);

      const result = await apiRequest(`/api/purchases?${params.toString()}`);
      purchases = purchaseRowsFrom(result);
      renderPurchases();
    } catch (error) {
      purchases = [];
      renderPurchases();
      showMessage(error.message);
    }
  }

  async function getPurchaseDetails(id) {
    const result = await apiRequest(
      `/api/purchases/${encodeURIComponent(id)}`
    );

    return purchaseFrom(result);
  }

  function detailBlock(label, value) {
    return `
      <div>
        <div class="detail-label">${escapeHtml(label)}</div>
        <div class="detail-value">${escapeHtml(value || "—")}</div>
      </div>`;
  }

  async function viewPurchase(id) {
    clearMessage();
    detailsPanel.classList.remove("hidden");
    $("detailsTitle").textContent = "Loading purchase...";
    $("detailsSubtitle").textContent = "";
    $("detailsSummary").innerHTML = "";
    $("detailsItemsBody").innerHTML =
      '<tr><td colspan="5"><div class="empty-state">Loading items...</div></td></tr>';
    $("detailsActions").innerHTML = "";

    detailsPanel.scrollIntoView({ behavior: "smooth", block: "start" });

    try {
      const purchase = await getPurchaseDetails(id);
      const items = itemRowsFrom(purchase);
      const status = getStatus(purchase);
      const isDraft = status.toLowerCase() === "draft";

      $("detailsTitle").textContent =
        `Purchase ${getPurchaseNumber(purchase)}`;

      $("detailsSubtitle").textContent = `Status: ${status}`;

      $("detailsSummary").innerHTML = [
        detailBlock("Vendor", getVendorName(purchase)),
        detailBlock("Purchase Date", formatDate(getPurchaseDate(purchase))),
        detailBlock("Invoice Number", getInvoiceNumber(purchase)),
        detailBlock("Total Items", getItemCount(purchase)),
        detailBlock("Total Quantity", numberText(getTotalQuantity(purchase))),
        detailBlock("Total Amount", money(getTotalAmount(purchase))),
        detailBlock("Created At", formatDate(firstValue(purchase, "created_at", "createdAt"))),
        detailBlock("Posted At", formatDate(firstValue(purchase, "posted_at", "postedAt"))),
        detailBlock("Notes", firstValue(purchase, "notes") || "—"),
      ].join("");

      if (!items.length) {
        $("detailsItemsBody").innerHTML =
          '<tr><td colspan="5"><div class="empty-state">No purchase items found.</div></td></tr>';
      } else {
        $("detailsItemsBody").innerHTML = items.map((item) => {
          const productName = firstValue(item, "product_name", "productName", "name");
          const sku = firstValue(item, "sku", "product_sku", "productSku");
          const quantity = firstValue(item, "quantity") || 0;
          const unitCost = firstValue(item, "unit_cost", "unitCost") || 0;
          const lineTotal = firstValue(item, "line_total", "lineTotal", "total");
          const calculatedTotal = Number(quantity) * Number(unitCost);

          return `
            <tr>
              <td>
                <strong>${escapeHtml(productName || `Product ${firstValue(item, "product_id", "productId")}`)}</strong>
                ${sku ? `<span class="secondary-text">${escapeHtml(sku)}</span>` : ""}
              </td>
              <td class="number">${escapeHtml(numberText(quantity))}</td>
              <td class="number">${escapeHtml(money(unitCost))}</td>
              <td class="number">${escapeHtml(money(lineTotal === "" ? calculatedTotal : lineTotal))}</td>
              <td>${escapeHtml(firstValue(item, "notes") || "—")}</td>
            </tr>`;
        }).join("");
      }

      if (isDraft) {
        $("detailsActions").innerHTML = `
          <button type="button" class="btn btn-secondary"
            data-detail-action="edit" data-id="${escapeHtml(id)}">Edit Draft</button>
          <button type="button" class="btn btn-primary"
            data-detail-action="post" data-id="${escapeHtml(id)}">Post Purchase</button>
          <button type="button" class="btn btn-danger"
            data-detail-action="cancel" data-id="${escapeHtml(id)}">Cancel Draft</button>`;
      } else {
        $("detailsActions").innerHTML = `
          <span class="muted">This purchase is ${escapeHtml(status.toLowerCase())} and cannot be edited.</span>`;
      }
    } catch (error) {
      $("detailsTitle").textContent = "Unable to load purchase";
      $("detailsItemsBody").innerHTML =
        '<tr><td colspan="5"><div class="empty-state">Purchase details could not be loaded.</div></td></tr>';
      showMessage(error.message);
    }
  }

  function validatePurchasePayload(payload) {
    if (!payload.vendorId) {
      return "Please select a vendor.";
    }

    if (!payload.purchaseDate) {
      return "Please select the purchase date.";
    }

    if (!payload.items.length) {
      return "Add at least one purchase item.";
    }

    const seenProducts = new Set();

    for (let index = 0; index < payload.items.length; index += 1) {
      const item = payload.items[index];
      const rowNumber = index + 1;

      if (!item.productId) {
        return `Select a product in item row ${rowNumber}.`;
      }

      if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
        return `Quantity in item row ${rowNumber} must be greater than zero.`;
      }

      if (!Number.isFinite(item.unitCost) || item.unitCost < 0) {
        return `Unit cost in item row ${rowNumber} must be zero or greater.`;
      }

      if (seenProducts.has(String(item.productId))) {
        return `Product is repeated in item row ${rowNumber}. Please combine repeated products into one row.`;
      }

      seenProducts.add(String(item.productId));
    }

    return null;
  }

  async function savePurchase(event) {
    event.preventDefault();

    if (savingPurchase) return;

    clearMessage();

    const payload = {
      vendorId: vendorSelect.value,
      invoiceNumber: $("invoiceNumber").value.trim(),
      purchaseDate: $("purchaseDate").value,
      notes: $("purchaseNotes").value.trim(),
      items: readItemRows(),
    };

    const validationError = validatePurchasePayload(payload);

    if (validationError) {
      showMessage(validationError);
      return;
    }

    const wasEditing = editingPurchaseId !== null;
    const url = wasEditing
      ? `/api/purchases/${encodeURIComponent(editingPurchaseId)}`
      : "/api/purchases";

    savingPurchase = true;
    submitButton.disabled = true;
    submitButton.textContent = wasEditing ? "Updating Draft..." : "Saving Draft...";

    try {
      const result = await apiRequest(url, {
        method: wasEditing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      closeForm();
      detailsPanel.classList.add("hidden");
      await loadPurchases();

      showMessage(
        result.message ||
          (wasEditing
            ? "Purchase draft updated successfully."
            : "Purchase draft created successfully."),
        "success"
      );
    } catch (error) {
      showMessage(error.message);
    } finally {
      savingPurchase = false;
      submitButton.disabled = false;
      submitButton.textContent =
        editingPurchaseId !== null ? "Update Draft" : "Save Draft";
    }
  }

  async function postPurchase(id) {
    const purchase = purchases.find(
      (item) => getId(item, "id", "purchase_id", "purchaseId") === String(id)
    );

    const purchaseNumber = purchase ? getPurchaseNumber(purchase) : `ID ${id}`;

    if (!confirm(
      `Post purchase ${purchaseNumber}?\n\nThis will record the Stock In ledger entries. Posting cannot be undone through this screen.`
    )) {
      return;
    }

    clearMessage();

    try {
      const result = await apiRequest(
        `/api/purchases/${encodeURIComponent(id)}/post`,
        { method: "POST" }
      );

      detailsPanel.classList.add("hidden");
      await loadPurchases();

      showMessage(
        result.message || "Purchase posted successfully. Stock In was recorded.",
        "success"
      );
    } catch (error) {
      showMessage(error.message);
    }
  }

  async function cancelPurchase(id) {
    const purchase = purchases.find(
      (item) => getId(item, "id", "purchase_id", "purchaseId") === String(id)
    );

    const purchaseNumber = purchase ? getPurchaseNumber(purchase) : `ID ${id}`;

    if (!confirm(
      `Cancel draft purchase ${purchaseNumber}?\n\nOnly draft purchases can be cancelled.`
    )) {
      return;
    }

    clearMessage();

    try {
      const result = await apiRequest(
        `/api/purchases/${encodeURIComponent(id)}/cancel`,
        { method: "POST" }
      );

      detailsPanel.classList.add("hidden");
      await loadPurchases();

      showMessage(
        result.message || "Purchase draft cancelled successfully.",
        "success"
      );
    } catch (error) {
      showMessage(error.message);
    }
  }

  async function openPurchaseForEdit(id) {
    clearMessage();

    try {
      const purchase = await getPurchaseDetails(id);

      if (getStatus(purchase).toLowerCase() !== "draft") {
        showMessage("Only draft purchases can be edited.");
        return;
      }

      openForm(purchase);
    } catch (error) {
      showMessage(error.message);
    }
  }

  addButton.addEventListener("click", async () => {
    clearMessage();

    if (loadingReferences) {
      showMessage("Vendor and product lists are still loading.", "info");
      return;
    }

    if (!vendors.length) {
      showMessage("No active vendors are available. Add or activate a vendor first.");
      return;
    }

    if (!products.length) {
      showMessage("No active products are available. Add or activate a product first.");
      return;
    }

    openForm();
  });

  cancelFormButton.addEventListener("click", closeForm);

  $("closeDetailsBtn").addEventListener("click", () => {
    detailsPanel.classList.add("hidden");
  });

  $("addItemBtn").addEventListener("click", () => {
    if (editingPurchaseId !== null) {
      const purchase = purchases.find(
        (item) => getId(item, "id", "purchase_id", "purchaseId") === String(editingPurchaseId)
      );

      if (purchase && getStatus(purchase).toLowerCase() !== "draft") return;
    }

    addItemRow();
  });

  itemsBody.addEventListener("input", (event) => {
    if (
      event.target.matches('[data-field="quantity"]') ||
      event.target.matches('[data-field="unitCost"]')
    ) {
      updateTotals();
    }
  });

  itemsBody.addEventListener("click", (event) => {
    const button = event.target.closest('button[data-action="remove-item"]');
    if (!button) return;

    const row = button.closest(".purchase-item-row");
    if (row) row.remove();

    if (!itemsBody.querySelector(".purchase-item-row")) {
      addItemRow();
    }

    updateTotals();
  });

  form.addEventListener("submit", savePurchase);

  refreshButton.addEventListener("click", () => {
    clearMessage();
    loadPurchases();
  });

  applyFiltersButton.addEventListener("click", () => {
    clearMessage();
    loadPurchases();
  });

  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadPurchases, 300);
  });

  statusFilter.addEventListener("change", loadPurchases);

  tableBody.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;
    if (!id) return;

    if (action === "view") await viewPurchase(id);
    if (action === "edit") await openPurchaseForEdit(id);
    if (action === "post") await postPurchase(id);
    if (action === "cancel") await cancelPurchase(id);
  });

  $("detailsActions").addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-detail-action]");
    if (!button) return;

    const { detailAction, id } = button.dataset;

    if (detailAction === "edit") await openPurchaseForEdit(id);
    if (detailAction === "post") await postPurchase(id);
    if (detailAction === "cancel") await cancelPurchase(id);
  });

  async function initialise() {
    await loadReferences();
    await loadPurchases();
  }

  initialise();
});
