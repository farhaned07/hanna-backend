-- Migration: Add stripe_customer_id column to clinicians table
-- Required for Stripe webhook to link subscription events back to clinicians

ALTER TABLE clinicians ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
CREATE INDEX IF NOT EXISTS idx_clinicians_stripe_customer ON clinicians(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
