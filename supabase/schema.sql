-- ============================================================================
-- BHAI JEWELLERS UK - SUPABASE DATABASE SCHEMA, INDEXING & SEED DATA
-- Project: https://ydsjutiavwxycgezdjti.supabase.co
-- ============================================================================

-- 1. BULLION PRODUCTS TABLE (Gold & Silver Bars and Coins)
CREATE TABLE IF NOT EXISTS public.bullion_products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  metal TEXT NOT NULL CHECK (metal IN ('gold', 'silver')),
  weight_grams NUMERIC(12, 4) NOT NULL,
  purity TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('bar', 'coin')),
  premium_percentage NUMERIC(8, 5) NOT NULL DEFAULT 0.05,
  custom_price_override NUMERIC(12, 2),
  price_mode TEXT NOT NULL DEFAULT 'auto' CHECK (price_mode IN ('auto', 'fixed')),
  image_url TEXT NOT NULL,
  refiner TEXT NOT NULL,
  badge TEXT,
  perk TEXT,
  vat_status TEXT,
  button_text TEXT DEFAULT 'Inquire / Lock Price',
  popular BOOLEAN NOT NULL DEFAULT false,
  in_stock BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. HIGH-PERFORMANCE DATABASE INDEXES FOR FAST QUERIES & FILTERING
CREATE INDEX IF NOT EXISTS idx_bullion_metal ON public.bullion_products (metal);
CREATE INDEX IF NOT EXISTS idx_bullion_type ON public.bullion_products (type);
CREATE INDEX IF NOT EXISTS idx_bullion_popular ON public.bullion_products (popular) WHERE popular = true;
CREATE INDEX IF NOT EXISTS idx_bullion_in_stock ON public.bullion_products (in_stock);
CREATE INDEX IF NOT EXISTS idx_bullion_metal_type_sort ON public.bullion_products (metal, type, sort_order ASC);

