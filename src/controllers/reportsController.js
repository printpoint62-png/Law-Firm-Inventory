
"use strict";

const pool = require("../config/db");

const IN_TYPES = ["Opening", "Stock In", "Adjustment In", "Return In"];
const OUT_TYPES = ["Stock Out", "Adjustment Out", "Return Out"];

function getDateRange(query) {
  const isValidDate = (value) =>
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

  const today = new Date().toISOString().slice(0, 10);
  const startOfMonth = `${today.slice(0, 7)}-01`;

  const startDate = query.startDate || startOfMonth;
  const endDate = query.endDate || today;

  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    const error = new Error("Dates must use YYYY-MM-DD format.");
    error.status = 400;
    throw error;
  }

  if (startDate > endDate) {
    const error = new Error("Start date cannot be after end date.");
    error.status = 400;
    throw error;
  }

  return { startDate, endDate };
}

async function getReportData(startDate, endDate) {
  const params = [startDate, endDate];

  const summaryQuery = `
    SELECT
      COALESCE(SUM(CASE
        WHEN movement_type = ANY($3::text[])
        THEN quantity ELSE 0 END), 0) AS total_stock_in,

      COALESCE(SUM(CASE
        WHEN movement_type = ANY($4::text[])
        THEN quantity ELSE 0 END), 0) AS total_stock_out,

      COALESCE(SUM(CASE
        WHEN movement_type = ANY($3::text[])
        THEN quantity * unit_cost
        WHEN movement_type = ANY($4::text[])
        THEN -(quantity * unit_cost)
        ELSE 0 END), 0) AS net_stock_value_change,

      COUNT(*) AS transaction_count
    FROM stock_transactions
    WHERE occurred_at >= $1::date
      AND occurred_at < ($2::date + INTERVAL '1 day')
  `;

  const summary = await pool.query(summaryQuery, [
    ...params,
    IN_TYPES,
    OUT_TYPES,
  ]);

  const movementQuery = `
    SELECT
      st.id,
      st.transaction_number,
      st.movement_type,
      st.quantity,
      st.unit_cost,
      st.quantity * st.unit_cost AS total_cost,
      st.occurred_at,
      st.reference_number,
      p.sku,
      p.name AS product_name,
      u.name AS unit_name,
      c.name AS client_name,
      f.file_number,
      f.title AS file_title,
      usr.full_name AS created_by_name
    FROM stock_transactions st
    JOIN products p ON p.id = st.product_id
    LEFT JOIN units u ON u.id = p.unit_id
    LEFT JOIN clients c ON c.id = st.client_id
    LEFT JOIN files f ON f.id = st.file_id
    LEFT JOIN users usr ON usr.id = st.created_by
    WHERE st.occurred_at >= $1::date
      AND st.occurred_at < ($2::date + INTERVAL '1 day')
    ORDER BY st.occurred_at DESC, st.id DESC
  `;

  const movements = await pool.query(movementQuery, params);

  const products = await pool.query(
    `
      SELECT
        p.id AS product_id,
        p.sku,
        p.name AS product_name,
        u.name AS unit_name,
        COALESCE(SUM(CASE
          WHEN st.movement_type = ANY($3::text[])
          THEN st.quantity ELSE 0 END), 0) AS stock_in,
        COALESCE(SUM(CASE
          WHEN st.movement_type = ANY($4::text[])
          THEN st.quantity ELSE 0 END), 0) AS stock_out,
        COALESCE(SUM(CASE
          WHEN st.movement_type = ANY($4::text[])
          THEN st.quantity * st.unit_cost ELSE 0 END), 0) AS consumption_cost
      FROM products p
      LEFT JOIN stock_transactions st
        ON st.product_id = p.id
        AND st.occurred_at >= $1::date
        AND st.occurred_at < ($2::date + INTERVAL '1 day')
      LEFT JOIN units u ON u.id = p.unit_id
      GROUP BY p.id, p.sku, p.name, u.name
      HAVING COALESCE(SUM(CASE
        WHEN st.movement_type = ANY($3::text[])
          OR st.movement_type = ANY($4::text[])
        THEN st.quantity ELSE 0 END), 0) > 0
      ORDER BY consumption_cost DESC, p.name ASC
    `,
    [...params, IN_TYPES, OUT_TYPES]
  );

  const clients = await pool.query(
    `
      SELECT
        c.id AS client_id,
        c.name AS client_name,
        COUNT(st.id) AS transaction_count,
        COALESCE(SUM(st.quantity), 0) AS total_quantity,
        COALESCE(SUM(st.quantity * st.unit_cost), 0) AS total_cost
      FROM stock_transactions st
      JOIN clients c ON c.id = st.client_id
      WHERE st.movement_type = ANY($3::text[])
        AND st.occurred_at >= $1::date
        AND st.occurred_at < ($2::date + INTERVAL '1 day')
      GROUP BY c.id, c.name
      ORDER BY total_cost DESC, c.name ASC
    `,
    [...params, OUT_TYPES]
  );

  const files = await pool.query(
    `
      SELECT
        f.id AS file_id,
        f.file_number,
        f.title AS file_title,
        c.name AS client_name,
        COUNT(st.id) AS transaction_count,
        COALESCE(SUM(st.quantity), 0) AS total_quantity,
        COALESCE(SUM(st.quantity * st.unit_cost), 0) AS total_cost
      FROM stock_transactions st
      JOIN files f ON f.id = st.file_id
      LEFT JOIN clients c ON c.id = f.client_id
      WHERE st.movement_type = ANY($3::text[])
        AND st.occurred_at >= $1::date
        AND st.occurred_at < ($2::date + INTERVAL '1 day')
      GROUP BY f.id, f.file_number, f.title, c.name
      ORDER BY total_cost DESC, f.file_number ASC
    `,
    [...params, OUT_TYPES]
  );

  return {
    summary: summary.rows[0],
    products: products.rows,
    clients: clients.rows,
    files: files.rows,
    movements: movements.rows,
  };
}

async function getReports(req, res, next) {
  try {
    const { startDate, endDate } = getDateRange(req.query);
    const data = await getReportData(startDate, endDate);

    res.json({
      success: true,
      filters: { startDate, endDate },
      ...data,
    });
  } catch (error) {
    next(error);
  }
}

function csvCell(value) {
  let text = value == null ? "" : String(value);

  // Prevent spreadsheet formula injection in exported CSV files.
  if (/^[\s]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

async function exportReportsCsv(req, res, next) {
  try {
    const { startDate, endDate } = getDateRange(req.query);
    const data = await getReportData(startDate, endDate);

    const columns = [
      ["Date", "occurred_at"],
      ["Transaction", "transaction_number"],
      ["Movement Type", "movement_type"],
      ["SKU", "sku"],
      ["Product", "product_name"],
      ["Unit", "unit_name"],
      ["Quantity", "quantity"],
      ["Unit Cost", "unit_cost"],
      ["Total Cost", "total_cost"],
      ["Client", "client_name"],
      ["File Number", "file_number"],
      ["File Title", "file_title"],
      ["Reference", "reference_number"],
      ["Created By", "created_by_name"],
    ];

    const rows = [
      columns.map(([label]) => csvCell(label)).join(","),
      ...data.movements.map((row) =>
        columns.map(([, key]) => csvCell(row[key])).join(",")
      ),
    ];

    const csv = "\uFEFF" + rows.join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="inventory-report-${startDate}-to-${endDate}.csv"`
    );

    res.status(200).send(csv);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getReports,
  exportReportsCsv,
};
