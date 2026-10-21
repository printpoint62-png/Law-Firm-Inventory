
"use strict";

const pool = require("../config/db");

async function logAudit({
  userId = null,
  action,
  entityType,
  entityId = null,
  oldValues = null,
  newValues = null,
  ipAddress = null,
}) {
  if (!action || !entityType) {
    throw new Error("Audit action and entity type are required.");
  }

  await pool.query(
    `INSERT INTO audit_logs (
       user_id,
       action,
       entity_type,
       entity_id,
       old_values,
       new_values,
       ip_address
     )
     VALUES (
       $1, $2, $3, $4,
       $5::jsonb, $6::jsonb, $7::inet
     )`,
    [
      userId,
      action,
      entityType,
      entityId === null ? null : String(entityId),
      oldValues === null ? null : JSON.stringify(oldValues),
      newValues === null ? null : JSON.stringify(newValues),
      ipAddress,
    ]
  );
}

module.exports = { logAudit };
