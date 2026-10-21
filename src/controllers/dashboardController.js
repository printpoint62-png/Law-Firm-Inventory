"use strict";

const pool = require("../config/db");

function asyncHandler(fn) {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

const getDashboardStats = asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT
      (
        SELECT COUNT(*)::int
        FROM clients
        WHERE is_active = TRUE
      ) AS total_clients,

      (
        SELECT COUNT(*)::int
        FROM files
        WHERE status = 'Active'
      ) AS total_files,

      (
        SELECT COUNT(*)::int
        FROM products
        WHERE is_active = TRUE
      ) AS total_products,

      (
        SELECT COUNT(*)::int
        FROM vendors
        WHERE is_active = TRUE
      ) AS total_vendors,

      (
        SELECT COUNT(*)::int
        FROM inventory_low_stock
      ) AS low_stock_products
  `);

  return res.status(200).json({
    success: true,
    stats: result.rows[0]
  });
});

module.exports = { getDashboardStats };