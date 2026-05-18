-- Pre-migration repair for intake POs 316–319: validation only by default.
-- Safe on production before new migrations run: fails fast if expected rows are missing or mismatched.
-- Add idempotent UPDATE statements below only if recon shows a pre-schema fix is required.

BEGIN;

DO $$
BEGIN
  IF (SELECT COUNT(*) FROM ecothrift.inventory_purchaseorder WHERE id IN (316, 317, 318, 319)) <> 4 THEN
    RAISE EXCEPTION 'repair_intake_pos_premigrate: expected exactly 4 target PO rows';
  END IF;
  IF EXISTS (SELECT 1 FROM ecothrift.inventory_purchaseorder WHERE id = 316 AND order_number IS DISTINCT FROM 'AMZ0N-OQL-CCP4') THEN
    RAISE EXCEPTION 'repair_intake_pos_premigrate: PO 316 order_number mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM ecothrift.inventory_purchaseorder WHERE id = 317 AND order_number IS DISTINCT FROM 'C5TC0-OM1-A8R3') THEN
    RAISE EXCEPTION 'repair_intake_pos_premigrate: PO 317 order_number mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM ecothrift.inventory_purchaseorder WHERE id = 318 AND order_number IS DISTINCT FROM 'TRGET-O4U-QP68') THEN
    RAISE EXCEPTION 'repair_intake_pos_premigrate: PO 318 order_number mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM ecothrift.inventory_purchaseorder WHERE id = 319 AND order_number IS DISTINCT FROM 'TRGET-O2R-1K40') THEN
    RAISE EXCEPTION 'repair_intake_pos_premigrate: PO 319 order_number mismatch';
  END IF;
END $$;

COMMIT;
