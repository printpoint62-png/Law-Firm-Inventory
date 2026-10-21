
"use strict";

const $ = (id) => document.getElementById(id);

const state = {
  stock: [],
  history: [],
  clients: [],
  files: [],
  staff: [],
  nextProductRowId: 1,
};

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Server returned an unreadable response.");
  }

  if (!response.ok || result.success === false) {
    throw new Error(result.message || `Request failed (${response.status}).`);
  }

  return result;
}

function showMessage(elementId, message, type = "error") {
  const element = $(elementId);
  element.textContent = message;
  element.className = `message show ${type}`;
}

function clearMessage(elementId) {
  const element = $(elementId);
  element.textContent = "";
  element.className = "message";
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

function money(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function dateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("en-IN");
}

function setOptions(element, rows, valueKey, labelFunction, placeholder) {
  element.replaceChildren();

  const first = document.createElement("option");
  first.value = "";
  first.textContent = placeholder;
  element.appendChild(first);

  rows.forEach((row) => {
    const option = document.createElement("option");
    option.value = row[valueKey];
    option.textContent = labelFunction(row);
    element.appendChild(option);
  });
}

function getProductRows() {
  return [...$("productRows").querySelectorAll(".product-row")];
}

function getProductOptions(selectedId = "") {
  return state.stock.filter((item) => {
    return Number(item.current_stock) > 0 ||
      String(item.product_id) === String(selectedId);
  });
}

function refreshProductSelects() {
  getProductRows().forEach((row) => {
    const select = row.querySelector(".product-select");
    const selectedId = select.value;

    setOptions(
      select,
      getProductOptions(selectedId),
      "product_id",
      (item) =>
        `${item.product_name} (${item.sku}) — Available: ${item.current_stock}`,
      "Select product"
    );

    if (selectedId) select.value = selectedId;
    updateProductRow(row);
  });

  updateDuplicateProductWarnings();
}

function updateProductRow(row) {
  const select = row.querySelector(".product-select");
  const quantityInput = row.querySelector(".quantity-input");
  const hint = row.querySelector(".stock-hint");

  const selected = state.stock.find(
    (item) => String(item.product_id) === select.value
  );

  if (!selected) {
    hint.textContent = "";
    quantityInput.removeAttribute("max");
    return;
  }

  hint.textContent =
    `Available: ${selected.current_stock} | Average cost: ${money(selected.average_unit_cost)}`;

  quantityInput.max = String(Number(selected.current_stock));
}

function updateDuplicateProductWarnings() {
  const selectedIds = getProductRows()
    .map((row) => row.querySelector(".product-select").value)
    .filter(Boolean);

  getProductRows().forEach((row) => {
    const select = row.querySelector(".product-select");
    const selectedId = select.value;
    const duplicate = selectedId &&
      selectedIds.filter((id) => id === selectedId).length > 1;

    row.querySelector(".duplicate-hint").textContent = duplicate
      ? "This product is already selected. Use one row per product."
      : "";
  });
}

function addProductRow(productId = "", quantity = "") {
  const container = $("productRows");
  const rowId = state.nextProductRowId++;

  const row = document.createElement("div");
  row.className = "product-row";
  row.dataset.rowId = String(rowId);

  row.innerHTML = `
    <div class="product-row-top">
      <span class="product-row-title">Product ${rowId}</span>
      <button type="button" class="button danger-button remove-product">
        Remove
      </button>
    </div>

    <div class="product-row-fields">
      <div class="field">
        <label>Product *</label>
        <select class="product-select" required>
          <option value="">Loading products...</option>
        </select>
        <small class="muted stock-hint"></small>
        <small class="duplicate-hint" style="color:#b42318"></small>
      </div>

      <div class="field">
        <label>Quantity *</label>
        
<input class="quantity-input" type="number"
  min="0.001" step="0.001"
  onwheel="this.blur()"
  onkeydown="if (event.key === 'ArrowUp' || event.key === 'ArrowDown') event.preventDefault();"
  required placeholder="Qty">

      </div>
    </div>
  `;

  container.appendChild(row);

  const select = row.querySelector(".product-select");
  const quantityInput = row.querySelector(".quantity-input");

  setOptions(
    select,
    getProductOptions(productId),
    "product_id",
    (item) =>
      `${item.product_name} (${item.sku}) — Available: ${item.current_stock}`,
    state.stock.length ? "Select product" : "Loading products..."
  );

  if (productId) select.value = String(productId);
  quantityInput.value = quantity;

  select.addEventListener("change", () => {
    updateProductRow(row);
    updateDuplicateProductWarnings();
    clearMessage("formMessage");
  });

  quantityInput.addEventListener("input", () => {
    clearMessage("formMessage");
  });

  row.querySelector(".remove-product").addEventListener("click", () => {
    if (getProductRows().length <= 1) {
      showMessage("formMessage", "At least one product is required.");
      return;
    }

    row.remove();
    updateProductRowTitles();
    updateDuplicateProductWarnings();
    clearMessage("formMessage");
  });

  updateProductRow(row);
  updateProductRowTitles();
  updateDuplicateProductWarnings();

  return row;
}

function updateProductRowTitles() {
  getProductRows().forEach((row, index) => {
    row.querySelector(".product-row-title").textContent =
      `Product ${index + 1}`;
  });
}

function renderStock() {
  const search = $("stockSearch").value.trim().toLowerCase();

  const rows = state.stock.filter((item) =>
    `${item.sku || ""} ${item.product_name || ""}`
      .toLowerCase()
      .includes(search)
  );

  $("stockBody").innerHTML = rows.length
    ? rows.map((item) => `
        <tr>
          <td>${escapeHtml(item.sku)}</td>
          <td>${escapeHtml(item.product_name)}</td>
          <td>${Number(item.current_stock || 0).toLocaleString("en-IN")}</td>
          <td>${money(item.average_unit_cost)}</td>
          <td>${money(item.stock_value)}</td>
        </tr>
      `).join("")
    : '<tr><td colspan="5" class="empty">No matching stock found.</td></tr>';

  refreshProductSelects();
}

function renderHistory() {
  const search = $("historySearch").value.trim().toLowerCase();

  const rows = state.history.filter((item) => {
    const text = [
      item.transaction_number,
      item.product_name,
      item.sku,
      item.recipient_name,
      item.client_name,
      item.file_number,
      item.file_title,
      item.reference_number,
      item.notes,
    ].join(" ").toLowerCase();

    return text.includes(search);
  });

  $("historyBody").innerHTML = rows.length
    ? rows.map((item) => `
        <tr>
          <td>${escapeHtml(dateTime(item.occurred_at))}</td>
          <td>${escapeHtml(item.transaction_number)}</td>
          <td>
            ${escapeHtml(item.product_name)}
            <br>
            <span class="muted">${escapeHtml(item.sku)}</span>
          </td>
          <td>${Number(item.quantity || 0).toLocaleString("en-IN")}</td>
          <td>${escapeHtml(item.recipient_name || "—")}</td>
          <td>
            ${escapeHtml(item.client_name || "—")}
            <br>
            <span class="muted">
              ${escapeHtml(item.file_number || item.file_title || "—")}
            </span>
          </td>
          <td>${money(item.total_cost)}</td>
        </tr>
      `).join("")
    : '<tr><td colspan="7" class="empty">No consumption records found.</td></tr>';
}

async function loadStock() {
  const result = await api("/api/consumption/stock");
  state.stock = Array.isArray(result.data) ? result.data : [];
  renderStock();
}

async function loadHistory() {
  const result = await api("/api/consumption");
  state.history = Array.isArray(result.data) ? result.data : [];
  renderHistory();
}

async function loadClients() {
  const result = await api("/api/clients");

  // Support the response shapes used by the existing Clients API.
  const rows = Array.isArray(result.data)
    ? result.data
    : Array.isArray(result.clients)
      ? result.clients
      : Array.isArray(result.rows)
        ? result.rows
        : [];

  state.clients = rows.filter((client) =>
    client.is_active === true ||
    client.is_active === "true" ||
    client.is_active === 1
  );

  setOptions(
    $("clientId"),
    state.clients,
    "id",
    (client) =>
      `${client.client_code ? `${client.client_code} — ` : ""}${client.name}`,
    state.clients.length ? "Select client" : "No active clients found"
  );
}

async function loadFiles(clientId) {
  $("fileId").disabled = true;
  state.files = [];

  if (!clientId) {
    setOptions(
      $("fileId"),
      [],
      "id",
      () => "",
      "Select a client first"
    );
    return;
  }

  try {
    const result = await api(
      `/api/files?client_id=${encodeURIComponent(clientId)}&status=Active`
    );

    // The Files controller returns { success: true, files: [...] }.
    const rows = Array.isArray(result.files)
      ? result.files
      : Array.isArray(result.data)
        ? result.data
        : [];

    state.files = rows.filter(
      (file) =>
        String(file.client_id) === String(clientId) &&
        String(file.status).toLowerCase() === "active" &&
        file.client_is_active !== false &&
        file.client_is_active !== "false"
    );

    setOptions(
      $("fileId"),
      state.files,
      "id",
      (file) => `${file.file_number} — ${file.title}`,
      state.files.length
        ? "Select file / matter"
        : "No active files for this client"
    );

    $("fileId").disabled = state.files.length === 0;
  } catch (error) {
    setOptions(
      $("fileId"),
      [],
      "id",
      () => "",
      "Could not load files"
    );

    showMessage("formMessage", `Could not load files: ${error.message}`);
  }
}

async function loadStaff() {
  const result = await api("/api/users/active-staff");

  const rows = Array.isArray(result.data)
    ? result.data
    : Array.isArray(result.users)
      ? result.users
      : [];

  state.staff = rows;

  setOptions(
    $("issuedTo"),
    state.staff,
    "id",
    (user) => `${user.full_name} (${user.email})`,
    state.staff.length ? "Select Staff recipient" : "No active Staff found"
  );
}

async function refreshData() {
  clearMessage("pageMessage");

  const results = await Promise.allSettled([
    loadStock(),
    loadHistory(),
  ]);

  const failed = results.find((item) => item.status === "rejected");

  if (failed) {
    showMessage("pageMessage", failed.reason.message);
  }
}

async function handleIssue(event) {
  event.preventDefault();
  clearMessage("formMessage");

  const issuedTo = $("issuedTo").value;
  const clientId = $("clientId").value;
  const fileId = $("fileId").value;

  if (!issuedTo || !clientId || !fileId) {
    showMessage(
      "formMessage",
      "Please select Staff, client and file/matter."
    );
    return;
  }

  const productRows = getProductRows();

  if (!productRows.length) {
    showMessage("formMessage", "Add at least one product.");
    return;
  }

  const items = [];
  const selectedProductIds = new Set();

  for (let index = 0; index < productRows.length; index += 1) {
    const row = productRows[index];
    const productId = row.querySelector(".product-select").value;
    const quantityText = row.querySelector(".quantity-input").value.trim();
    const quantity = Number(quantityText);

    if (!productId || !quantityText || !Number.isFinite(quantity) || quantity <= 0) {
      showMessage(
        "formMessage",
        `Select a product and enter a valid quantity for Product ${index + 1}.`
      );
      return;
    }

    if (selectedProductIds.has(productId)) {
      showMessage(
        "formMessage",
        "A product is selected more than once. Keep only one row per product."
      );
      return;
    }

    selectedProductIds.add(productId);

    const product = state.stock.find(
      (item) => String(item.product_id) === productId
    );

    if (!product) {
      showMessage(
        "formMessage",
        `Product ${index + 1} is no longer available. Refresh stock and try again.`
      );
      return;
    }

    if (quantity > Number(product.current_stock)) {
      showMessage(
        "formMessage",
        `Insufficient stock for ${product.product_name}. Available: ${product.current_stock}.`
      );
      return;
    }

    items.push({
      product_id: Number(productId),
      quantity,
    });
  }

  const button = $("issueButton");
  button.disabled = true;
  button.textContent = "Processing...";

  try {
    const result = await api("/api/consumption", {
      method: "POST",
      body: JSON.stringify({
        items,
        issued_to: Number(issuedTo),
        client_id: Number(clientId),
        file_id: Number(fileId),
        reference_number: $("referenceNumber").value.trim(),
        notes: $("notes").value.trim(),
      }),
    });

    showMessage(
      "formMessage",
      result.message || `Successfully issued ${items.length} product(s).`,
      "success"
    );

    $("issueForm").reset();
    $("productRows").replaceChildren();
    addProductRow();

    await loadFiles("");
    await refreshData();
  } catch (error) {
    showMessage("formMessage", error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Issue Stock";
  }
}

async function initialize() {
  addProductRow();

  try {
    const me = await api("/api/auth/me");
    const role = me.user?.role;

    if (!["Admin", "HR"].includes(role)) {
      $("issuePanel").hidden = true;

      showMessage(
        "pageMessage",
        "You can view stock and your consumption history. Stock issuing is available to Admin and HR."
      );
    } else {
      const results = await Promise.allSettled([
        loadClients(),
        loadStaff(),
      ]);

      const failed = results.find((item) => item.status === "rejected");

      if (failed) {
        showMessage("formMessage", failed.reason.message);
      }
    }

    await refreshData();
  } catch (error) {
    showMessage(
      "pageMessage",
      `${error.message} Please log in and reopen this page.`
    );
  }
}

$("addProductButton").addEventListener("click", () => {
  addProductRow();
});

$("clientId").addEventListener("change", async (event) => {
  clearMessage("formMessage");
  await loadFiles(event.target.value);
});

$("stockSearch").addEventListener("input", renderStock);
$("historySearch").addEventListener("input", renderHistory);

$("refreshStock").addEventListener("click", async () => {
  try {
    await loadStock();
  } catch (error) {
    showMessage("pageMessage", error.message);
  }
});

$("refreshHistory").addEventListener("click", async () => {
  try {
    await loadHistory();
  } catch (error) {
    showMessage("pageMessage", error.message);
  }
});

$("issueForm").addEventListener("submit", handleIssue);

initialize();



document.addEventListener("wheel", function (event) {
  if (event.target.matches(".quantity-input")) {
    event.preventDefault();
    event.target.blur();
  }
}, { passive: false });
