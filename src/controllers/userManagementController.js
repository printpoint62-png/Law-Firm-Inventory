
"use strict";

const bcrypt = require("bcryptjs");
const pool = require("../config/db");

function asyncHandler(fn) {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function cleanString(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function currentUserId(req) {
  const id = Number(req.session?.user?.id);

  if (!Number.isSafeInteger(id) || id <= 0) {
    fail(401, "Please log in to continue.");
  }

  return id;
}

const listUsers = asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT
      u.id,
      u.full_name,
      u.email,
      u.phone,
      u.is_active,
      u.last_login_at,
      u.created_at,
      u.updated_at,
      r.name AS role
    FROM users u
    JOIN roles r ON r.id = u.role_id
    ORDER BY u.created_at DESC, u.id DESC
  `);

  return res.status(200).json({
    success: true,
    data: result.rows,
  });
});

// Admin and HR can retrieve active Staff recipients only.
const listActiveStaff = asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT
      u.id,
      u.full_name,
      u.email
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE r.name = 'Staff'
      AND u.is_active = TRUE
    ORDER BY u.full_name ASC
  `);

  return res.status(200).json({
    success: true,
    data: result.rows,
  });
});

const createUser = asyncHandler(async (req, res) => {
  const createdBy = currentUserId(req);

  // The route must restrict this endpoint to Admin users.
  // Keep the authenticated user ID available for future audit logging.
  void createdBy;

  const fullName = cleanString(req.body.fullName, 150);
  const email = cleanString(req.body.email, 255).toLowerCase();
  const phone = cleanString(req.body.phone, 30);
  const password =
    typeof req.body.password === "string" ? req.body.password : "";
  const roleName = cleanString(req.body.role, 20);

  if (!fullName || !email || !password || !roleName) {
    fail(400, "Full name, email, password and role are required.");
  }

  if (fullName.length < 2) {
    fail(400, "Full name must contain at least 2 characters.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fail(400, "Enter a valid email address.");
  }

  if (password.length < 12 || password.length > 128) {
    fail(400, "Password must contain between 12 and 128 characters.");
  }

  // Admin creation is permitted only through the Admin-protected route.
  if (!["Admin", "HR", "Staff"].includes(roleName)) {
    fail(400, "Select Admin, HR or Staff as the role.");
  }

  const roleResult = await pool.query(
    "SELECT id FROM roles WHERE name = $1",
    [roleName]
  );

  if (roleResult.rowCount !== 1) {
    fail(500, "The selected role is not configured correctly.");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const result = await pool.query(
      `INSERT INTO users
        (full_name, email, phone, password_hash, role_id, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, full_name, email, phone, is_active, created_at`,
      [
        fullName,
        email,
        phone || null,
        passwordHash,
        roleResult.rows[0].id,
      ]
    );

    return res.status(201).json({
      success: true,
      message: `${roleName} account created successfully.`,
      user: {
        ...result.rows[0],
        role: roleName,
      },
    });
  } catch (error) {
    if (error.code === "23505") {
      fail(409, "An account with this email already exists.");
    }

    throw error;
  }
});

const updateUserStatus = asyncHandler(async (req, res) => {
  const adminId = currentUserId(req);
  const targetId = Number(req.params.id);

  if (!Number.isSafeInteger(targetId) || targetId <= 0) {
    fail(400, "Invalid user ID.");
  }

  if (targetId === adminId) {
    fail(400, "You cannot deactivate your own account.");
  }

  const isActive = req.body.isActive;

  if (typeof isActive !== "boolean") {
    fail(400, "isActive must be true or false.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const targetResult = await client.query(
      `SELECT u.id, u.is_active, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1
       FOR UPDATE OF u`,
      [targetId]
    );

    if (targetResult.rowCount === 0) {
      fail(404, "User not found.");
    }

    const target = targetResult.rows[0];

    if (target.role === "Admin") {
      fail(400, "Admin accounts cannot be deactivated from User Management.");
    }

    const updateResult = await client.query(
      `UPDATE users
       SET is_active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, full_name, email, is_active, updated_at`,
      [isActive, targetId]
    );

    await client.query("COMMIT");

    return res.status(200).json({
      success: true,
      message: isActive
        ? "User account activated successfully."
        : "User account deactivated successfully.",
      user: {
        ...updateResult.rows[0],
        role: target.role,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
});

module.exports = {
  listUsers,
  listActiveStaff,
  createUser,
  updateUserStatus,
};
