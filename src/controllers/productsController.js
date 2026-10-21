
"use strict";

const pool = require("../config/db");
const { logAudit } = require("../utils/auditLogger");

function asyncHandler(fn) {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

function validId(id) {
  return /^[1-9]\d*$/.test(String(id || ""));
}

function parseOptionalId(value) {
  if (value === undefined || value === null || value === "") {
    return { valid: true, value: null };
  }

  const id = String(value);

  if (!validId(id)) {
    return { valid: false, value: null };
  }

  return { valid: true, value: id };
}

function parseReorderLevel(value) {
  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return { valid: true, value: 0 };
  }

  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number < 0 ||
    !/^\d{1,11}(\.\d{1,3})?$/.test(String(value).trim())
  ) {
    return { valid: false, value: null };
  }

  return { valid: true, value: number };
}

function handleDuplicate(error, res) {
  if (error.code === "23505") {
    return res.status(409).json({
      success: false,
      message: "This SKU already exists.",
    });
  }

  throw error;
}

const productSelect = `
  SELECT
    p.id,
    p.sku,
    p.name,
    p.description,
    p.category_id,
    c.name AS category_name,
    p.brand_id,
    b.name AS brand_name,
    p.unit_id,
    u.name AS unit_name,
    u.abbreviation AS unit_abbreviation,
    p.reorder_level,
    p.is_active,
    p.created_by,
    p.created_at,
    p.updated_at
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  LEFT JOIN brands b ON b.id = p.brand_id
  INNER JOIN units u ON u.id = p.unit_id
`;

// GET /api/products?search=&status=all|active|inactive
const getProducts = asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "all").toLowerCase();

  if (!["all", "active", "inactive"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid product status filter.",
    });
  }

  if (search.length > 200) {
    return res.status(400).json({
      success: false,
      message: "Search text is too long.",
    });
  }

  const values = [];
  const conditions = [];

  if (status === "active") {
    conditions.push("p.is_active = TRUE");
  }

  if (status === "inactive") {
    conditions.push("p.is_active = FALSE");
  }

  if (search) {
    values.push(`%${search}%`);
    const position = values.length;

    conditions.push(`
      (
        p.sku ILIKE $${position}
        OR p.name ILIKE $${position}
        OR COALESCE(p.description, '') ILIKE $${position}
        OR COALESCE(c.name, '') ILIKE $${position}
        OR COALESCE(b.name, '') ILIKE $${position}
      )
    `);
  }

  const where = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const result = await pool.query(
    `${productSelect}
     ${where}
     ORDER BY p.name ASC
     LIMIT 200`,
    values
  );

  return res.json({
    success: true,
    products: result.rows,
  });
});

// GET /api/products/:id
const getProductById = asyncHandler(async (req, res) => {
  const id = String(req.params.id || "");

  if (!validId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid product ID.",
    });
  }

  const result = await pool.query(
    `${productSelect}
     WHERE p.id = $1`,
    [id]
  );

  if (!result.rowCount) {
    return res.status(404).json({
      success: false,
      message: "Product not found.",
    });
  }

  return res.json({
    success: true,
    product: result.rows[0],
  });
});

async function validateReferences(categoryId, brandId, unitId) {
  const unitResult = await pool.query(
    `SELECT id FROM units
     WHERE id = $1 AND is_active = TRUE`,
    [unitId]
  );

  if (!unitResult.rowCount) {
    return "Selected unit does not exist or is inactive.";
  }

  if (categoryId !== null) {
    const categoryResult = await pool.query(
      `SELECT id FROM categories
       WHERE id = $1 AND is_active = TRUE`,
      [categoryId]
    );

    if (!categoryResult.rowCount) {
      return "Selected category does not exist or is inactive.";
    }
  }

  if (brandId !== null) {
    const brandResult = await pool.query(
      `SELECT id FROM brands
       WHERE id = $1 AND is_active = TRUE`,
      [brandId]
    );

    if (!brandResult.rowCount) {
      return "Selected brand does not exist or is inactive.";
    }
  }

  return null;
}

function readProductInput(body, isUpdate = false) {
  const sku = typeof body.sku === "string"
    ? body.sku.trim()
    : "";

  const name = typeof body.name === "string"
    ? body.name.trim()
    : "";

  const description = typeof body.description === "string"
    ? body.description.trim()
    : "";

  const category = parseOptionalId(body.category_id);
  const brand = parseOptionalId(body.brand_id);

  const unitId = String(body.unit_id ?? "");
  const reorderLevel = parseReorderLevel(body.reorder_level);

  if (!sku || sku.length > 80) {
    return {
      error: "SKU is required and must be at most 80 characters.",
    };
  }

  if (!name || name.length > 200) {
    return {
      error: "Product name is required and must be at most 200 characters.",
    };
  }

  if (description.length > 10000) {
    return {
      error: "Description must be at most 10000 characters.",
    };
  }

  if (!category.valid) {
    return { error: "Invalid category ID." };
  }

  if (!brand.valid) {
    return { error: "Invalid brand ID." };
  }

  if (!validId(unitId)) {
    return { error: "A valid unit ID is required." };
  }

  if (!reorderLevel.valid) {
    return {
      error: "Reorder level must be a non-negative number with up to 3 decimal places.",
    };
  }

  if (
    isUpdate &&
    body.is_active !== undefined &&
    typeof body.is_active !== "boolean"
  ) {
    return { error: "is_active must be true or false." };
  }

  return {
    data: {
      sku,
      name,
      description,
      categoryId: category.value,
      brandId: brand.value,
      unitId,
      reorderLevel: reorderLevel.value,
      isActive: body.is_active,
    },
  };
}

