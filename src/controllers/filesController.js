
"use strict";

const pool = require("../config/db");

function asyncHandler(fn) {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

function validateId(value) {
  return /^[1-9]\d*$/.test(String(value || ""));
}

function validateFileNumber(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 80
  );
}

function validateTitle(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 250
  );
}

function validateDate(value) {
  if (value === null || value === undefined || value === "") {
    return true;
  }

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

function normalizeOptionalText(value) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed || null;
}

function validateStatus(status) {
  return ["Active", "Closed", "Archived"].includes(status);
}

// GET /api/files
const getFiles = asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "all").trim();
  const clientId = String(req.query.client_id || "").trim();

  if (!["all", "Active", "Closed", "Archived"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid file status filter.",
    });
  }

  if (clientId && !validateId(clientId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid client ID.",
    });
  }

  const values = [];
  const conditions = [];

  if (status !== "all") {
    values.push(status);
    conditions.push(`f.status = $${values.length}`);
  }

  if (clientId) {
    values.push(clientId);
    conditions.push(`f.client_id = $${values.length}`);
  }

  if (search) {
    values.push(`%${search}%`);
    const parameter = `$${values.length}`;

    conditions.push(`(
      f.file_number ILIKE ${parameter}
      OR f.title ILIKE ${parameter}
      OR COALESCE(f.description, '') ILIKE ${parameter}
      OR c.client_code ILIKE ${parameter}
      OR c.name ILIKE ${parameter}
    )`);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const result = await pool.query(
    `
      SELECT
        f.id,
        f.client_id,
        f.file_number,
        f.title,
        f.description,
        f.status,
        f.opened_at,
        f.closed_at,
        f.created_by,
        f.created_at,
        f.updated_at,
        c.client_code,
        c.name AS client_name,
        c.is_active AS client_is_active
      FROM files f
      INNER JOIN clients c ON c.id = f.client_id
      ${whereClause}
      ORDER BY f.created_at DESC, f.id DESC
      LIMIT 200
    `,
    values
  );

  return res.status(200).json({
    success: true,
    files: result.rows,
  });
});

// GET /api/files/:id
const getFileById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!validateId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid file ID.",
    });
  }

  const result = await pool.query(
    `
      SELECT
        f.id,
        f.client_id,
        f.file_number,
        f.title,
        f.description,
        f.status,
        f.opened_at,
        f.closed_at,
        f.created_by,
        f.created_at,
        f.updated_at,
        c.client_code,
        c.name AS client_name,
        c.is_active AS client_is_active
      FROM files f
      INNER JOIN clients c ON c.id = f.client_id
      WHERE f.id = $1
    `,
    [id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({
      success: false,
      message: "File not found.",
    });
  }

  return res.status(200).json({
    success: true,
    file: result.rows[0],
  });
});

// GET /api/files/lookup/:fileNumber
const lookupFileByNumber = asyncHandler(async (req, res) => {
  const fileNumber = String(req.params.fileNumber || "").trim();

  if (!validateFileNumber(fileNumber)) {
    return res.status(400).json({
      success: false,
      message: "A valid file number is required.",
    });
  }

  const result = await pool.query(
    `
      SELECT
        f.id,
        f.client_id,
        f.file_number,
        f.title,
        f.description,
        f.status,
        f.opened_at,
        f.closed_at,
        c.client_code,
        c.name AS client_name,
        c.is_active AS client_is_active
      FROM files f
      INNER JOIN clients c ON c.id = f.client_id
      WHERE f.file_number = $1
    `,
    [fileNumber]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({
      success: false,
      message: "No file was found with this file number.",
    });
  }

  return res.status(200).json({
    success: true,
    file: result.rows[0],
  });
});

