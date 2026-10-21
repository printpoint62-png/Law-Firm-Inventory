
"use strict";

const pool = require("../config/db");

function asyncHandler(fn) {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

function validId(id) {
  return /^[1-9]\d*$/.test(String(id || ""));
}

function handleDuplicate(error, res, label) {
  if (error.code === "23505") {
    return res.status(409).json({
      success: false,
      message: `This ${label} name already exists.`,
    });
  }

  throw error;
}

// GET /api/categories?search=&status=all|active|inactive
const getCategories = asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "all").toLowerCase();

  if (!["all", "active", "inactive"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid category status filter.",
    });
  }

  const values = [];
  const conditions = [];

  if (status === "active") {
    conditions.push("is_active = TRUE");
  }

  if (status === "inactive") {
    conditions.push("is_active = FALSE");
  }

  if (search) {
    values.push(`%${search}%`);

    conditions.push(
      `(name ILIKE $${values.length} OR COALESCE(description, '') ILIKE $${values.length})`
    );
  }

  const where = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const result = await pool.query(
    `SELECT id, name, description, is_active, created_at
     FROM categories
     ${where}
     ORDER BY name ASC
     LIMIT 200`,
    values
  );

  return res.json({
    success: true,
    categories: result.rows,
  });
});

// POST /api/categories
const createCategory = asyncHandler(async (req, res) => {
  const name =
    typeof req.body.name === "string"
      ? req.body.name.trim()
      : "";

  const description =
    typeof req.body.description === "string"
      ? req.body.description.trim()
      : "";

  if (!name) {
    return res.status(400).json({
      success: false,
      message: "Category name is required.",
    });
  }

  if (name.length > 100 || description.length > 10000) {
    return res.status(400).json({
      success: false,
      message: "Category fields exceed allowed lengths.",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO categories (name, description)
       VALUES ($1, $2)
       RETURNING id, name, description, is_active, created_at`,
      [name, description || null]
    );

    return res.status(201).json({
      success: true,
      message: "Category created successfully.",
      category: result.rows[0],
    });
  } catch (error) {
    return handleDuplicate(error, res, "category");
  }
});

// PUT /api/categories/:id
const updateCategory = asyncHandler(async (req, res) => {
  const id = String(req.params.id || "");

  const name =
    typeof req.body.name === "string"
      ? req.body.name.trim()
      : "";

  const description =
    typeof req.body.description === "string"
      ? req.body.description.trim()
      : "";

  if (!validId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid category ID.",
    });
  }

  if (!name) {
    return res.status(400).json({
      success: false,
      message: "Category name is required.",
    });
  }

  if (name.length > 100 || description.length > 10000) {
    return res.status(400).json({
      success: false,
      message: "Category fields exceed allowed lengths.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE categories
       SET name = $1, description = $2
       WHERE id = $3
       RETURNING id, name, description, is_active, created_at`,
      [name, description || null, id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Category not found.",
      });
    }

    return res.json({
      success: true,
      message: "Category updated successfully.",
      category: result.rows[0],
    });
  } catch (error) {
    return handleDuplicate(error, res, "category");
  }
});

// PATCH /api/categories/:id/status
const updateCategoryStatus = asyncHandler(async (req, res) => {
  const id = String(req.params.id || "");
  const isActive = req.body.is_active;

  if (!validId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid category ID.",
    });
  }

  if (typeof isActive !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "is_active must be true or false.",
    });
  }

  const result = await pool.query(
    `UPDATE categories
     SET is_active = $1
     WHERE id = $2
     RETURNING id, name, description, is_active, created_at`,
    [isActive, id]
  );

  if (!result.rowCount) {
    return res.status(404).json({
      success: false,
      message: "Category not found.",
    });
  }

  return res.json({
    success: true,
    message: isActive
      ? "Category reactivated successfully."
      : "Category deactivated successfully.",
    category: result.rows[0],
  });
});

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  updateCategoryStatus,
};
