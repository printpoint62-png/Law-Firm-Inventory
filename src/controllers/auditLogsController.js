
"use strict";

const pool = require("../config/db");

function asyncHandler(fn) {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

// GET /api/audit-logs
const getAuditLogs = asyncHandler(async (req, res) => {
  const action = String(req.query.action || "").trim().toUpperCase();
  const entityType = String(req.query.entity_type || "").trim().toLowerCase();
  const search = String(req.query.search || "").trim();
  const limitValue = Number(req.query.limit || 50);

  const allowedActions = [
    "CREATE",
    "UPDATE",
    "ACTIVATE",
    "DEACTIVATE",
    "DELETE",
  ];

  if (action && !allowedActions.includes(action)) {
    return res.status(400).json({
      success: false,
      message: "Invalid audit action filter.",
    });
  }

  if (entityType && entityType.length > 100) {
    return res.status(400).json({
      success: false,
      message: "Entity type filter is too long.",
    });
  }

  if (search.length > 100) {
    return res.status(400).json({
      success: false,
      message: "Search text is too long.",
    });
  }

  const limit = Number.isInteger(limitValue)
    ? Math.min(Math.max(limitValue, 1), 100)
    : 50;

  const conditions = [];
  const values = [];

  if (action) {
    values.push(action);
    conditions.push(`a.action = $${values.length}`);
  }

  if (entityType) {
    values.push(entityType);
    conditions.push(`LOWER(a.entity_type) = $${values.length}`);
  }

  if (search) {
    values.push(`%${search}%`);
    const position = values.length;

    conditions.push(`
      (
        COALESCE(a.action, '') ILIKE $${position}
        OR COALESCE(a.entity_type, '') ILIKE $${position}
        OR COALESCE(a.entity_id, '') ILIKE $${position}
        OR COALESCE(u.full_name, '') ILIKE $${position}
        OR COALESCE(u.email, '') ILIKE $${position}
      )
    `);
  }

  values.push(limit);

  const where = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const result = await pool.query(
    `SELECT
       a.id,
       a.user_id,
       u.full_name AS user_name,
       u.email AS user_email,
       a.action,
       a.entity_type,
       a.entity_id,
       a.old_values,
       a.new_values,
       a.ip_address,
       a.created_at
     FROM audit_logs a
     LEFT JOIN users u ON u.id = a.user_id
     ${where}
     ORDER BY a.created_at DESC, a.id DESC
     LIMIT $${values.length}`,
    values
  );

  return res.json({
    success: true,
    auditLogs: result.rows,
  });
});

module.exports = { getAuditLogs };
