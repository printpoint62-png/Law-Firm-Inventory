
"use strict";

const pool = require("../config/db");

function asyncHandler(fn) {
  return (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);
}

function validId(value) {
  return /^[1-9]\d*$/.test(String(value || ""));
}

function positiveNumber(value, fieldName, allowZero = false) {
  const number = Number(value);

  if (
    value === undefined ||
    value === null ||
    value === "" ||
    !Number.isFinite(number) ||
    (allowZero ? number < 0 : number <= 0)
  ) {
    throw Object.assign(
      new Error(
        allowZero
          ? `${fieldName} must be zero or greater.`
          : `${fieldName} must be greater than zero.`
      ),
      { status: 400 }
    );
  }

  return number;
}

function fail(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

function currentUserId(req) {
  const id = req.session?.user?.id;
  return validId(id) ? Number(id) : null;
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw fail("Add at least one product to the purchase.");
  }

  return items.map((item, index) => {
    if (!validId(item.productId)) {
      throw fail(`Product ID is invalid on line ${index + 1}.`);
    }

    return {
      productId: Number(item.productId),
      quantity: positiveNumber(
        item.quantity,
        `Quantity on line ${index + 1}`
      ),
      unitCost: positiveNumber(
        item.unitCost,
        `Unit cost on line ${index + 1}`,
        true
      ),
      notes: item.notes ? String(item.notes).trim() : null,
    };
  });
}

async function insertItems(client, purchaseId, items) {
  const productIds = [...new Set(items.map(item => item.productId))];

  const products = await client.query(
    `SELECT id, is_active
     FROM products
     WHERE id = ANY($1::bigint[])
     FOR SHARE`,
    [productIds]
  );

  const productMap = new Map(
    products.rows.map(product => [String(product.id), product])
  );

  for (const item of items) {
    const product = productMap.get(String(item.productId));

    if (!product) {
      throw fail(`Product ID ${item.productId} does not exist.`, 400);
    }

    if (!product.is_active) {
      throw fail(
        `Product ID ${item.productId} is inactive and cannot be purchased.`,
        400
      );
    }
  }

  for (const item of items) {
    await client.query(
      `INSERT INTO purchase_items
        (purchase_id, product_id, quantity, unit_cost, notes)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        purchaseId,
        item.productId,
        item.quantity,
        item.unitCost,
        item.notes,
      ]
    );
  }
}

const getPurchases = asyncHandler(async (req, res) => {
  const { search = "", status = "all" } = req.query;

  const allowedStatuses = ["all", "Draft", "Posted", "Cancelled"];

  if (!allowedStatuses.includes(status)) {
    throw fail("Invalid purchase status filter.");
  }

  const result = await pool.query(
    `SELECT
       p.id,
       p.purchase_number,
       p.vendor_id,
       v.vendor_code,
       v.name AS vendor_name,
       p.invoice_number,
       p.purchase_date,
       p.status,
       p.notes,
       p.posted_at,
       p.created_at,
       COALESCE(SUM(pi.quantity * pi.unit_cost), 0)::numeric(14,2)
         AS total_amount,
       COALESCE(SUM(pi.quantity), 0)::numeric(14,3)
         AS total_quantity,
       COUNT(pi.id)::int AS item_count
     FROM purchases p
     JOIN vendors v ON v.id = p.vendor_id
     LEFT JOIN purchase_items pi ON pi.purchase_id = p.id
     WHERE
       ($1 = 'all' OR p.status = $1)
       AND (
         $2 = ''
         OR p.purchase_number ILIKE '%' || $2 || '%'
         OR COALESCE(p.invoice_number, '') ILIKE '%' || $2 || '%'
         OR v.name ILIKE '%' || $2 || '%'
         OR v.vendor_code ILIKE '%' || $2 || '%'
       )
     GROUP BY p.id, v.id
     ORDER BY p.created_at DESC`,
    [status, String(search).trim()]
  );

  res.json({ success: true, data: result.rows });
});

const getPurchaseById = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) {
    throw fail("Invalid purchase ID.");
  }

  const result = await pool.query(
    `SELECT
       p.*,
       v.vendor_code,
       v.name AS vendor_name
     FROM purchases p
     JOIN vendors v ON v.id = p.vendor_id
     WHERE p.id = $1`,
    [req.params.id]
  );

  if (!result.rows.length) {
    throw fail("Purchase not found.", 404);
  }

  const items = await pool.query(
    `SELECT
       pi.id,
       pi.product_id,
       pr.sku,
       pr.name AS product_name,
       pi.quantity,
       pi.unit_cost,
       (pi.quantity * pi.unit_cost)::numeric(14,2) AS line_total,
       pi.notes
     FROM purchase_items pi
     JOIN products pr ON pr.id = pi.product_id
     WHERE pi.purchase_id = $1
     ORDER BY pi.id`,
    [req.params.id]
  );

  res.json({
    success: true,
    data: {
      ...result.rows[0],
      items: items.rows,
    },
  });
});

const createPurchase = asyncHandler(async (req, res) => {
  const { vendorId, invoiceNumber, purchaseDate, notes, items } = req.body;

  if (!validId(vendorId)) {
    throw fail("A valid vendor is required.");
  }

  const normalizedItems = normalizeItems(items);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const vendor = await client.query(
      "SELECT id, is_active FROM vendors WHERE id = $1 FOR SHARE",
      [vendorId]
    );

    if (!vendor.rows.length || !vendor.rows[0].is_active) {
      throw fail("Vendor does not exist or is inactive.");
    }

    const numberResult = await client.query(
      `SELECT 'PUR-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' ||
              LPAD(NEXTVAL('purchase_number_seq')::text, 5, '0')
         AS purchase_number`
    );

    const purchaseNumber = numberResult.rows[0].purchase_number;

    const created = await client.query(
      `INSERT INTO purchases
        (purchase_number, vendor_id, invoice_number, purchase_date,
         notes, created_by)
       VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6)
       RETURNING *`,
      [
        purchaseNumber,
        vendorId,
        invoiceNumber ? String(invoiceNumber).trim() : null,
        purchaseDate || null,
        notes ? String(notes).trim() : null,
        currentUserId(req),
      ]
    );

    await insertItems(client, created.rows[0].id, normalizedItems);

    await client.query("COMMIT");

    res.status(201).json({
      success: true,
      message: "Purchase draft created successfully.",
      data: created.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      throw fail("Duplicate purchase number or vendor invoice number.", 409);
    }

    throw error;
  } finally {
    client.release();
  }
});

const updatePurchase = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) {
    throw fail("Invalid purchase ID.");
  }

  const { vendorId, invoiceNumber, purchaseDate, notes, items } = req.body;

  if (!validId(vendorId)) {
    throw fail("A valid vendor is required.");
  }

  const normalizedItems = normalizeItems(items);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await client.query(
      "SELECT * FROM purchases WHERE id = $1 FOR UPDATE",
      [req.params.id]
    );

    if (!existing.rows.length) {
      throw fail("Purchase not found.", 404);
    }

    if (existing.rows[0].status !== "Draft") {
      throw fail("Only draft purchases can be edited.", 409);
    }

    const vendor = await client.query(
      "SELECT id, is_active FROM vendors WHERE id = $1 FOR SHARE",
      [vendorId]
    );

    if (!vendor.rows.length || !vendor.rows[0].is_active) {
      throw fail("Vendor does not exist or is inactive.");
    }

    await client.query(
      `UPDATE purchases
       SET vendor_id = $1,
           invoice_number = $2,
           purchase_date = COALESCE($3::date, purchase_date),
           notes = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [
        vendorId,
        invoiceNumber ? String(invoiceNumber).trim() : null,
        purchaseDate || null,
        notes ? String(notes).trim() : null,
        req.params.id,
      ]
    );

    await client.query(
      "DELETE FROM purchase_items WHERE purchase_id = $1",
      [req.params.id]
    );

    await insertItems(client, req.params.id, normalizedItems);

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Purchase draft updated successfully.",
    });
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      throw fail("Duplicate vendor invoice number.", 409);
    }

    throw error;
  } finally {
    client.release();
  }
});

