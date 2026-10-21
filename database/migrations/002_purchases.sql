
BEGIN;

-- 1. Purchase Header
CREATE TABLE IF NOT EXISTS purchases (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    purchase_number VARCHAR(60) NOT NULL UNIQUE,
    vendor_id BIGINT NOT NULL
        REFERENCES vendors(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(100),
    purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'Draft',
    posted_at TIMESTAMPTZ,
    posted_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT purchases_status_check
        CHECK (status IN ('Draft', 'Posted', 'Cancelled')),

    CONSTRAINT purchases_posting_details_check
        CHECK (
            (status = 'Posted' AND posted_at IS NOT NULL)
            OR
            (status <> 'Posted' AND posted_at IS NULL)
        )
);

-- Prevent duplicate invoice numbers for the same vendor
CREATE UNIQUE INDEX IF NOT EXISTS purchases_vendor_invoice_unique_idx
    ON purchases (vendor_id, LOWER(TRIM(invoice_number)))
    WHERE invoice_number IS NOT NULL
      AND TRIM(invoice_number) <> '';

CREATE INDEX IF NOT EXISTS purchases_vendor_id_idx
    ON purchases (vendor_id);

CREATE INDEX IF NOT EXISTS purchases_status_date_idx
    ON purchases (status, purchase_date DESC);


-- 2. Purchase Items
CREATE TABLE IF NOT EXISTS purchase_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    purchase_id BIGINT NOT NULL
        REFERENCES purchases(id) ON DELETE RESTRICT,
    product_id BIGINT NOT NULL
        REFERENCES products(id) ON DELETE RESTRICT,
    quantity NUMERIC(14,3) NOT NULL,
    unit_cost NUMERIC(14,2) NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT purchase_items_quantity_check
        CHECK (quantity > 0),

    CONSTRAINT purchase_items_unit_cost_check
        CHECK (unit_cost >= 0)
);

CREATE INDEX IF NOT EXISTS purchase_items_purchase_id_idx
    ON purchase_items (purchase_id);

CREATE INDEX IF NOT EXISTS purchase_items_product_id_idx
    ON purchase_items (product_id);


-- 3. Link purchase items to the EXISTING stock ledger
ALTER TABLE stock_transactions
    ADD COLUMN IF NOT EXISTS purchase_item_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'stock_transactions_purchase_item_fk'
          AND conrelid = 'stock_transactions'::regclass
    ) THEN
        ALTER TABLE stock_transactions
            ADD CONSTRAINT stock_transactions_purchase_item_fk
            FOREIGN KEY (purchase_item_id)
            REFERENCES purchase_items(id)
            ON DELETE RESTRICT;
    END IF;
END $$;

-- One purchase item can create only one ledger movement
CREATE UNIQUE INDEX IF NOT EXISTS stock_transactions_purchase_item_unique_idx
    ON stock_transactions (purchase_item_id)
    WHERE purchase_item_id IS NOT NULL;

-- Purchase-linked ledger entries must be Stock In
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'stock_transactions_purchase_movement_check'
          AND conrelid = 'stock_transactions'::regclass
    ) THEN
        ALTER TABLE stock_transactions
            ADD CONSTRAINT stock_transactions_purchase_movement_check
            CHECK (
                purchase_item_id IS NULL
                OR movement_type = 'Stock In'
            );
    END IF;
END $$;

COMMIT;
