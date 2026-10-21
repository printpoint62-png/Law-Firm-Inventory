
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  const elements = {
    logoutButton: document.getElementById("logoutButton"),
    newProductButton: document.getElementById("newProductButton"),
    productFormPanel: document.getElementById("productFormPanel"),
    formHeading: document.getElementById("formHeading"),
    productForm: document.getElementById("productForm"),
    sku: document.getElementById("sku"),
    productName: document.getElementById("productName"),
    categoryId: document.getElementById("categoryId"),
    brandId: document.getElementById("brandId"),
    unitId: document.getElementById("unitId"),

    // New: inline master-data buttons
    addCategoryButton: document.getElementById("addCategoryButton"),
    addBrandButton: document.getElementById("addBrandButton"),
    addUnitButton: document.getElementById("addUnitButton"),

    reorderLevel: document.getElementById("reorderLevel"),
    description: document.getElementById("description"),
    saveProductButton: document.getElementById("saveProductButton"),
    cancelFormButton: document.getElementById("cancelFormButton"),
    formMessage: document.getElementById("formMessage"),
    searchInput: document.getElementById("searchInput"),
    statusFilter: document.getElementById("statusFilter"),
    refreshButton: document.getElementById("refreshButton"),
    productsTableBody: document.getElementById("productsTableBody"),
    productCount: document.getElementById("productCount"),
    listMessage: document.getElementById("listMessage"),
  };

  let products = [];
  let editingProductId = null;
  let searchTimer = null;
  let isSaving = false;
  let isLoading = false;
  let isChangingStatus = false;
  let isAddingMasterOption = false;

  function showMessage(element, message, type = "error") {
    if (!element) return;

    element.textContent = message;
    element.className = `message ${type}`;
    element.hidden = !message;
  }

  function clearMessage(element) {
    if (!element) return;

    element.textContent = "";
    element.hidden = true;
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
      throw new Error("You do not have permission to manage this data.");
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

  function setFormSavingState(saving) {
    isSaving = saving;
    elements.saveProductButton.disabled = saving;
    elements.saveProductButton.textContent = saving
      ? "Saving..."
      : editingProductId !== null
        ? "Update Product"
        : "Save Product";

    elements.cancelFormButton.disabled = saving;
  }

  function setListLoadingState(loading) {
    isLoading = loading;
    elements.refreshButton.disabled = loading;
    elements.refreshButton.textContent = loading ? "Loading..." : "Refresh List";
  }

  function closeProductForm() {
    if (isSaving || isAddingMasterOption) return;

    elements.productForm.reset();
    editingProductId = null;

    elements.formHeading.textContent = "Add New Product";
    elements.saveProductButton.textContent = "Save Product";
    elements.saveProductButton.disabled = false;

    clearMessage(elements.formMessage);

    elements.productFormPanel.classList.add("hidden");
    elements.productFormPanel.hidden = true;
  }

  function openProductForm(product = null) {
    if (isSaving || isAddingMasterOption) return;

    elements.productForm.reset();
    clearMessage(elements.formMessage);
    clearMessage(elements.listMessage);

    editingProductId = product ? String(product.id) : null;

    elements.formHeading.textContent = product ? "Edit Product" : "Add New Product";

    elements.sku.value = product?.sku ?? "";
    elements.productName.value = product?.name ?? "";
    elements.categoryId.value =
      product?.category_id == null ? "" : String(product.category_id);
    elements.brandId.value =
      product?.brand_id == null ? "" : String(product.brand_id);
    elements.unitId.value =
      product?.unit_id == null ? "" : String(product.unit_id);
    elements.reorderLevel.value = product?.reorder_level ?? "0";
    elements.description.value = product?.description ?? "";

    elements.saveProductButton.textContent = product
      ? "Update Product"
      : "Save Product";

    elements.productFormPanel.classList.remove("hidden");
    elements.productFormPanel.hidden = false;
    elements.productFormPanel.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });

    elements.sku.focus();
  }

  function addOption(select, value, label) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = label;
    select.appendChild(option);
  }

  // New: preserve existing selections while refreshing dropdowns.
  async function loadDropdownData(selectedValues = {}) {
    const previousCategory =
      selectedValues.categoryId ?? elements.categoryId.value;
    const previousBrand =
      selectedValues.brandId ?? elements.brandId.value;
    const previousUnit =
      selectedValues.unitId ?? elements.unitId.value;

    const [categoryData, brandData, unitData] = await Promise.all([
      apiRequest("/api/categories?status=active"),
      apiRequest("/api/brands?status=active"),
      apiRequest("/api/units?status=active"),
    ]);

    const categories = categoryData.categories;
    const brands = brandData.brands;
    const units = unitData.units;

    if (
      !Array.isArray(categories) ||
      !Array.isArray(brands) ||
      !Array.isArray(units)
    ) {
      throw new Error("Master data could not be loaded correctly.");
    }

    elements.categoryId.replaceChildren();
    elements.brandId.replaceChildren();
    elements.unitId.replaceChildren();

    addOption(elements.categoryId, "", "Select category (optional)");
    addOption(elements.brandId, "", "Select brand (optional)");
    addOption(elements.unitId, "", "Select unit");

    categories.forEach((category) => {
      addOption(elements.categoryId, category.id, category.name);
    });

    brands.forEach((brand) => {
      addOption(elements.brandId, brand.id, brand.name);
    });

    units.forEach((unit) => {
      addOption(
        elements.unitId,
        unit.id,
        `${unit.name} (${unit.abbreviation})`
      );
    });

    // Restore valid previous selections.
    elements.categoryId.value = Array.from(elements.categoryId.options)
      .some((option) => option.value === String(previousCategory))
      ? String(previousCategory)
      : "";

    elements.brandId.value = Array.from(elements.brandId.options)
      .some((option) => option.value === String(previousBrand))
      ? String(previousBrand)
      : "";

    elements.unitId.value = Array.from(elements.unitId.options)
      .some((option) => option.value === String(previousUnit))
      ? String(previousUnit)
      : "";
  }

  // New: create Category, Brand, or Unit directly from the product form.
  async function addMasterOption(type) {
    if (isSaving || isAddingMasterOption) return;

    const configs = {
      category: {
        label: "category",
        endpoint: "/api/categories",
        collectionKey: "categories",
        select: elements.categoryId,
        namePrompt: "Enter the new category name:",
        successMessage: "Category created successfully.",
      },
      brand: {
        label: "brand",
        endpoint: "/api/brands",
        collectionKey: "brands",
        select: elements.brandId,
        namePrompt: "Enter the new brand name:",
        successMessage: "Brand created successfully.",
      },
      unit: {
        label: "unit",
        endpoint: "/api/units",
        collectionKey: "units",
        select: elements.unitId,
        namePrompt: "Enter the new unit name:",
        successMessage: "Unit created successfully.",
      },
    };

    const config = configs[type];

    if (!config) return;

    const name = window.prompt(config.namePrompt);

    if (name === null) return;

    const trimmedName = name.trim();

    if (!trimmedName) {
      showMessage(elements.formMessage, "Name cannot be empty.");
      return;
    }

    const payload = { name: trimmedName };

    if (type === "unit") {
      const abbreviation = window.prompt("Enter the unit abbreviation:");

      if (abbreviation === null) return;

      const trimmedAbbreviation = abbreviation.trim();

      if (!trimmedAbbreviation) {
        showMessage(
          elements.formMessage,
          "Unit abbreviation cannot be empty."
        );
        return;
      }

      payload.abbreviation = trimmedAbbreviation;
    }

    const button =
      type === "category"
        ? elements.addCategoryButton
        : type === "brand"
          ? elements.addBrandButton
          : elements.addUnitButton;

    const originalButtonText = button ? button.textContent : "+";

    isAddingMasterOption = true;

    if (button) {
      button.disabled = true;
      button.textContent = "...";
    }

    elements.saveProductButton.disabled = true;
    elements.cancelFormButton.disabled = true;
    clearMessage(elements.formMessage);

    try {
      const data = await apiRequest(config.endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const createdItem = data[type];

      if (!createdItem || createdItem.id == null) {
        throw new Error(
          `The ${config.label} was created, but its ID was not returned by the server. Refresh the dropdown and verify before retrying.`
        );
      }

      // Refresh dropdowns without losing other current selections.
      const selectedValues = {
        categoryId: elements.categoryId.value,
        brandId: elements.brandId.value,
        unitId: elements.unitId.value,
      };

      if (type === "category") {
        selectedValues.categoryId = String(createdItem.id);
      } else if (type === "brand") {
        selectedValues.brandId = String(createdItem.id);
      } else {
        selectedValues.unitId = String(createdItem.id);
      }

      await loadDropdownData(selectedValues);

      showMessage(
        elements.formMessage,
        data.message || config.successMessage,
        "success"
      );
    } catch (error) {
      showMessage(
        elements.formMessage,
        error.message || `Unable to create ${config.label}.`
      );
    } finally {
      isAddingMasterOption = false;

      if (button) {
        button.disabled = false;
        button.textContent = originalButtonText;
      }

      elements.saveProductButton.disabled = false;
      elements.cancelFormButton.disabled = false;
    }
  }

  function createCell(text) {
    const cell = document.createElement("td");
    cell.textContent = text == null || text === "" ? "—" : String(text);
    return cell;
  }

  function createActionButton(label, action, productId, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.dataset.action = action;
    button.dataset.id = String(productId);
    button.className = `button ${className}`;
    return button;
  }

  function renderProducts() {
    elements.productsTableBody.replaceChildren();

    elements.productCount.textContent = `${products.length} product${
      products.length === 1 ? "" : "s"
    }`;

    if (products.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");

      cell.colSpan = 7;
      cell.textContent = "No products found.";
      cell.className = "empty-state";

      row.appendChild(cell);
      elements.productsTableBody.appendChild(row);
      return;
    }

    products.forEach((product) => {
      const row = document.createElement("tr");

      // Column 1: Product name and SKU
      const productCell = document.createElement("td");

      const productName = document.createElement("div");
      productName.className = "product-name";
      productName.textContent = product.name || "Unnamed product";

      const skuText = document.createElement("div");
      skuText.className = "product-sku";
      skuText.textContent = `SKU: ${product.sku || "—"}`;

      productCell.append(productName, skuText);

      // Column 2: Category
      const categoryCell = createCell(product.category_name);

      // Column 3: Brand
      const brandCell = createCell(product.brand_name);

      // Column 4: Unit
      const unitLabel = product.unit_name
        ? `${product.unit_name}${
            product.unit_abbreviation ? ` (${product.unit_abbreviation})` : ""
          }`
        : "—";
      const unitCell = createCell(unitLabel);

      // Column 5: Reorder level
      const reorderCell = createCell(product.reorder_level);

      // Column 6: Status
      const statusCell = document.createElement("td");
      const statusBadge = document.createElement("span");

      const isActive =
        product.is_active === true || product.is_active === "true";

      statusBadge.textContent = isActive ? "Active" : "Inactive";
      statusBadge.className = isActive
        ? "status-badge status-active"
        : "status-badge status-inactive";

      statusCell.appendChild(statusBadge);

      // Column 7: Actions
      const actionsCell = document.createElement("td");
      actionsCell.className = "row-actions";

      actionsCell.appendChild(
        createActionButton("Edit", "edit", product.id, "button-secondary")
      );

      actionsCell.appendChild(
        createActionButton(
          isActive ? "Deactivate" : "Activate",
          "toggle-status",
          product.id,
          isActive ? "button-danger" : "button-secondary"
        )
      );

      row.append(
        productCell,
        categoryCell,
        brandCell,
        unitCell,
        reorderCell,
        statusCell,
        actionsCell
      );

      elements.productsTableBody.appendChild(row);
    });
  }

  async function loadProducts() {
    if (isLoading) return;

    setListLoadingState(true);
    clearMessage(elements.listMessage);

    elements.productsTableBody.replaceChildren();

    const loadingRow = document.createElement("tr");
    const loadingCell = document.createElement("td");
    loadingCell.colSpan = 7;
    loadingCell.className = "empty-state";
    loadingCell.textContent = "Loading products...";
    loadingRow.appendChild(loadingCell);
    elements.productsTableBody.appendChild(loadingRow);

    try {
      const params = new URLSearchParams();
      const search = elements.searchInput.value.trim();
      const status = elements.statusFilter.value || "all";

      if (search) params.set("search", search);
      params.set("status", status);

      const data = await apiRequest(`/api/products?${params.toString()}`);

      if (!Array.isArray(data.products)) {
        throw new Error("The server returned an invalid products list.");
      }

      products = data.products;
      renderProducts();
    } catch (error) {
      showMessage(
        elements.listMessage,
        error.message || "Unable to load products."
      );

      elements.productsTableBody.replaceChildren();

      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 7;
      cell.className = "empty-state";
      cell.textContent = "Products could not be loaded.";
      row.appendChild(cell);
      elements.productsTableBody.appendChild(row);
    } finally {
      setListLoadingState(false);
    }
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (isSaving || isAddingMasterOption) return;

    clearMessage(elements.formMessage);

    const sku = elements.sku.value.trim();
    const name = elements.productName.value.trim();
    const categoryValue = elements.categoryId.value;
    const brandValue = elements.brandId.value;
    const unitValue = elements.unitId.value;
    const reorderLevel = elements.reorderLevel.value.trim();
    const description = elements.description.value.trim();

    if (!sku || !name || !unitValue) {
      showMessage(
        elements.formMessage,
        "SKU, product name and unit are required."
      );
      return;
    }

    const reorderNumber = Number(reorderLevel);

    if (
      reorderLevel === "" ||
      !Number.isFinite(reorderNumber) ||
      reorderNumber < 0 ||
      reorderNumber > 99999999999.999
    ) {
      showMessage(
        elements.formMessage,
        "Reorder level must be a valid non-negative number."
      );
      return;
    }

    const payload = {
      sku,
      name,
      description: description || null,
      category_id: categoryValue ? Number(categoryValue) : null,
      brand_id: brandValue ? Number(brandValue) : null,
      unit_id: Number(unitValue),
      reorder_level: reorderNumber,
    };

    setFormSavingState(true);

    try {
      const isEditing = editingProductId !== null;
      const url = isEditing
        ? `/api/products/${encodeURIComponent(editingProductId)}`
        : "/api/products";

      const data = await apiRequest(url, {
        method: isEditing ? "PUT" : "POST",
        body: JSON.stringify(payload),
      });

      const successMessage =
        data.message ||
        (isEditing
          ? "Product updated successfully."
          : "Product created successfully.");

      elements.productForm.reset();
      editingProductId = null;
      elements.productFormPanel.classList.add("hidden");
      elements.productFormPanel.hidden = true;

      showMessage(elements.listMessage, successMessage, "success");
      clearMessage(elements.formMessage);

      await loadProducts();
    } catch (error) {
      showMessage(
        elements.formMessage,
        error.message || "Unable to save the product."
      );
    } finally {
      setFormSavingState(false);
    }
  }

  async function toggleProductStatus(productId) {
    if (isChangingStatus) return;

    const product = products.find(
      (item) => String(item.id) === String(productId)
    );

    if (!product) {
      showMessage(elements.listMessage, "The selected product was not found.");
      return;
    }

    const isActive =
      product.is_active === true || product.is_active === "true";
    const action = isActive ? "deactivate" : "activate";

    if (!window.confirm(`Are you sure you want to ${action} "${product.name}"?`)) {
      return;
    }

    isChangingStatus = true;
    clearMessage(elements.listMessage);

    try {
      const data = await apiRequest(
        `/api/products/${encodeURIComponent(productId)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_active: !isActive }),
        }
      );

      showMessage(
        elements.listMessage,
        data.message || `Product ${action}d successfully.`,
        "success"
      );

      await loadProducts();
    } catch (error) {
      showMessage(
        elements.listMessage,
        error.message || `Unable to ${action} product.`
      );
    } finally {
      isChangingStatus = false;
    }
  }

  elements.newProductButton.addEventListener("click", () => {
    openProductForm();
  });

  elements.cancelFormButton.addEventListener("click", closeProductForm);
  elements.productForm.addEventListener("submit", saveProduct);

  // New: wire the three inline add buttons.
  if (elements.addCategoryButton) {
    elements.addCategoryButton.addEventListener("click", () => {
      addMasterOption("category");
    });
  }

  if (elements.addBrandButton) {
    elements.addBrandButton.addEventListener("click", () => {
      addMasterOption("brand");
    });
  }

  if (elements.addUnitButton) {
    elements.addUnitButton.addEventListener("click", () => {
      addMasterOption("unit");
    });
  }

  elements.searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadProducts, 300);
  });

  elements.statusFilter.addEventListener("change", loadProducts);
  elements.refreshButton.addEventListener("click", loadProducts);

  elements.productsTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;

    const { action, id } = button.dataset;

    if (action === "edit") {
      const product = products.find((item) => String(item.id) === String(id));
      if (product) openProductForm(product);
    } else if (action === "toggle-status") {
      toggleProductStatus(id);
    }
  });

  elements.logoutButton.addEventListener("click", async () => {
    elements.logoutButton.disabled = true;

    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch (error) {
      console.error("Logout request failed:", error);
    } finally {
      window.location.replace("/login.html");
    }
  });

  async function initialize() {
    try {
      const isAdmin = await verifyAdminSession();
      if (!isAdmin) return;

      await loadDropdownData();
      await loadProducts();
    } catch (error) {
      showMessage(
        elements.listMessage,
        error.message || "Unable to initialize the Products page."
      );
    }
  }

  initialize();
});