// POST /api/files
const createFile = asyncHandler(async (req, res) => {
  const clientId = String(req.body.client_id || "").trim();
  const fileNumber =
    typeof req.body.file_number === "string"
      ? req.body.file_number.trim()
      : "";
  const title =
    typeof req.body.title === "string"
      ? req.body.title.trim()
      : "";
  const description = normalizeOptionalText(req.body.description);
  const openedAt = req.body.opened_at || null;
  const closedAt = req.body.closed_at || null;

  if (!validateId(clientId)) {
    return res.status(400).json({
      success: false,
      message: "Please select a valid client.",
    });
  }

  if (!validateFileNumber(fileNumber)) {
    return res.status(400).json({
      success: false,
      message: "File number is required and must not exceed 80 characters.",
    });
  }

  if (!validateTitle(title)) {
    return res.status(400).json({
      success: false,
      message: "File title is required and must not exceed 250 characters.",
    });
  }

  if (description !== null && description.length > 10000) {
    return res.status(400).json({
      success: false,
      message: "Description must not exceed 10,000 characters.",
    });
  }

  if (!validateDate(openedAt) || !validateDate(closedAt)) {
    return res.status(400).json({
      success: false,
      message: "Please provide valid dates in YYYY-MM-DD format.",
    });
  }

  if (openedAt && closedAt && closedAt < openedAt) {
    return res.status(400).json({
      success: false,
      message: "Closed date cannot be earlier than the opened date.",
    });
  }

  const clientResult = await pool.query(
    `SELECT id, is_active FROM clients WHERE id = $1`,
    [clientId]
  );

  if (clientResult.rowCount === 0) {
    return res.status(400).json({
      success: false,
      message: "The selected client does not exist.",
    });
  }

  if (!clientResult.rows[0].is_active) {
    return res.status(400).json({
      success: false,
      message: "You cannot create a file for an inactive client.",
    });
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO files (
          client_id,
          file_number,
          title,
          description,
          opened_at,
          closed_at,
          status,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
          id,
          client_id,
          file_number,
          title,
          description,
          status,
          opened_at,
          closed_at,
          created_by,
          created_at,
          updated_at
      `,
      [
        clientId,
        fileNumber,
        title,
        description,
        openedAt,
        closedAt,
        "Active",
        req.session.user.id,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "File created successfully.",
      file: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "This file number already exists. Use a unique file number.",
      });
    }

    if (error.code === "23503") {
      return res.status(400).json({
        success: false,
        message: "The selected client is invalid.",
      });
    }

    throw error;
  }
});

// PUT /api/files/:id
const updateFile = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!validateId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid file ID.",
    });
  }

  const clientId = String(req.body.client_id || "").trim();
  const fileNumber =
    typeof req.body.file_number === "string"
      ? req.body.file_number.trim()
      : "";
  const title =
    typeof req.body.title === "string"
      ? req.body.title.trim()
      : "";
  const description = normalizeOptionalText(req.body.description);
  const openedAt = req.body.opened_at || null;
  const closedAt = req.body.closed_at || null;

  if (!validateId(clientId)) {
    return res.status(400).json({
      success: false,
      message: "Please select a valid client.",
    });
  }

  if (!validateFileNumber(fileNumber)) {
    return res.status(400).json({
      success: false,
      message: "File number is required and must not exceed 80 characters.",
    });
  }

  if (!validateTitle(title)) {
    return res.status(400).json({
      success: false,
      message: "File title is required and must not exceed 250 characters.",
    });
  }

  if (description !== null && description.length > 10000) {
    return res.status(400).json({
      success: false,
      message: "Description must not exceed 10,000 characters.",
    });
  }

  if (!validateDate(openedAt) || !validateDate(closedAt)) {
    return res.status(400).json({
      success: false,
      message: "Please provide valid dates in YYYY-MM-DD format.",
    });
  }

  if (openedAt && closedAt && closedAt < openedAt) {
    return res.status(400).json({
      success: false,
      message: "Closed date cannot be earlier than the opened date.",
    });
  }

  const existingFile = await pool.query(
    `SELECT id, status FROM files WHERE id = $1`,
    [id]
  );

  if (existingFile.rowCount === 0) {
    return res.status(404).json({
      success: false,
      message: "File not found.",
    });
  }

  const clientResult = await pool.query(
    `SELECT id, is_active FROM clients WHERE id = $1`,
    [clientId]
  );

  if (clientResult.rowCount === 0) {
    return res.status(400).json({
      success: false,
      message: "The selected client does not exist.",
    });
  }

  if (!clientResult.rows[0].is_active) {
    return res.status(400).json({
      success: false,
      message: "You cannot link a file to an inactive client.",
    });
  }

  try {
    const result = await pool.query(
      `
        UPDATE files
        SET
          client_id = $1,
          file_number = $2,
          title = $3,
          description = $4,
          opened_at = $5,
          closed_at = $6,
          updated_at = NOW()
        WHERE id = $7
        RETURNING
          id,
          client_id,
          file_number,
          title,
          description,
          status,
          opened_at,
          closed_at,
          created_by,
          created_at,
          updated_at
      `,
      [
        clientId,
        fileNumber,
        title,
        description,
        openedAt,
        closedAt,
        id,
      ]
    );

    return res.status(200).json({
      success: true,
      message: "File updated successfully.",
      file: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "This file number already exists. Use a unique file number.",
      });
    }

    if (error.code === "23503") {
      return res.status(400).json({
        success: false,
        message: "The selected client is invalid.",
      });
    }

    throw error;
  }
});

// PATCH /api/files/:id/status
const updateFileStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!validateId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid file ID.",
    });
  }

  if (!validateStatus(status)) {
    return res.status(400).json({
      success: false,
      message: "Status must be Active, Closed, or Archived.",
    });
  }

  const existingFile = await pool.query(
    `SELECT id, status, opened_at FROM files WHERE id = $1`,
    [id]
  );

  if (existingFile.rowCount === 0) {
    return res.status(404).json({
      success: false,
      message: "File not found.",
    });
  }

  const result = await pool.query(
    `
      UPDATE files
      SET
        status = $1,
        closed_at = CASE
          WHEN $2::text = 'Closed'
            THEN COALESCE(closed_at, CURRENT_DATE)
          WHEN $2::text = 'Active'
            THEN NULL
          ELSE closed_at
        END,
        updated_at = NOW()
      WHERE id = $3
      RETURNING
        id,
        client_id,
        file_number,
        title,
        description,
        status,
        opened_at,
        closed_at,
        created_by,
        created_at,
        updated_at
    `,
    [status, status, id]
  );

  return res.status(200).json({
    success: true,
    message: `File status updated to ${status}.`,
    file: result.rows[0],
  });
});

module.exports = {
  getFiles,
  getFileById,
  lookupFileByNumber,
  createFile,
  updateFile,
  updateFileStatus,
};
