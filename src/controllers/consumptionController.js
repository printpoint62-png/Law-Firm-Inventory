
"use strict";

const pool = require("../config/db");
const crypto = require("crypto");

function asyncHandler(fn) {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function positiveId(value, fieldName) {
  const valueText = String(value ?? "").trim();

  if (!/^[1-9]\d*$/.test(valueText)) {
    fail(400, `${fieldName} must be a valid ID.`);
  }

  const id = Number(valueText);

  if (!Number.isSafeInteger(id)) {
    fail(400, `${fieldName} is invalid.`);
  }

  return id;
}

function positiveQuantity(value) {
  const quantity = Number(value);

  if (!Number.isFinite(quantity) || quantity <= 0) {
    fail(400, "Quantity must be greater than zero.");
  }

  if (quantity > 1000000000) {
    fail(400, "Quantity is too large.");
  }

  return quantity;
}

function optionalText(value, maxLength = 500) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    fail(400, "Text fields must contain text.");
  }

  const text = value.trim();

  if (text.length > maxLength) {
    fail(400, `Text cannot exceed ${maxLength} characters.`);
  }

  return text || null;
}

function currentUserId(req) {
  return positiveId(req.session.user.id, "Logged-in user ID");
}

function isStaff(req) {
  return req.session.user.role === "Staff";
}

// GET /api/consumption/stock
// Admin, HR and Staff can view current stock.
const getStock = asyncHandler(async (req, res) => {
  const result = await pool.query(`
    SELECT
      product_id,
      sku,
      product_name,
      unit_id,
      reorder_level,
      current_stock,
      stock_value,
      CASE
        WHEN current_stock > 0
        THEN ROUND(stock_value / current_stock, 4)
        ELSE 0
      END AS average_unit_cost
    FROM inventory_stock_balances
    ORDER BY product_name ASC
  `);

  return res.status(200).json({
    success: true,
    data: result.rows,
  });
});

// GET /api/consumption
// Staff see only their own issued stock; Admin and HR see all.
const getConsumptions = asyncHandler(async (req, res) => {
  const conditions = ["st.movement_type = 'Stock Out'"];
  const values = [];

  if (isStaff(req)) {
    values.push(currentUserId(req));
    conditions.push(`st.issued_to = $${values.length}`);
  }

  if (req.query.product_id) {
    values.push(positiveId(req.query.product_id, "Product ID"));
    conditions.push(`st.product_id = $${values.length}`);
  }

  if (req.query.client_id) {
    values.push(positiveId(req.query.client_id, "Client ID"));
    conditions.push(`st.client_id = $${values.length}`);
  }

  if (req.query.file_id) {
    values.push(positiveId(req.query.file_id, "File ID"));
    conditions.push(`st.file_id = $${values.length}`);
  }

  const result = await pool.query(
    `
      SELECT
        st.id,
        st.transaction_number,
        st.product_id,
        p.sku,
        p.name AS product_name,
        u.name AS unit_name,
        st.quantity,
        st.unit_cost,
        st.quantity * st.unit_cost AS total_cost,
        st.issued_to,
        recipient.full_name AS recipient_name,
        st.client_id,
        c.name AS client_name,
        st.file_id,
        f.file_number,
        f.title AS file_title,
        st.reference_number,
        st.notes,
        st.occurred_at,
        st.created_by,
        creator.full_name AS recorded_by
      FROM stock_transactions st
      JOIN products p ON p.id = st.product_id
      LEFT JOIN units u ON u.id = p.unit_id
      LEFT JOIN users recipient ON recipient.id = st.issued_to
      LEFT JOIN clients c ON c.id = st.client_id
      LEFT JOIN files f ON f.id = st.file_id
      LEFT JOIN users creator ON creator.id = st.created_by
      WHERE ${conditions.join(" AND ")}
      ORDER BY st.occurred_at DESC, st.id DESC
      LIMIT 500
    `,
    values
  );

  return res.status(200).json({
    success: true,
    data: result.rows,
  });
});

