
"use strict";

const pool = require("../config/db");

function asyncHandler(fn) {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

// GET /api/clients
const getClients = asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim();
  const status = String(req.query.status || "all").toLowerCase();

  if (!["all", "active", "inactive"].includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Invalid client status filter.",
    });
  }

  const values = [];
  const conditions = [];

  if (status === "active") {
    conditions.push("c.is_active = TRUE");
  } else if (status === "inactive") {
    conditions.push("c.is_active = FALSE");
  }

  if (search) {
    values.push(`%${search}%`);
    const parameter = `$${values.length}`;

    conditions.push(`(
      c.client_code ILIKE ${parameter}
      OR c.name ILIKE ${parameter}
      OR COALESCE(c.contact_person, '') ILIKE ${parameter}
      OR COALESCE(c.email, '') ILIKE ${parameter}
      OR COALESCE(c.phone, '') ILIKE ${parameter}
    )`);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const result = await pool.query(
    `
      SELECT
        c.id,
        c.client_code,
        c.name,
        c.contact_person,
        c.email,
        c.phone,
        c.address,
        c.notes,
        c.is_active,
        c.created_at,
        c.updated_at
      FROM clients c
      ${whereClause}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT 200
    `,
    values
  );

  return res.status(200).json({
    success: true,
    clients: result.rows,
  });
});

// POST /api/clients
const createClient = asyncHandler(async (req, res) => {
  const clientCode =
    typeof req.body.client_code === "string"
      ? req.body.client_code.trim()
      : "";

  const name =
    typeof req.body.name === "string"
      ? req.body.name.trim()
      : "";

  const contactPerson =
    typeof req.body.contact_person === "string"
      ? req.body.contact_person.trim()
      : "";

  const email =
    typeof req.body.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

  const phone =
    typeof req.body.phone === "string"
      ? req.body.phone.trim()
      : "";

  const address =
    typeof req.body.address === "string"
      ? req.body.address.trim()
      : "";

  const notes =
    typeof req.body.notes === "string"
      ? req.body.notes.trim()
      : "";

  if (!clientCode || !name) {
    return res.status(400).json({
      success: false,
      message: "Client code and client name are required.",
    });
  }

  if (clientCode.length > 40 || name.length > 200) {
    return res.status(400).json({
      success: false,
      message: "Client code or client name exceeds the allowed length.",
    });
  }

  if (
    contactPerson.length > 150 ||
    email.length > 255 ||
    phone.length > 20
  ) {
    return res.status(400).json({
      success: false,
      message: "One or more client fields exceed the allowed length.",
    });
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid email address.",
    });
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO clients (
          client_code,
          name,
          contact_person,
          email,
          phone,
          address,
          notes,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING
          id,
          client_code,
          name,
          contact_person,
          email,
          phone,
          address,
          notes,
          is_active,
          created_at,
          updated_at
      `,
      [
        clientCode,
        name,
        contactPerson || null,
        email || null,
        phone || null,
        address || null,
        notes || null,
        req.session.user.id,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Client created successfully.",
      client: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "This client code already exists. Please use a unique code.",
      });
    }

    throw error;
  }
});

// PUT /api/clients/:id
const updateClient = asyncHandler(async (req, res) => {
  const id = String(req.params.id || "");

  if (!/^[1-9]\d*$/.test(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid client ID.",
    });
  }

  const clientCode =
    typeof req.body.client_code === "string"
      ? req.body.client_code.trim()
      : "";

  const name =
    typeof req.body.name === "string"
      ? req.body.name.trim()
      : "";

  const contactPerson =
    typeof req.body.contact_person === "string"
      ? req.body.contact_person.trim()
      : "";

  const email =
    typeof req.body.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

  const phone =
    typeof req.body.phone === "string"
      ? req.body.phone.trim()
      : "";

  const address =
    typeof req.body.address === "string"
      ? req.body.address.trim()
      : "";

  const notes =
    typeof req.body.notes === "string"
      ? req.body.notes.trim()
      : "";

  if (!clientCode || !name) {
    return res.status(400).json({
      success: false,
      message: "Client code and client name are required.",
    });
  }

  if (
    clientCode.length > 40 ||
    name.length > 200 ||
    contactPerson.length > 150 ||
    email.length > 255 ||
    phone.length > 20
  ) {
    return res.status(400).json({
      success: false,
      message: "One or more client fields exceed the allowed length.",
    });
  }

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid email address.",
    });
  }

  try {
    const result = await pool.query(
      `
        UPDATE clients
        SET
          client_code = $1,
          name = $2,
          contact_person = $3,
          email = $4,
          phone = $5,
          address = $6,
          notes = $7,
          updated_at = NOW()
        WHERE id = $8
        RETURNING
          id,
          client_code,
          name,
          contact_person,
          email,
          phone,
          address,
          notes,
          is_active,
          created_at,
          updated_at
      `,
      [
        clientCode,
        name,
        contactPerson || null,
        email || null,
        phone || null,
        address || null,
        notes || null,
        id,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Client not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Client updated successfully.",
      client: result.rows[0],
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "This client code already exists. Please use a unique code.",
      });
    }

    throw error;
  }
});

// PATCH /api/clients/:id/status
const updateClientStatus = asyncHandler(async (req, res) => {
  const id = String(req.params.id || "");
  const isActive = req.body.is_active;

  if (!/^[1-9]\d*$/.test(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid client ID.",
    });
  }

  if (typeof isActive !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "is_active must be true or false.",
    });
  }

  const result = await pool.query(
    `
      UPDATE clients
      SET
        is_active = $1,
        updated_at = NOW()
      WHERE id = $2
      RETURNING id, client_code, name, is_active, updated_at
    `,
    [isActive, id]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({
      success: false,
      message: "Client not found.",
    });
  }

  return res.status(200).json({
    success: true,
    message: isActive
      ? "Client reactivated successfully."
      : "Client deactivated successfully.",
    client: result.rows[0],
  });
});

module.exports = {
  getClients,
  createClient,
  updateClient,
  updateClientStatus,
};
