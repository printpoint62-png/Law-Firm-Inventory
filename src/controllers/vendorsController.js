
"use strict";

const pool = require("../config/db");

function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function validId(id) {
  return /^[1-9]\d*$/.test(String(id || ""));
}

function cleanString(value) {
  if (value === undefined || value === null) return null;
  const cleaned = String(value).trim();
  return cleaned === "" ? null : cleaned;
}

function validateVendor(body) {
  const vendorCode = cleanString(body.vendor_code);
  const name = cleanString(body.name);
  const email = cleanString(body.email);

  if (!vendorCode || !name) {
    return {
      error: "Vendor code and vendor name are required.",
    };
  }

  if (vendorCode.length > 40) {
    return { error: "Vendor code cannot exceed 40 characters." };
  }

  if (name.length > 200) {
    return { error: "Vendor name cannot exceed 200 characters." };
  }

  if (email && (email.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return { error: "Please enter a valid email address." };
  }

  const fields = {
    contact_person: cleanString(body.contact_person),
    phone: cleanString(body.phone),
    address: cleanString(body.address),
    tax_number: cleanString(body.tax_number),
    notes: cleanString(body.notes),
  };

  if (fields.contact_person && fields.contact_person.length > 150) {
    return { error: "Contact person cannot exceed 150 characters." };
  }

  if (fields.phone && fields.phone.length > 20) {
    return { error: "Phone number cannot exceed 20 characters." };
  }

  if (fields.tax_number && fields.tax_number.length > 50) {
    return { error: "Tax number cannot exceed 50 characters." };
  }

  return {
    values: [
      vendorCode,
      name,
      fields.contact_person,
      email,
      fields.phone,
      fields.address,
      fields.tax_number,
      fields.notes,
    ],
  };
}

function isDuplicateCode(error) {
  return error && error.code === "23505" &&
    error.constraint === "vendors_vendor_code_key";
}

function handleDatabaseError(error, res, next) {
  if (isDuplicateCode(error)) {
    return res.status(409).json({
      success: false,
      message: "This vendor code already exists.",
    });
  }

  return next(error);
}

const getVendors = asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "all").toLowerCase();

  if (!["all", "active", "inactive"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid vendor status filter.",
    });
  }

  const values = [];
  const conditions = [];

  if (search) {
    values.push(`%${search}%`);
    conditions.push(
      `(vendor_code ILIKE $${values.length}
        OR name ILIKE $${values.length}
        OR contact_person ILIKE $${values.length}
        OR email ILIKE $${values.length}
        OR phone ILIKE $${values.length}
        OR tax_number ILIKE $${values.length})`
    );
  }

  if (status !== "all") {
    values.push(status === "active");
    conditions.push(`is_active = $${values.length}`);
  }

  values.push(200);

  const result = await pool.query(
    `SELECT
       id, vendor_code, name, contact_person, email, phone,
       address, tax_number, notes, is_active, created_at, updated_at
     FROM vendors
     ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
     ORDER BY name ASC
     LIMIT $${values.length}`,
    values
  );

  return res.json({
    success: true,
    vendors: result.rows,
  });
});

const getVendorById = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid vendor ID.",
    });
  }

  const result = await pool.query(
    `SELECT
       id, vendor_code, name, contact_person, email, phone,
       address, tax_number, notes, is_active, created_at, updated_at
     FROM vendors
     WHERE id = $1`,
    [req.params.id]
  );

  if (!result.rowCount) {
    return res.status(404).json({
      success: false,
      message: "Vendor not found.",
    });
  }

  return res.json({
    success: true,
    vendor: result.rows[0],
  });
});

const createVendor = asyncHandler(async (req, res, next) => {
  const validation = validateVendor(req.body || {});

  if (validation.error) {
    return res.status(400).json({
      success: false,
      message: validation.error,
    });
  }

  const values = validation.values;

  try {
    const result = await pool.query(
      `INSERT INTO vendors (
         vendor_code, name, contact_person, email, phone,
         address, tax_number, notes, created_by
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [...values, req.session.user.id]
    );

    return res.status(201).json({
      success: true,
      message: "Vendor created successfully.",
      vendor: result.rows[0],
    });
  } catch (error) {
    if (isDuplicateCode(error)) {
      return res.status(409).json({
        success: false,
        message: "This vendor code already exists.",
      });
    }
    return next(error);
  }
});

const updateVendor = asyncHandler(async (req, res, next) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid vendor ID.",
    });
  }

  const validation = validateVendor(req.body || {});

  if (validation.error) {
    return res.status(400).json({
      success: false,
      message: validation.error,
    });
  }

  try {
    const result = await pool.query(
      `UPDATE vendors
       SET vendor_code = $1,
           name = $2,
           contact_person = $3,
           email = $4,
           phone = $5,
           address = $6,
           tax_number = $7,
           notes = $8,
           updated_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [...validation.values, req.params.id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        message: "Vendor not found.",
      });
    }

    return res.json({
      success: true,
      message: "Vendor updated successfully.",
      vendor: result.rows[0],
    });
  } catch (error) {
    if (isDuplicateCode(error)) {
      return res.status(409).json({
        success: false,
        message: "This vendor code already exists.",
      });
    }
    return next(error);
  }
});

const updateVendorStatus = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid vendor ID.",
    });
  }

  if (typeof req.body?.is_active !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "is_active must be true or false.",
    });
  }

  const result = await pool.query(
    `UPDATE vendors
     SET is_active = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING id, vendor_code, name, is_active, updated_at`,
    [req.body.is_active, req.params.id]
  );

  if (!result.rowCount) {
    return res.status(404).json({
      success: false,
      message: "Vendor not found.",
    });
  }

  return res.json({
    success: true,
    message: `Vendor ${req.body.is_active ? "activated" : "deactivated"} successfully.`,
    vendor: result.rows[0],
  });
});

module.exports = {
  getVendors,
  getVendorById,
  createVendor,
  updateVendor,
  updateVendorStatus,
};