// POST /api/products
const createProduct = asyncHandler(async (req, res) => {
  const parsed = readProductInput(req.body);

  if (parsed.error) {
    return res.status(400).json({
      success: false,
      message: parsed.error,
    });
  }

  const product = parsed.data;

  const referenceError = await validateReferences(
    product.categoryId,
    product.brandId,
    product.unitId
  );

  if (referenceError) {
    return res.status(400).json({
      success: false,
      message: referenceError,
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO products (
         sku,
         name,
         description,
         category_id,
         brand_id,
         unit_id,
         reorder_level,
         created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        product.sku,
        product.name,
        product.description || null,
        product.categoryId,
        product.brandId,
        product.unitId,
        product.reorderLevel,
        req.session.user.id,
      ]
    );

    const created = await pool.query(
      `${productSelect} WHERE p.id = $1`,
      [result.rows[0].id]
    );

    await logAudit({
  userId: req.session.user.id,
  action: "CREATE",
  entityType: "product",
  entityId: result.rows[0].id,
  newValues: created.rows[0],
  ipAddress: req.ip,
});

    return res.status(201).json({
      success: true,
      message: "Product created successfully.",
      product: created.rows[0],
    });
  } catch (error) {
    return handleDuplicate(error, res);
  }
});

// PUT /api/products/:id
const updateProduct = asyncHandler(async (req, res) => {
  const id = String(req.params.id || "");

  if (!validId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid product ID.",
    });
  }

  const parsed = readProductInput(req.body, true);

  if (parsed.error) {
    return res.status(400).json({
      success: false,
      message: parsed.error,
    });
  }

  const product = parsed.data;

  const existing = await pool.query(
  `SELECT * FROM products WHERE id = $1`,
  [id]
);

  if (!existing.rowCount) {
    return res.status(404).json({
      success: false,
      message: "Product not found.",
    });
  }

  const referenceError = await validateReferences(
    product.categoryId,
    product.brandId,
    product.unitId
  );

  if (referenceError) {
    return res.status(400).json({
      success: false,
      message: referenceError,
    });
  }

  const isActive = product.isActive === undefined
    ? existing.rows[0].is_active
    : product.isActive;

  try {
    await pool.query(
      `UPDATE products
       SET sku = $1,
           name = $2,
           description = $3,
           category_id = $4,
           brand_id = $5,
           unit_id = $6,
           reorder_level = $7,
           is_active = $8,
           updated_at = NOW()
       WHERE id = $9`,
      [
        product.sku,
        product.name,
        product.description || null,
        product.categoryId,
        product.brandId,
        product.unitId,
        product.reorderLevel,
        isActive,
        id,
      ]
    );

    const updated = await pool.query(
      `${productSelect} WHERE p.id = $1`,
      [id]
    );

    await logAudit({
  userId: req.session.user.id,
  action: "UPDATE",
  entityType: "product",
  entityId: id,
  oldValues: existing.rows[0],
  newValues: updated.rows[0],
  ipAddress: req.ip,
});

    return res.json({
      success: true,
      message: "Product updated successfully.",
      product: updated.rows[0],
    });
  } catch (error) {
    return handleDuplicate(error, res);
  }
});

// PATCH /api/products/:id/status
const updateProductStatus = asyncHandler(async (req, res) => {
  const id = String(req.params.id || "");
  const isActive = req.body.is_active;

  if (!validId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid product ID.",
    });
  }

  if (typeof isActive !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "is_active must be true or false.",
    });
  }

 const existing = await pool.query(
  `SELECT id, sku, name, is_active
   FROM products
   WHERE id = $1`,
  [id]
);

if (!existing.rowCount) {
  return res.status(404).json({
    success: false,
    message: "Product not found.",
  });
}

const result = await pool.query(
  `UPDATE products
   SET is_active = $1, updated_at = NOW()
   WHERE id = $2
   RETURNING id, sku, name, is_active`,
  [isActive, id]
);

  if (!result.rowCount) {
    return res.status(404).json({
      success: false,
      message: "Product not found.",
    });
  }

  await logAudit({
  userId: req.session.user.id,
  action: isActive ? "ACTIVATE" : "DEACTIVATE",
  entityType: "product",
  entityId: id,
  oldValues: existing.rows[0],
  newValues: result.rows[0],
  ipAddress: req.ip,
});

  return res.json({
    success: true,
    message: isActive
      ? "Product reactivated successfully."
      : "Product deactivated successfully.",
    product: result.rows[0],
  });
});

module.exports = {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateProductStatus,
};
