
BEGIN;

-- 1. ROLES
CREATE TABLE IF NOT EXISTS roles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(30) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT roles_name_check
        CHECK (name IN ('Admin', 'HR', 'Staff'))
);

INSERT INTO roles (name)
VALUES ('Admin'), ('HR'), ('Staff')
ON CONFLICT (name) DO NOTHING;


-- 2. USERS
CREATE TABLE IF NOT EXISTS users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    role_id BIGINT NOT NULL REFERENCES roles(id),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    password_hash TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE UNIQUE INDEX IF NOT EXISTS users_phone_unique
ON users (phone)
WHERE phone IS NOT NULL;


-- 3. CLIENTS
CREATE TABLE IF NOT EXISTS clients (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(150),
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 4. CLIENT FILES / CASE FILES
CREATE TABLE IF NOT EXISTS files (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    file_number VARCHAR(80) NOT NULL UNIQUE,
    title VARCHAR(250) NOT NULL,
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'Active',
    opened_at DATE,
    closed_at DATE,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT files_status_check
        CHECK (status IN ('Active', 'Closed', 'Archived'))
);

CREATE INDEX IF NOT EXISTS files_client_id_idx
ON files(client_id);


-- 5. PRODUCT CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 6. PRODUCT BRANDS
CREATE TABLE IF NOT EXISTS brands (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 7. UNITS OF MEASUREMENT
CREATE TABLE IF NOT EXISTS units (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    abbreviation VARCHAR(15) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);


-- 8. VENDORS / SUPPLIERS
CREATE TABLE IF NOT EXISTS vendors (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vendor_code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    contact_person VARCHAR(150),
    email VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    tax_number VARCHAR(50),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- 9. PRODUCTS
CREATE TABLE IF NOT EXISTS products (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sku VARCHAR(80) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category_id BIGINT REFERENCES categories(id) ON DELETE RESTRICT,
    brand_id BIGINT REFERENCES brands(id) ON DELETE RESTRICT,
    unit_id BIGINT NOT NULL REFERENCES units(id) ON DELETE RESTRICT,
    reorder_level NUMERIC(14,3) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT products_reorder_level_check
        CHECK (reorder_level >= 0)
);

CREATE INDEX IF NOT EXISTS products_category_id_idx
ON products(category_id);

CREATE INDEX IF NOT EXISTS products_name_idx
ON products(name);


-- 10. INVENTORY REQUESTS / DEMANDS
CREATE TABLE IF NOT EXISTS inventory_requests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_number VARCHAR(50) NOT NULL UNIQUE,
    requested_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    client_id BIGINT REFERENCES clients(id) ON DELETE RESTRICT,
    file_id BIGINT REFERENCES files(id) ON DELETE RESTRICT,
    purpose TEXT NOT NULL,
    status VARCHAR(25) NOT NULL DEFAULT 'Pending',
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed_by BIGINT REFERENCES users(id) ON DELETE RESTRICT,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    completed_at TIMESTAMPTZ,
    CONSTRAINT inventory_requests_status_check
        CHECK (status IN (
            'Pending', 'Approved', 'Rejected',
            'Partially Issued', 'Completed', 'Cancelled'
        )),
    CONSTRAINT inventory_requests_file_client_check
        CHECK (file_id IS NULL OR client_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS inventory_requests_status_idx
ON inventory_requests(status);

CREATE INDEX IF NOT EXISTS inventory_requests_requested_by_idx
ON inventory_requests(requested_by);


-- 11. REQUEST ITEMS
CREATE TABLE IF NOT EXISTS inventory_request_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id BIGINT NOT NULL
        REFERENCES inventory_requests(id) ON DELETE RESTRICT,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity_requested NUMERIC(14,3) NOT NULL,
    quantity_approved NUMERIC(14,3),
    quantity_issued NUMERIC(14,3) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT request_quantity_check
        CHECK (quantity_requested > 0),
    CONSTRAINT approved_quantity_check
        CHECK (quantity_approved IS NULL OR
               (quantity_approved >= 0
                AND quantity_approved <= quantity_requested)),
    CONSTRAINT issued_quantity_check
        CHECK (quantity_issued >= 0
               AND quantity_issued <= quantity_requested),
    CONSTRAINT request_product_unique UNIQUE (request_id, product_id)
);

CREATE INDEX IF NOT EXISTS request_items_product_id_idx
ON inventory_request_items(product_id);


-- 12. APPROVAL HISTORY
CREATE TABLE IF NOT EXISTS request_approvals (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id BIGINT NOT NULL
        REFERENCES inventory_requests(id) ON DELETE RESTRICT,
    action VARCHAR(20) NOT NULL,
    acted_by BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    comments TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT request_approval_action_check
        CHECK (action IN ('Approved', 'Rejected', 'Cancelled'))
);

CREATE INDEX IF NOT EXISTS request_approvals_request_id_idx
ON request_approvals(request_id);


-- 13. STOCK LEDGER
-- Every receipt, issue, return and adjustment is recorded here.
-- Quantity is always positive; movement_type determines stock direction.
CREATE TABLE IF NOT EXISTS stock_transactions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    transaction_number VARCHAR(60) NOT NULL UNIQUE,
    product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    movement_type VARCHAR(20) NOT NULL,
    quantity NUMERIC(14,3) NOT NULL,
    unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
    vendor_id BIGINT REFERENCES vendors(id) ON DELETE RESTRICT,
    client_id BIGINT REFERENCES clients(id) ON DELETE RESTRICT,
    file_id BIGINT REFERENCES files(id) ON DELETE RESTRICT,
    request_item_id BIGINT
        REFERENCES inventory_request_items(id) ON DELETE RESTRICT,
    reference_number VARCHAR(100),
    notes TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT stock_movement_type_check
        CHECK (movement_type IN (
            'Opening', 'Stock In', 'Stock Out',
            'Adjustment In', 'Adjustment Out',
            'Return In', 'Return Out'
        )),
    CONSTRAINT stock_quantity_check CHECK (quantity > 0),
    CONSTRAINT stock_unit_cost_check CHECK (unit_cost >= 0),
    CONSTRAINT stock_file_client_check
        CHECK (file_id IS NULL OR client_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS stock_transactions_product_date_idx
ON stock_transactions(product_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS stock_transactions_client_date_idx
ON stock_transactions(client_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS stock_transactions_file_date_idx
ON stock_transactions(file_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS stock_transactions_type_idx
ON stock_transactions(movement_type);


-- 14. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx
ON audit_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
ON audit_logs(entity_type, entity_id);


-- 15. LIVE STOCK BALANCE VIEW
-- INCREASE: Opening, Stock In, Adjustment In, Return In
-- DECREASE: Stock Out, Adjustment Out, Return Out
CREATE OR REPLACE VIEW inventory_stock_balances AS
SELECT
    p.id AS product_id,
    p.sku,
    p.name AS product_name,
    p.unit_id,
    p.reorder_level,
    COALESCE(
        SUM(
            CASE
                WHEN st.movement_type IN (
                    'Opening', 'Stock In',
                    'Adjustment In', 'Return In'
                ) THEN st.quantity
                WHEN st.movement_type IN (
                    'Stock Out', 'Adjustment Out', 'Return Out'
                ) THEN -st.quantity
                ELSE 0
            END
        ), 0
    ) AS current_stock,
    COALESCE(
        SUM(
            CASE
                WHEN st.movement_type IN (
                    'Opening', 'Stock In',
                    'Adjustment In', 'Return In'
                ) THEN st.quantity * st.unit_cost
                WHEN st.movement_type IN (
                    'Stock Out', 'Adjustment Out', 'Return Out'
                ) THEN -(st.quantity * st.unit_cost)
                ELSE 0
            END
        ), 0
    ) AS stock_value
FROM products p
LEFT JOIN stock_transactions st ON st.product_id = p.id
GROUP BY
    p.id, p.sku, p.name, p.unit_id, p.reorder_level;


-- 16. LOW STOCK VIEW
CREATE OR REPLACE VIEW inventory_low_stock AS
SELECT *
FROM inventory_stock_balances
WHERE current_stock <= reorder_level;


COMMIT;
