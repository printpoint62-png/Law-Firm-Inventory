
"use strict";

const pool = require("../config/db");

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const getLedger = asyncHandler(async (req, res) => {
  const user = req.session?.user;

  if (!user?.id || !user?.role) {
    return res.status(401).json({
      success: false,
      message: "Authentication required."
    });
  }

  const {
    product_id,
    movement_type,
    reference_number,
    client_id,
    file_id,
    from,
    to,
    search
  } = req.query;

  const page = Math.max(
    1,
    Number.parseInt(req.query.page, 10) || 1
  );

  const limit = Math.min(
    100,
    Math.max(1, Number.parseInt(req.query.limit, 10) || 25)
  );

  const offset = (page - 1) * limit;

  const conditions = [];
  const params = [];

  const addFilter = (sql, value) => {
    params.push(value);
    conditions.push(sql.replace("?", `$${params.length}`));
  };

  if (product_id) {
    addFilter("product_id = ?", product_id);
  }

  if (movement_type) {
    addFilter("movement_type = ?", movement_type);
  }

  if (reference_number) {
    addFilter(
      "reference_number ILIKE ?",
      `%${reference_number}%`
    );
  }

  if (client_id) {
    addFilter("client_id = ?", client_id);
  }

  if (file_id) {
    addFilter("file_id = ?", file_id);
  }

  if (from) {
    addFilter("occurred_at >= ?::date", from);
  }

  if (to) {
    addFilter(
      "occurred_at < (?::date + INTERVAL '1 day')",
      to
    );
  }

  if (search) {
    params.push(`%${search}%`);
    const searchParam = `$${params.length}`;

    conditions.push(`(
      product_name ILIKE ${searchParam}
      OR sku ILIKE ${searchParam}
      OR COALESCE(reference_number, '') ILIKE ${searchParam}
      OR COALESCE(client_name, '') ILIKE ${searchParam}
      OR COALESCE(file_number, '') ILIKE ${searchParam}
      OR transaction_number ILIKE ${searchParam}
    )`);
  }

  // Staff can only view stock issued to their own account.
  if (user.role === "Staff") {
    params.push(user.id);

    conditions.push(
      `movement_type = 'Stock Out' AND issued_to = $${params.length}`
    );
  } else if (!["Admin", "HR"].includes(user.role)) {
    return res.status(403).json({
      success: false,
      message: "You do not have permission to view the stock ledger."
    });
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const query = `
    WITH ledger_base AS (
      SELECT
        st.id,
        st.transaction_number,
        st.product_id,
        st.movement_type,
        st.quantity,
        st.unit_cost,
        st.reference_number,
        st.notes,
        st.occurred_at,
        st.client_id,
        st.file_id,
        st.created_by,
        st.issued_to,
        p.sku,
        p.name AS product_name,
        c.name AS client_name,
        f.file_number,
        f.title AS file_title,
        creator.full_name AS created_by_name,
        recipient.full_name AS issued_to_name,
        CASE
          WHEN st.movement_type IN (
            'Opening',
            'Stock In',
            'Adjustment In',
            'Return In'
          )
          THEN st.quantity
          ELSE -st.quantity
        END AS signed_quantity
      FROM stock_transactions st
      JOIN products p ON p.id = st.product_id
      LEFT JOIN clients c ON c.id = st.client_id
      LEFT JOIN files f ON f.id = st.file_id
      LEFT JOIN users creator ON creator.id = st.created_by
      LEFT JOIN users recipient ON recipient.id = st.issued_to
    ),
    ledger_balanced AS (
      SELECT
        lb.*,
        SUM(lb.signed_quantity) OVER (
          PARTITION BY lb.product_id
          ORDER BY lb.occurred_at, lb.id
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        ) AS balance_after
      FROM ledger_base lb
    ),
    filtered AS (
      SELECT *
      FROM ledger_balanced
      ${whereClause}
    )
    SELECT
      id,
      transaction_number,
      product_id,
      sku,
      product_name,
      movement_type,
      occurred_at,
      reference_number,
      quantity AS transaction_quantity,
      CASE
        WHEN signed_quantity > 0 THEN quantity
        ELSE 0
      END AS stock_in,
      CASE
        WHEN signed_quantity < 0 THEN quantity
        ELSE 0
      END AS stock_out,
      balance_after,
      unit_cost,
      client_id,
      client_name,
      file_id,
      file_number,
      file_title,
      notes,
      created_by,
      created_by_name,
      issued_to,
      issued_to_name
    FROM filtered
    ORDER BY occurred_at DESC, id DESC
    LIMIT $${params.length + 1}
    OFFSET $${params.length + 2}
  `;

  const countQuery = `
    WITH ledger_base AS (
      SELECT
        st.id,
        st.product_id,
        st.movement_type,
        st.reference_number,
        st.occurred_at,
        st.client_id,
        st.file_id,
        st.issued_to,
        st.transaction_number,
        p.sku,
        p.name AS product_name,
        c.name AS client_name,
        f.file_number
      FROM stock_transactions st
      JOIN products p ON p.id = st.product_id
      LEFT JOIN clients c ON c.id = st.client_id
      LEFT JOIN files f ON f.id = st.file_id
    )
    SELECT COUNT(*)::int AS total
    FROM ledger_base
    ${whereClause}
  `;

  const [rowsResult, countResult] = await Promise.all([
    pool.query(query, [...params, limit, offset]),
    pool.query(countQuery, params)
  ]);

  const total = countResult.rows[0].total;

  return res.status(200).json({
    success: true,
    data: rowsResult.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
});

module.exports = { getLedger };
