
"use strict";

const pool = require("../config/db");

function asyncHandler(fn) {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

function validId(id) {
  return /^[1-9]\d*$/.test(String(id || ""));
}

const getUnits = asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "all").toLowerCase();

  if (!["all", "active", "inactive"].includes(status)) {
    return res.status(400).json({
      success: false, message: "Invalid unit status filter.",
    });
  }

  const values = [];
  const conditions = [];

  if (status === "active") conditions.push("is_active = TRUE");
  if (status === "inactive") conditions.push("is_active = FALSE");

  if (search) {
    values.push(`%${search}%`);
    conditions.push(
      `(name ILIKE $${values.length} OR abbreviation ILIKE $${values.length})`
    );
  }

  const where = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const result = await pool.query(
    `SELECT id, name, abbreviation, is_active
     FROM units ${where}
     ORDER BY name ASC
     LIMIT 200`,
    values
  );

  res.json({ success: true, units: result.rows });
});

const createUnit = asyncHandler(async (req, res) => {
  const name = typeof req.body.name === "string"
    ? req.body.name.trim() : "";
  const abbreviation = typeof req.body.abbreviation === "string"
    ? req.body.abbreviation.trim() : "";

  if (!name || name.length > 50) {
    return res.status(400).json({
      success: false,
      message: "A unit name of 1–50 characters is required.",
    });
  }

  if (!abbreviation || abbreviation.length > 15) {
    return res.status(400).json({
      success: false,
      message: "A unit abbreviation of 1–15 characters is required.",
    });
  }

  try {
    const result = await pool.query(
      `INSERT INTO units (name, abbreviation)
       VALUES ($1, $2)
       RETURNING id, name, abbreviation, is_active`,
      [name, abbreviation]
    );

    return res.status(201).json({
      success: true,
      message: "Unit created successfully.",
      unit: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "This unit name or abbreviation already exists.",
      });
    }
    throw error;
  }
});

const updateUnit = asyncHandler(async (req, res) => {
  const id = String(req.params.id || "");
  const name = typeof req.body.name === "string"
    ? req.body.name.trim() : "";
  const abbreviation = typeof req.body.abbreviation === "string"
    ? req.body.abbreviation.trim() : "";

  if (!validId(id)) {
    return res.status(400).json({
      success: false, message: "Invalid unit ID.",
    });
  }

  if (!name || name.length > 50) {
    return res.status(400).json({
      success: false,
      message: "A unit name of 1–50 characters is required.",
    });
  }

  if (!abbreviation || abbreviation.length > 15) {
    return res.status(400).json({
      success: false,
      message: "A unit abbreviation of 1–15 characters is required.",
    });
  }

  try {
    const result = await pool.query(
      `UPDATE units SET name = $1, abbreviation = $2
       WHERE id = $3
       RETURNING id, name, abbreviation, is_active`,
      [name, abbreviation, id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false, message: "Unit not found.",
      });
    }

    return res.json({
      success: true,
      message: "Unit updated successfully.",
      unit: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "This unit name or abbreviation already exists.",
      });
    }
    throw error;
  }
});

const updateUnitStatus = asyncHandler(async (req, res) => {
  const id = String(req.params.id || "");
  const isActive = req.body.is_active;

  if (!validId(id)) {
    return res.status(400).json({
      success: false, message: "Invalid unit ID.",
    });
  }

  if (typeof isActive !== "boolean") {
    return res.status(400).json({
      success: false, message: "is_active must be true or false.",
    });
  }

  const result = await pool.query(
    `UPDATE units SET is_active = $1
     WHERE id = $2
     RETURNING id, name, abbreviation, is_active`,
    [isActive, id]
  );

  if (!result.rowCount) {
    return res.status(404).json({
      success: false, message: "Unit not found.",
    });
  }

  return res.json({
    success: true,
    message: isActive
      ? "Unit reactivated successfully."
      : "Unit deactivated successfully.",
    unit: result.rows[0],
  });
});

module.exports = {
  getUnits,
  createUnit,
  updateUnit,
  updateUnitStatus,
};
