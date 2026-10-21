BEGIN;

-- Track the staff member for whom stock is issued.
ALTER TABLE inventory_requests
ADD COLUMN IF NOT EXISTS requested_for BIGINT
REFERENCES users(id);

-- Track the actual recipient on each stock ledger transaction.
ALTER TABLE stock_transactions
ADD COLUMN IF NOT EXISTS issued_to BIGINT
REFERENCES users(id);

CREATE INDEX IF NOT EXISTS inventory_requests_requested_for_idx
ON inventory_requests(requested_for);

CREATE INDEX IF NOT EXISTS stock_transactions_issued_to_created_at_idx
ON stock_transactions(issued_to, created_at);

COMMIT;