const postPurchase = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) {
    throw fail("Invalid purchase ID.");
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const purchaseResult = await client.query(
      "SELECT * FROM purchases WHERE id = $1 FOR UPDATE",
      [req.params.id]
    );

    if (!purchaseResult.rows.length) {
      throw fail("Purchase not found.", 404);
    }

    const purchase = purchaseResult.rows[0];

    if (purchase.status !== "Draft") {
      throw fail("Only draft purchases can be posted.", 409);
    }

    const itemsResult = await client.query(
      `SELECT pi.*, p.is_active
       FROM purchase_items pi
       JOIN products p ON p.id = pi.product_id
       WHERE pi.purchase_id = $1
       ORDER BY pi.product_id
       FOR UPDATE OF p`,
      [req.params.id]
    );

    if (!itemsResult.rows.length) {
      throw fail("Cannot post a purchase without items.");
    }

    if (itemsResult.rows.some(item => !item.is_active)) {
      throw fail("Purchase contains an inactive product.");
    }

    for (const item of itemsResult.rows) {
      const ledgerNumber = `PUR-${purchase.id}-ITEM-${item.id}`;

      await client.query(
        `INSERT INTO stock_transactions
          (transaction_number, product_id, movement_type, quantity,
           unit_cost, vendor_id, reference_number, notes,
           occurred_at, created_by, purchase_item_id)
         VALUES ($1, $2, 'Stock In', $3, $4, $5, $6, $7,
                 NOW(), $8, $9)`,
        [
          ledgerNumber,
          item.product_id,
          item.quantity,
          item.unit_cost,
          purchase.vendor_id,
          purchase.invoice_number || purchase.purchase_number,
          item.notes || purchase.notes || null,
          currentUserId(req),
          item.id,
        ]
      );
    }

    const posted = await client.query(
      `UPDATE purchases
       SET status = 'Posted',
           posted_at = NOW(),
           posted_by = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [currentUserId(req), req.params.id]
    );

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Purchase posted and stock ledger updated successfully.",
      data: posted.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      throw fail("A duplicate ledger entry was prevented.", 409);
    }

    throw error;
  } finally {
    client.release();
  }
});

const cancelPurchase = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) {
    throw fail("Invalid purchase ID.");
  }

  const result = await pool.query(
    `UPDATE purchases
     SET status = 'Cancelled',
         updated_at = NOW()
     WHERE id = $1
       AND status = 'Draft'
     RETURNING id, purchase_number, status`,
    [req.params.id]
  );

  if (!result.rows.length) {
    throw fail(
      "Purchase not found or already posted. Posted purchases cannot be cancelled directly.",
      409
    );
  }

  res.json({
    success: true,
    message: "Draft purchase cancelled successfully.",
    data: result.rows[0],
  });
});

module.exports = {
  getPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchase,
  postPurchase,
  cancelPurchase,
};
