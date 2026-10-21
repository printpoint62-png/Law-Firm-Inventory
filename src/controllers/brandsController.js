
"use strict";

const pool = require("../config/db");

function asyncHandler(fn) {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

function validId(id) {
  return /^[1-9]\d*$/.test(String(id || ""));
}

const getBrands = asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "all").toLowerCase();

  if (!["all", "active", "inactive"].includes(status)) {
    return res.status(400).json({
      success: false, message: "Invalid brand status filter.",
    });
  }

  const values = [];
  const conditions = [];

  if (status === "active") conditions.push("is_active = TRUE");
  if (status === "inactive") conditions.push("is_active = FALSE");

  if (search) {
    values.push(`%${search}%`);
    conditions.push(`name ILIKE $${values.length}`);
  }

  const where = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const result = await pool.query(
    `SELECT id, name, is_active, created_at
     FROM brands ${where}
     ORDER BY name ASC
     LIMIT 200`,
    values
  );

  res.json({ success: true, brands: result.rows });
});

const createBrand = asyncHandler(async (req, res) => {
  const name = typeof req.body.name === "string"
    ? req.body.name.trim() : "";

  if (!name || name.length > 100) {
    return res.status(400).json({
      success: false,
      message: "A brand name of 1–100 characters is required.",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO brands (name)
       VALUES ($1)
       RETURNING id, name, is_active, created_at`,
      [name]
    );

    return res.status(201).json({
      success: true,
      message: "Brand created successfully.",
      brand: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false, message: "This brand name already exists.",
      });
    }
    throw error;
  }
});

const updateBrand = asyncHandler(async (req, res) => {
  const id = String(req.params.id || "");
  const name = typeof req.body.name === "string"
    ? req.body.name.trim() : "";

  if (!validId(id)) {
    return res.status(400).json({
      success: false, message: "Invalid brand ID.",
    });
  }

  if (!name || name.length > 100) {
    return res.status(400).json({
      success: false,
      message: "A brand name of 1–100 characters is required.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE brands SET name = $1
       WHERE id = $2
       RETURNING id, name, is_active, created_at`,
      [name, id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false, message: "Brand not found.",
      });
    }

    return res.json({
      success: true,
      message: "Brand updated successfully.",
      brand: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false, message: "This brand name already exists.",
      });
    }
    throw error;
  }
});

const updateBrandStatus = asyncHandler(async (req, res) => {
  const id = String(req.params.id || "");
  const isActive = req.body.is_active;

  if (!validId(id)) {
    return res.status(400).json({
      success: false, message: "Invalid brand ID.",
    });
  }

  if (typeof isActive !== "boolean") {
    return res.status(400).json({
      success: false, message: "is_active must be true or false.",
    });
  }

  const result = await pool.query(
    `UPDATE brands SET is_active = $1
     WHERE id = $2
     RETURNING id, name, is_active, created_at`,
    [isActive, id]
  );

  if (!result.rowCount) {
    return res.status(404).json({
      success: false, message: "Brand not found.",
    });
  }

  return res.json({
    success: true,
    message: isActive
      ? "Brand reactivated successfully."
      : "Brand deactivated successfully.",
    brand: result.rows[0],
  });
});

module.exports = {
  getBrands,
  createBrand,
  updateBrand,
  updateBrandStatus,
};