-- 3. SITE CONTENT TABLE (Sliders, Contact, Find Us, Privacy Policy)
CREATE TABLE IF NOT EXISTS public.site_content (
  id TEXT PRIMARY KEY DEFAULT 'main',
  content JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. ADMIN SETTINGS & PASSWORD TABLE
CREATE TABLE IF NOT EXISTS public.admin_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  password_hash TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE public.bullion_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Public read access for products and site content
DROP POLICY IF EXISTS "Allow public read on bullion_products" ON public.bullion_products;
CREATE POLICY "Allow public read on bullion_products"
  ON public.bullion_products FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow public read on site_content" ON public.site_content;
CREATE POLICY "Allow public read on site_content"
  ON public.site_content FOR SELECT
  USING (true);

-- 6. SEED DEFAULT ADMIN PASSWORD ('bhaijew90' SHA-256 salted hash)
INSERT INTO public.admin_settings (id, password_hash, updated_at)
VALUES (
  'default',
  encode(digest('bhai_salt_v1:bhaijew90', 'sha256'), 'hex'),
  NOW()
)
ON CONFLICT (id) DO NOTHING;

-- 7. SEED ALL GOLD & SILVER BULLION PRODUCTS (23 Gold + 14 Silver = 37 Products)
INSERT INTO public.bullion_products (
  id, name, metal, weight_grams, purity, type, premium_percentage,
  price_mode, image_url, refiner, badge, perk, vat_status, button_text, popular, in_stock, sort_order
) VALUES
  -- GOLD BARS & COINS
  ('1g-bar', '1 Gram Minted Gold Bar', 'gold', 1, '999.9 (24K)', 'bar', 0.12, 'auto', '/bullion/gold-bar-1g.webp', 'PAMP Suisse / Metalor', 'LBMA Good Delivery', 'Free Vault Storage', '0% VAT Exempt', 'Inquire / Lock Price', false, true, 1),
  ('2.5g-bar', '2.5 Gram Minted Gold Bar', 'gold', 2.5, '999.9 (24K)', 'bar', 0.09, 'auto', '/bullion/gold-bar-2.5g.webp', 'PAMP Suisse / Valcambi', 'LBMA Good Delivery', 'Free Vault Storage', '0% VAT Exempt', 'Inquire / Lock Price', false, true, 2),
  ('5g-bar', '5 Gram Minted Gold Bar', 'gold', 5, '999.9 (24K)', 'bar', 0.07, 'auto', '/bullion/gold-bar-5g.webp', 'PAMP Suisse / Umicore', 'LBMA Good Delivery', 'Free Vault Storage', '0% VAT Exempt', 'Inquire / Lock Price', false, true, 3),
  ('10g-bar', '10 Gram Minted Gold Bar', 'gold', 10, '999.9 (24K)', 'bar', 0.05, 'auto', '/bullion/gold-bar-10g.webp', 'PAMP Fortuna Sealed', 'LBMA Good Delivery', 'Free Vault Storage', '0% VAT Exempt', 'Inquire / Lock Price', true, true, 4),
  ('20g-bar', '20 Gram Minted Gold Bar', 'gold', 20, '999.9 (24K)', 'bar', 0.04, 'auto', '/bullion/gold-bar-20g.webp', 'Metalor / Heraeus', 'LBMA Good Delivery', 'Free Vault Storage', '0% VAT Exempt', 'Inquire / Lock Price', false, true, 5),
  ('1tola-bar', '1 Tola (11.66g) Minted Gold Bar', 'gold', 11.6638, '999.9 (24K)', 'bar', 0.045, 'auto', '/bullion/gold-bar-tola.webp', 'Certified Traditional Tola', 'LBMA Good Delivery', 'Free Vault Storage', '0% VAT Exempt', 'Inquire / Lock Price', true, true, 6),
  ('1oz-bar', '1 oz Minted Gold Bar', 'gold', 31.1035, '999.9 (24K)', 'bar', 0.035, 'auto', '/bullion/gold-bar-1oz.webp', 'The Royal Mint / PAMP', 'LBMA Good Delivery', 'Free Vault Storage', '0% VAT Exempt', 'Inquire / Lock Price', true, true, 7),
  ('50g-bar', '50 Gram Cast Gold Bar', 'gold', 50, '999.9 (24K)', 'bar', 0.03, 'auto', '/bullion/gold-bar-50g.webp', 'Metalor / Umicore', 'LBMA Good Delivery', 'Free Vault Storage', '0% VAT Exempt', 'Inquire / Lock Price', false, true, 8),
  ('100g-bar', '100 Gram Investment Gold Bar', 'gold', 100, '999.9 (24K)', 'bar', 0.025, 'auto', '/bullion/gold-bar-100g.webp', 'Metalor / Umicore / PAMP', 'LBMA Good Delivery', 'Free Vault Storage', '0% VAT Exempt', 'Inquire / Lock Price', true, true, 9),
  ('250g-bar', '250 Gram Cast Gold Bar', 'gold', 250, '999.9 (24K)', 'bar', 0.022, 'auto', '/bullion/gold-bar-250g.webp', 'LBMA Certified Refiner', 'LBMA Good Delivery', 'Free Vault Storage', '0% VAT Exempt', 'Inquire / Lock Price', false, true, 10),
  ('500g-bar', '500 Gram Cast Gold Bar', 'gold', 500, '999.9 (24K)', 'bar', 0.02, 'auto', '/bullion/gold-bar-500g.webp', 'LBMA Certified Refiner', 'LBMA Good Delivery', 'Free Vault Storage', '0% VAT Exempt', 'Inquire / Lock Price', false, true, 11),
  ('1kg-bar', '1 Kilo (1,000g) Investment Gold Bar', 'gold', 1000, '999.9 (24K)', 'bar', 0.018, 'auto', '/bullion/gold-bar-1kg.webp', 'LBMA Good Delivery Refiner', 'LBMA Good Delivery', 'Free Vault Storage', '0% VAT Exempt', 'Inquire / Lock Price', true, true, 12),
  ('sov-full', 'Full Gold Sovereign Coin', 'gold', 7.988, '916.7 (22K)', 'coin', 0.05, 'auto', '/bullion/gold-coin-sovereign.webp', 'The Royal Mint (CGT Free)', 'The Royal Mint', 'CGT Free (Capital Gains Tax)', '0% VAT Exempt', 'Inquire / Lock Price', true, true, 13),
  ('sov-half', 'Half Gold Sovereign Coin', 'gold', 3.99, '916.7 (22K)', 'coin', 0.065, 'auto', '/bullion/gold-coin-half-sovereign.webp', 'The Royal Mint (CGT Free)', 'The Royal Mint', 'CGT Free (Capital Gains Tax)', '0% VAT Exempt', 'Inquire / Lock Price', false, true, 14),
  ('sov-double', 'Double Sovereign Gold Coin', 'gold', 15.98, '916.7 (22K)', 'coin', 0.045, 'auto', '/bullion/gold-coin-double-sovereign.webp', 'The Royal Mint (CGT Free)', 'The Royal Mint', 'CGT Free (Capital Gains Tax)', '0% VAT Exempt', 'Inquire / Lock Price', false, true, 15),
  ('brit-1oz', '1 oz Gold Britannia Coin', 'gold', 31.1035, '999.9 (24K)', 'coin', 0.035, 'auto', '/bullion/gold-coin-britannia.webp', 'The Royal Mint (CGT Free)', 'The Royal Mint', 'CGT Free (Capital Gains Tax)', '0% VAT Exempt', 'Inquire / Lock Price', true, true, 16),
  ('brit-half', '1/2 oz Gold Britannia Coin', 'gold', 15.55, '999.9 (24K)', 'coin', 0.045, 'auto', '/bullion/gold-coin-half-britannia.webp', 'The Royal Mint (CGT Free)', 'The Royal Mint', 'CGT Free (Capital Gains Tax)', '0% VAT Exempt', 'Inquire / Lock Price', false, true, 17),
  ('brit-quarter', '1/4 oz Gold Britannia Coin', 'gold', 7.78, '999.9 (24K)', 'coin', 0.06, 'auto', '/bullion/gold-coin-quarter-britannia.webp', 'The Royal Mint (CGT Free)', 'The Royal Mint', 'CGT Free (Capital Gains Tax)', '0% VAT Exempt', 'Inquire / Lock Price', false, true, 18),
  ('brit-tenth', '1/10 oz Gold Britannia Coin', 'gold', 3.11, '999.9 (24K)', 'coin', 0.08, 'auto', '/bullion/gold-coin-tenth-britannia.webp', 'The Royal Mint (CGT Free)', 'The Royal Mint', 'CGT Free (Capital Gains Tax)', '0% VAT Exempt', 'Inquire / Lock Price', false, true, 19),
  ('krug-1oz', '1 oz South African Krugerrand', 'gold', 33.93, '916.7 (22K)', 'coin', 0.04, 'auto', '/bullion/gold-coin-krugerrand.webp', 'Rand Refinery (1oz Pure)', 'Rand Refinery', 'Legal Tender 1oz Gold', '0% VAT Exempt', 'Inquire / Lock Price', true, true, 20),
  ('maple-1oz', '1 oz Canadian Maple Leaf Gold Coin', 'gold', 31.1035, '999.9 (24K)', 'coin', 0.038, 'auto', '/bullion/gold-coin-maple.webp', 'Royal Canadian Mint', 'Royal Canadian Mint', '99.99% Pure Gold Bullion', '0% VAT Exempt', 'Inquire / Lock Price', true, true, 21),
  ('eagle-1oz', '1 oz American Eagle Gold Coin', 'gold', 33.93, '916.7 (22K)', 'coin', 0.045, 'auto', '/bullion/gold-coin-eagle.webp', 'United States Mint (1oz Pure)', 'United States Mint', 'Guaranteed US Mint Weight', '0% VAT Exempt', 'Inquire / Lock Price', false, true, 22),
  ('phil-1oz', '1 oz Austrian Philharmonic Gold Coin', 'gold', 31.1035, '999.9 (24K)', 'coin', 0.038, 'auto', '/bullion/gold-coin-philharmonic.webp', 'Austrian Mint (Münze Österreich)', 'Austrian Mint', 'European Pure 24K Coin', '0% VAT Exempt', 'Inquire / Lock Price', false, true, 23),

  -- SILVER BARS & COINS
  ('1oz-silver-bar', '1 oz Minted Silver Bar', 'silver', 31.1035, '999 Fine Silver', 'bar', 0.16, 'auto', '/bullion/silver-bar-1oz.webp', 'PAMP / Metalor', 'LBMA Good Delivery', 'Secure Delivery', '20% VAT Rate', 'Inquire / Lock Price', false, true, 1001),
  ('50g-silver-bar', '50 Gram Minted Silver Bar', 'silver', 50, '999 Fine Silver', 'bar', 0.15, 'auto', '/bullion/silver-bar-50g.webp', 'PAMP Suisse / Umicore', 'LBMA Good Delivery', 'Secure Delivery', '20% VAT Rate', 'Inquire / Lock Price', false, true, 1002),
  ('100g-silver-bar', '100 Gram Minted Silver Bar', 'silver', 100, '999 Fine Silver', 'bar', 0.14, 'auto', '/bullion/silver-bar-100g.webp', 'Umicore / Heraeus', 'LBMA Good Delivery', 'Secure Delivery', '20% VAT Rate', 'Inquire / Lock Price', true, true, 1003),
  ('250g-silver-bar', '250 Gram Cast Silver Bar', 'silver', 250, '999 Fine Silver', 'bar', 0.12, 'auto', '/bullion/silver-bar-250g.webp', 'Nadir / Metalor', 'LBMA Certified Refiner', 'Secure Delivery', '20% VAT Rate', 'Inquire / Lock Price', true, true, 1004),
  ('500g-silver-bar', '500 Gram Cast Silver Bar', 'silver', 500, '999 Fine Silver', 'bar', 0.10, 'auto', '/bullion/silver-bar-500g.webp', 'Metalor / Umicore', 'LBMA Certified Refiner', 'Secure Delivery', '20% VAT Rate', 'Inquire / Lock Price', false, true, 1005),
  ('10oz-silver-bar', '10 oz Cast Silver Bar', 'silver', 311.035, '999 Fine Silver', 'bar', 0.09, 'auto', '/bullion/silver-bar-10oz.webp', 'The Royal Mint / Metalor', 'The Royal Mint', 'Secure Delivery', '20% VAT Rate', 'Inquire / Lock Price', false, true, 1006),
  ('1kg-silver-bar', '1 Kilo (1,000g) Cast Silver Bar', 'silver', 1000, '999 Fine Silver', 'bar', 0.085, 'auto', '/bullion/silver-bar-1kg.webp', 'LBMA Certified 1kg Bar', 'LBMA Certified 1kg Bar', 'Secure Delivery', '20% VAT Rate', 'Inquire / Lock Price', true, true, 1007),
  ('5kg-silver-bar', '5 Kilo (5,000g) Cast Silver Bar', 'silver', 5000, '999 Fine Silver', 'bar', 0.075, 'auto', '/bullion/silver-bar-5kg.webp', 'Umicore / LBMA Refiners', 'LBMA Good Delivery', 'Secure Delivery', '20% VAT Rate', 'Inquire / Lock Price', false, true, 1008),
  ('brit-silver-1oz', '1 oz Silver Britannia Coin', 'silver', 31.1035, '999 Fine Silver', 'coin', 0.18, 'auto', '/bullion/silver-coin-britannia.webp', 'The Royal Mint (CGT Free)', 'The Royal Mint', 'CGT Free (Capital Gains Tax)', '20% VAT Rate', 'Inquire / Lock Price', true, true, 1009),
  ('maple-silver-1oz', '1 oz Canadian Silver Maple Leaf', 'silver', 31.1035, '999.9 Fine Silver', 'coin', 0.18, 'auto', '/bullion/silver-coin-maple.webp', 'Royal Canadian Mint', 'Royal Canadian Mint', '99.99% Pure Silver', '20% VAT Rate', 'Inquire / Lock Price', true, true, 1010),
  ('eagle-silver-1oz', '1 oz American Silver Eagle', 'silver', 31.1035, '999 Fine Silver', 'coin', 0.20, 'auto', '/bullion/silver-coin-eagle.webp', 'United States Mint', 'United States Mint', 'Official US Mint Bullion', '20% VAT Rate', 'Inquire / Lock Price', false, true, 1011),
  ('krug-silver-1oz', '1 oz South African Silver Krugerrand', 'silver', 31.1035, '999 Fine Silver', 'coin', 0.17, 'auto', '/bullion/silver-coin-krugerrand.webp', 'Rand Refinery', 'Rand Refinery', '1oz Fine Silver Coin', '20% VAT Rate', 'Inquire / Lock Price', false, true, 1012),
  ('phil-silver-1oz', '1 oz Austrian Silver Philharmonic', 'silver', 31.1035, '999 Fine Silver', 'coin', 0.17, 'auto', '/bullion/silver-coin-philharmonic.webp', 'Austrian Mint', 'Austrian Mint', 'European Silver Bullion', '20% VAT Rate', 'Inquire / Lock Price', false, true, 1013),
  ('kang-silver-1oz', '1 oz Australian Silver Kangaroo', 'silver', 31.1035, '999.9 Fine Silver', 'coin', 0.18, 'auto', '/bullion/silver-coin-kangaroo.webp', 'The Perth Mint', 'The Perth Mint', 'Perth Mint Certified Silver', '20% VAT Rate', 'Inquire / Lock Price', true, true, 1014)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  metal = EXCLUDED.metal,
  weight_grams = EXCLUDED.weight_grams,
  purity = EXCLUDED.purity,
  type = EXCLUDED.type,
  premium_percentage = EXCLUDED.premium_percentage,
  image_url = EXCLUDED.image_url,
  refiner = EXCLUDED.refiner,
  badge = EXCLUDED.badge,
  perk = EXCLUDED.perk,
  vat_status = EXCLUDED.vat_status,
  popular = EXCLUDED.popular,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- ============================================================================
-- 8. HISTORICAL GOLD & SILVER SPOT RATES TABLE & INDEXING
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.rate_history (
  date_key DATE PRIMARY KEY,
  gold_gbp_per_gram NUMERIC(10, 2) NOT NULL,
  silver_gbp_per_gram NUMERIC(10, 2) NOT NULL,
  gold_ounce_gbp NUMERIC(12, 2) NOT NULL,
  silver_ounce_gbp NUMERIC(12, 2) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_history_date ON public.rate_history (date_key DESC);

ALTER TABLE public.rate_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read on rate_history" ON public.rate_history;
CREATE POLICY "Allow public read on rate_history"
  ON public.rate_history FOR SELECT
  USING (true);

-- ============================================================================
-- 9. VIP SHOWROOM APPOINTMENTS TABLE & INDEXING
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.appointments (
  id TEXT PRIMARY KEY,
  reference_code TEXT NOT NULL UNIQUE,
  client_name TEXT NOT NULL,
  client_phone TEXT NOT NULL,
  client_email TEXT,
  service_type TEXT NOT NULL,
  preferred_date TEXT NOT NULL,
  preferred_time TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments (status);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments (preferred_date ASC);
CREATE INDEX IF NOT EXISTS idx_appointments_created ON public.appointments (created_at DESC);

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;


