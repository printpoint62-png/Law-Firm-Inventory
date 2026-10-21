
const bcrypt = require("bcryptjs");
const pool = require("../config/db");

function asyncHandler(fn) {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

const login = asyncHandler(async (req, res) => {
  const email =
    typeof req.body.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";

  const password =
    typeof req.body.password === "string"
      ? req.body.password
      : "";

  if (
    !email ||
    !password ||
    email.length > 255 ||
    password.length > 128
  ) {
    return res.status(400).json({
      success: false,
      message: "Enter a valid email and password.",
    });
  }

  const result = await pool.query(
    `SELECT
       u.id,
       u.full_name,
       u.email,
       u.password_hash,
       u.is_active,
       r.name AS role
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE LOWER(u.email) = $1
     LIMIT 1`,
    [email]
  );

  const user = result.rows[0];

  if (
    !user ||
    !user.is_active ||
    !(await bcrypt.compare(password, user.password_hash))
  ) {
    return res.status(401).json({
      success: false,
      message: "Invalid email or password.",
    });
  }

  // Regenerate the session to help prevent session fixation.
  await new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  req.session.user = {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
  };

  await new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  await pool.query(
    "UPDATE users SET last_login_at = NOW() WHERE id = $1",
    [user.id]
  );

  return res.status(200).json({
    success: true,
    message: "Login successful.",
    user: req.session.user,
  });
});

const me = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,
    user: req.session.user,
  });
});

const logout = asyncHandler(async (req, res) => {
  if (!req.session) {
    return res.status(200).json({
      success: true,
      message: "Logged out successfully.",
    });
  }

  await new Promise((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) reject(error);
      else resolve();
    });
  });

  res.clearCookie("lawfirm.sid", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  return res.status(200).json({
    success: true,
    message: "Logged out successfully.",
  });
});

module.exports = {
  login,
  me,
  logout,
};