// POST /api/consumption
// Admin and HR can issue one or multiple products in a single request.
const issueStock = asyncHandler(async (req, res) => {
  const userId = currentUserId(req);
  const issuedTo = positiveId(req.body.issued_to, "Recipient ID");
  const clientId = positiveId(req.body.client_id, "Client ID");
  const fileId = positiveId(req.body.file_id, "File ID");

  const referenceNumber = optionalText(
    req.body.reference_number,
    100
  );
  const notes = optionalText(req.body.notes, 2000);

  // Support the new items array and the existing single-product payload.
  let rawItems;

  if (Array.isArray(req.body.items)) {
    rawItems = req.body.items;
  } else if (
    req.body.product_id !== undefined ||
    req.body.quantity !== undefined
  ) {
    rawItems = [{
      product_id: req.body.product_id,
      quantity: req.body.quantity,
    }];
  } else {
    fail(400, "Add at least one product and quantity.");
  }

  if (rawItems.length === 0) {
    fail(400, "Add at least one product and quantity.");
  }

  if (rawItems.length > 100) {
    fail(400, "You can issue a maximum of 100 products per request.");
  }

  const items = rawItems.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      fail(400, `Product item ${index + 1} is invalid.`);
    }

    return {
      productId: positiveId(
        item.product_id,
        `Product ID in item ${index + 1}`
      ),
      quantity: positiveQuantity(item.quantity),
    };
  });

  const productIds = items.map((item) => item.productId);

  if (new Set(productIds).size !== productIds.length) {
    fail(400, "Each product can appear only once per issue. Combine its quantities.");
  }

  const db = await pool.connect();

  try {
    await db.query("BEGIN");

    /*
     * Lock product rows in sorted ID order.
     * This serializes competing issues for the same product and
     * reduces the risk of deadlocks in multi-product requests.
     */
    const lockedProducts = new Map();

    for (const productId of [...productIds].sort((a, b) => a - b)) {
      const productResult = await db.query(
        `
          SELECT id, name, unit_id, is_active
          FROM products
          WHERE id = $1
          FOR UPDATE
        `,
        [productId]
      );

      const product = productResult.rows[0];

      if (!product || !product.is_active) {
        fail(404, `Product ID ${productId} was not found or is inactive.`);
      }

      lockedProducts.set(productId, product);
    }

    // Recipient must be an active Staff account.
    const recipientResult = await db.query(
      `
        SELECT u.id
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE u.id = $1
          AND u.is_active = TRUE
          AND r.name = 'Staff'
        LIMIT 1
      `,
      [issuedTo]
    );

    if (recipientResult.rowCount === 0) {
      fail(400, "Recipient must be an active Staff account.");
    }

    // Validate the selected client.
    const clientResult = await db.query(
      `
        SELECT id
        FROM clients
        WHERE id = $1
          AND is_active = TRUE
        FOR UPDATE
      `,
      [clientId]
    );

    if (clientResult.rowCount === 0) {
      fail(400, "Select an active client.");
    }

    // Validate the file/client relationship and lock the file.
    const fileResult = await db.query(
      `
        SELECT f.id, f.client_id, f.status
        FROM files f
        WHERE f.id = $1
          AND f.client_id = $2
        FOR UPDATE
      `,
      [fileId, clientId]
    );

    if (
      fileResult.rowCount === 0 ||
      fileResult.rows[0].status !== "Active"
    ) {
      fail(400, "Select an active file belonging to the selected client.");
    }

    /*
     * Validate the available stock for EVERY product before inserting
     * any ledger entries. Product row locks prevent another issue using
     * this same workflow from changing the same product concurrently.
     */
    const validatedItems = [];

    for (const item of items) {
      const balanceResult = await db.query(
        `
          SELECT current_stock, stock_value
          FROM inventory_stock_balances
          WHERE product_id = $1
        `,
        [item.productId]
      );

      const balance = balanceResult.rows[0];

      const availableStock = Number(balance?.current_stock ?? 0);
      const currentStockValue = Number(balance?.stock_value ?? 0);

      if (
        !Number.isFinite(availableStock) ||
        availableStock < 0 ||
        !Number.isFinite(currentStockValue) ||
        currentStockValue < 0
      ) {
        fail(
          409,
          `Stock balance for ${lockedProducts.get(item.productId).name} is invalid. Check the stock ledger.`
        );
      }

      if (item.quantity > availableStock) {
        fail(
          409,
          `Insufficient stock for ${lockedProducts.get(item.productId).name}. Available quantity: ${availableStock}.`
        );
      }

      const averageUnitCost =
        availableStock > 0
          ? currentStockValue / availableStock
          : 0;

      validatedItems.push({
        ...item,
        unitCost: averageUnitCost,
      });
    }

    /*
     * All products passed validation. Insert one Stock Out ledger row
     * per product, sharing the same reference number and issue details.
     */
    const insertedItems = [];

    for (const item of validatedItems) {
      const transactionNumber =
        `CON-${Date.now()}-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;

      const inserted = await db.query(
        `
          INSERT INTO stock_transactions (
            transaction_number,
            product_id,
            movement_type,
            quantity,
            unit_cost,
            client_id,
            file_id,
            reference_number,
            notes,
            occurred_at,
            created_by,
            issued_to
          )
          VALUES (
            $1, $2, 'Stock Out', $3, $4,
            $5, $6, $7, $8, NOW(), $9, $10
          )
          RETURNING
            id,
            transaction_number,
            product_id,
            movement_type,
            quantity,
            unit_cost,
            client_id,
            file_id,
            reference_number,
            occurred_at,
            created_by,
            issued_to
        `,
        [
          transactionNumber,
          item.productId,
          item.quantity,
          item.unitCost,
          clientId,
          fileId,
          referenceNumber,
          notes,
          userId,
          issuedTo,
        ]
      );

      insertedItems.push(inserted.rows[0]);
    }

    // All ledger rows commit together or none of them commit.
    await db.query("COMMIT");

    return res.status(201).json({
      success: true,
      message: `Successfully issued ${insertedItems.length} product(s) and recorded all stock movements.`,
      reference_number: referenceNumber,
      data: insertedItems,
    });
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    db.release();
  }
});

module.exports = {
  getStock,
  getConsumptions,
  issueStock,
};
