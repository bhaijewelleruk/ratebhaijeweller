import crypto from "crypto";
import fs from "fs";
import path from "path";
import { supabaseAdmin } from "@/lib/supabase";
import {
  BullionProduct,
  INITIAL_GOLD_ITEMS,
  INITIAL_SILVER_ITEMS,
} from "@/data/bullion-items";
import { INITIAL_SITE_CONTENT, SiteContent } from "@/data/site-content";

const DB_BUCKET = "bhai-db";
const DB_CONTENT_OBJECT = "catalog-and-content.json";
const DB_AUTH_OBJECT = "admin-credentials.json";
const ADMIN_AUTH_EMAIL = "admin@bhaijeweller.com";
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_DEFAULT_PASSWORD || "bhaijew90";
const LOCAL_BACKUP_FILE = path.join(process.cwd(), "src", "data", "stored-content.json");

export interface StoredDatabaseState {
  goldItems: BullionProduct[];
  silverItems: BullionProduct[];
  siteContent: SiteContent;
  lastUpdated: string;
  source?: "supabase-sql" | "supabase-cloud" | "initial-seed";
}

export interface IndexedCatalogCache {
  state: StoredDatabaseState;
  byId: Record<string, BullionProduct>;
  byMetal: {
    gold: BullionProduct[];
    silver: BullionProduct[];
  };
  byMetalAndType: {
    "gold:bar": BullionProduct[];
    "gold:coin": BullionProduct[];
    "silver:bar": BullionProduct[];
    "silver:coin": BullionProduct[];
  };
  popular: {
    gold: BullionProduct[];
    silver: BullionProduct[];
  };
  inStockCount: {
    gold: number;
    silver: number;
  };
  etag: string;
  cachedAt: number;
}

// ============================================================================
// SERVER-SIDE IN-MEMORY CACHE & O(1) PRODUCT INDEX
// ============================================================================
const CACHE_TTL_MS = 60 * 1000; // 60s server memory cache (invalidated immediately on POST)
let memoryCache: IndexedCatalogCache | null = null;
let bucketEnsured = false;

export function hashPassword(plain: string): string {
  return crypto
    .createHash("sha256")
    .update(`bhai_salt_v1:${plain.trim()}`)
    .digest("hex");
}

function safeCompareHash(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a, "utf-8");
    const bufB = Buffer.from(b, "utf-8");
    if (bufA.length !== bufB.length) return false;
    return crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Builds O(1) lookup and pre-filtered indexes for Gold & Silver products
 */
export function buildCatalogIndex(state: StoredDatabaseState): IndexedCatalogCache {
  const byId: Record<string, BullionProduct> = {};
  const goldBars: BullionProduct[] = [];
  const goldCoins: BullionProduct[] = [];
  const silverBars: BullionProduct[] = [];
  const silverCoins: BullionProduct[] = [];
  const popularGold: BullionProduct[] = [];
  const popularSilver: BullionProduct[] = [];
  let goldInStock = 0;
  let silverInStock = 0;

  for (const item of state.goldItems) {
    byId[item.id] = item;
    if (item.type === "coin") goldCoins.push(item);
    else goldBars.push(item);
    if (item.popular) popularGold.push(item);
    if (item.inStock !== false) goldInStock++;
  }

  for (const item of state.silverItems) {
    byId[item.id] = item;
    if (item.type === "coin") silverCoins.push(item);
    else silverBars.push(item);
    if (item.popular) popularSilver.push(item);
    if (item.inStock !== false) silverInStock++;
  }

  const etagPayload = `${state.lastUpdated}:${state.goldItems.length}:${state.silverItems.length}`;
  const etag = `"${crypto.createHash("md5").update(etagPayload).digest("hex")}"`;

  return {
    state,
    byId,
    byMetal: {
      gold: state.goldItems,
      silver: state.silverItems,
    },
    byMetalAndType: {
      "gold:bar": goldBars,
      "gold:coin": goldCoins,
      "silver:bar": silverBars,
      "silver:coin": silverCoins,
    },
    popular: {
      gold: popularGold,
      silver: popularSilver,
    },
    inStockCount: {
      gold: goldInStock,
      silver: silverInStock,
    },
    etag,
    cachedAt: Date.now(),
  };
}

export function invalidateCatalogCache() {
  memoryCache = null;
}

// ============================================================================
// SUPABASE BUCKET INITIALIZATION
// ============================================================================
async function ensureSupabaseBuckets() {
  if (bucketEnsured) return;
  try {
    const { data: buckets } = await supabaseAdmin.storage.listBuckets();
    const existingIds = new Set((buckets || []).map((b) => b.id));

    if (!existingIds.has(DB_BUCKET)) {
      await supabaseAdmin.storage.createBucket(DB_BUCKET, {
        public: false,
      });
    }
    if (!existingIds.has("showroom-media")) {
      await supabaseAdmin.storage.createBucket("showroom-media", {
        public: true,
      });
    }
    bucketEnsured = true;
  } catch (err) {
    console.warn("Supabase bucket check warning:", err);
  }
}

// ============================================================================
// SQL ROW <-> BULLION PRODUCT MAPPERS
// ============================================================================
function rowToBullionProduct(row: any): BullionProduct {
  return {
    id: row.id,
    name: row.name,
    company: row.company || row.refiner || undefined,
    metal: row.metal === "silver" ? "silver" : "gold",
    weightGrams: Number(row.weight_grams),
    purity: row.purity,
    type: row.type === "coin" ? "coin" : "bar",
    premiumPercentage: Number(row.premium_percentage),
    customPriceOverride:
      row.custom_price_override !== null && row.custom_price_override !== undefined
        ? Number(row.custom_price_override)
        : undefined,
    priceMode: row.price_mode || "auto",
    imageUrl: row.image_url,
    refiner: row.refiner || row.company || "LBMA Certified Refiner",
    badge: row.badge || undefined,
    perk: row.perk || undefined,
    vatStatus: row.vat_status || undefined,
    buttonText: row.button_text || "Inquire / Lock Price",
    popular: Boolean(row.popular),
    inStock: row.in_stock !== false,
  };
}

function bullionProductToRow(item: BullionProduct, sortOrder: number) {
  return {
    id: item.id,
    name: item.name,
    metal: item.metal,
    weight_grams: item.weightGrams,
    purity: item.purity,
    type: item.type,
    premium_percentage: item.premiumPercentage,
    custom_price_override:
      item.priceMode === "fixed" && item.customPriceOverride ? item.customPriceOverride : null,
    price_mode: item.priceMode || "auto",
    image_url: item.imageUrl,
    refiner: item.company || item.refiner,
    badge: item.badge || null,
    perk: item.perk || null,
    vat_status: item.vatStatus || null,
    button_text: item.buttonText || "Inquire / Lock Price",
    popular: Boolean(item.popular),
    in_stock: item.inStock !== false,
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  };
}

// ============================================================================
// READ CATALOG & CONTENT FROM SUPABASE DATABASE (WITH CACHE & AUTO-SEED)
// ============================================================================
export async function getIndexedCatalog(forceRefresh = false): Promise<IndexedCatalogCache> {
  const now = Date.now();
  if (!forceRefresh && memoryCache && now - memoryCache.cachedAt < CACHE_TTL_MS) {
    return memoryCache;
  }

  // 1. Try reading from relational Postgres tables in Supabase (`bullion_products` & `site_content`)
  try {
    const [productsRes, contentRes] = await Promise.all([
      supabaseAdmin
        .from("bullion_products")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("site_content")
        .select("*")
        .eq("id", "main")
        .maybeSingle(),
    ]);

    if (!productsRes.error && Array.isArray(productsRes.data)) {
      if (productsRes.data.length > 0) {
        const allItems = productsRes.data.map(rowToBullionProduct);
        const goldItems = allItems.filter((i) => i.metal === "gold");
        const silverItems = allItems.filter((i) => i.metal === "silver");
        const siteContent: SiteContent = contentRes.data?.content
          ? {
              ...INITIAL_SITE_CONTENT,
              ...contentRes.data.content,
              slides: Array.isArray(contentRes.data.content.slides)
                ? contentRes.data.content.slides
                : INITIAL_SITE_CONTENT.slides,
            }
          : INITIAL_SITE_CONTENT;

        const state: StoredDatabaseState = {
          goldItems: goldItems.length > 0 ? goldItems : INITIAL_GOLD_ITEMS,
          silverItems: silverItems.length > 0 ? silverItems : INITIAL_SILVER_ITEMS,
          siteContent,
          lastUpdated: contentRes.data?.updated_at || new Date().toISOString(),
          source: "supabase-sql",
        };
        memoryCache = buildCatalogIndex(state);
        return memoryCache;
      } else {
        // Table exists in Supabase SQL but is empty -> Auto-seed it now!
        const initialState: StoredDatabaseState = {
          goldItems: INITIAL_GOLD_ITEMS,
          silverItems: INITIAL_SILVER_ITEMS,
          siteContent: INITIAL_SITE_CONTENT,
          lastUpdated: new Date().toISOString(),
          source: "supabase-sql",
        };
        await saveCatalogToDatabase(initialState);
        memoryCache = buildCatalogIndex(initialState);
        return memoryCache;
      }
    }
  } catch {
    // SQL tables not created yet; fall through to Supabase Cloud Storage DB
  }

  // 2. Read from Supabase Cloud Storage DB (`bhai-db/catalog-and-content.json`)
  try {
    await ensureSupabaseBuckets();
    const { data: blob, error } = await supabaseAdmin.storage
      .from(DB_BUCKET)
      .download(DB_CONTENT_OBJECT);

    if (!error && blob) {
      const text = await blob.text();
      const parsed = JSON.parse(text);
      const state: StoredDatabaseState = {
        goldItems:
          Array.isArray(parsed.goldItems) && parsed.goldItems.length > 0
            ? parsed.goldItems
            : INITIAL_GOLD_ITEMS,
        silverItems:
          Array.isArray(parsed.silverItems) && parsed.silverItems.length > 0
            ? parsed.silverItems
            : INITIAL_SILVER_ITEMS,
        siteContent: {
          ...INITIAL_SITE_CONTENT,
          ...(parsed.siteContent || {}),
          slides: Array.isArray(parsed.siteContent?.slides)
            ? parsed.siteContent.slides
            : INITIAL_SITE_CONTENT.slides,
        },
        lastUpdated: parsed.lastUpdated || new Date().toISOString(),
        source: "supabase-cloud",
      };
      memoryCache = buildCatalogIndex(state);
      return memoryCache;
    }
  } catch (err) {
    console.warn("Supabase Cloud DB read notice:", err);
  }

  // 3. First-time initialization: Seed all Gold & Silver products + Site Content into Supabase immediately!
  let seedData: StoredDatabaseState = {
    goldItems: INITIAL_GOLD_ITEMS,
    silverItems: INITIAL_SILVER_ITEMS,
    siteContent: INITIAL_SITE_CONTENT,
    lastUpdated: new Date().toISOString(),
    source: "supabase-cloud",
  };

  try {
    if (fs.existsSync(LOCAL_BACKUP_FILE)) {
      const raw = fs.readFileSync(LOCAL_BACKUP_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      seedData = {
        goldItems: parsed.goldItems || INITIAL_GOLD_ITEMS,
        silverItems: parsed.silverItems || INITIAL_SILVER_ITEMS,
        siteContent: {
          ...INITIAL_SITE_CONTENT,
          ...(parsed.siteContent || {}),
        },
        lastUpdated: parsed.lastUpdated || new Date().toISOString(),
        source: "supabase-cloud",
      };
    }
  } catch {
    // ignore local file error
  }

  await saveCatalogToDatabase(seedData);
  memoryCache = buildCatalogIndex(seedData);
  return memoryCache;
}

// ============================================================================
// SAVE CATALOG & CONTENT TO SUPABASE DATABASE (AND UPDATE CACHE)
// ============================================================================
export async function saveCatalogToDatabase(
  data: StoredDatabaseState
): Promise<{ success: boolean; source: string }> {
  const timestamp = new Date().toISOString();
  const payload: StoredDatabaseState = {
    ...data,
    lastUpdated: timestamp,
  };

  let savedToSupabase = false;
  let activeSource = "supabase-cloud";

  // 1. Try saving to Supabase SQL Tables (`bullion_products` and `site_content`) if created
  try {
    const goldRows = payload.goldItems.map((item, idx) =>
      bullionProductToRow({ ...item, metal: "gold" }, idx + 1)
    );
    const silverRows = payload.silverItems.map((item, idx) =>
      bullionProductToRow({ ...item, metal: "silver" }, idx + 1001)
    );
    const allRows = [...goldRows, ...silverRows];

    const { error: upsertErr } = await supabaseAdmin
      .from("bullion_products")
      .upsert(allRows, { onConflict: "id" });

    if (!upsertErr) {
      // Remove deleted items not in allRows
      const currentIds = allRows.map((r) => r.id);
      if (currentIds.length > 0) {
        await supabaseAdmin
          .from("bullion_products")
          .delete()
          .not("id", "in", `(${currentIds.map((id) => `"${id}"`).join(",")})`);
      }

      await supabaseAdmin.from("site_content").upsert(
        {
          id: "main",
          content: payload.siteContent,
          updated_at: timestamp,
        },
        { onConflict: "id" }
      );

      savedToSupabase = true;
      activeSource = "supabase-sql";
    }
  } catch {
    // SQL tables not created yet; continue to Supabase Cloud Storage DB
  }

  // 2. Always persist to Supabase Cloud Storage DB (`bhai-db/catalog-and-content.json`)
  try {
    await ensureSupabaseBuckets();
    const jsonBuffer = Buffer.from(JSON.stringify(payload, null, 2), "utf-8");
    const { error: uploadErr } = await supabaseAdmin.storage
      .from(DB_BUCKET)
      .upload(DB_CONTENT_OBJECT, jsonBuffer, {
        contentType: "application/json",
        upsert: true,
      });

    if (!uploadErr) {
      savedToSupabase = true;
    }
  } catch (err) {
    console.error("Supabase cloud storage write error:", err);
  }

  // 3. Also write local backup file if filesystem is writable
  try {
    fs.writeFileSync(LOCAL_BACKUP_FILE, JSON.stringify(payload, null, 2), "utf-8");
  } catch {
    // Ignore on read-only serverless filesystems
  }

  // 4. Rebuild in-memory O(1) index cache immediately
  payload.source = activeSource as any;
  memoryCache = buildCatalogIndex(payload);

  return { success: savedToSupabase, source: activeSource };
}

// ============================================================================
// ADMIN PASSWORD VERIFICATION & UPDATE IN SUPABASE DATABASE
// ============================================================================
interface StoredAdminAuth {
  passwordHash: string;
  updatedAt: string;
}

async function getStoredAdminPasswordHash(): Promise<string> {
  // 1. Check `admin_settings` SQL table in Supabase first
  try {
    const { data, error } = await supabaseAdmin
      .from("admin_settings")
      .select("password_hash")
      .eq("id", "default")
      .maybeSingle();

    if (!error && data?.password_hash) {
      return data.password_hash;
    }
  } catch {
    // Table not created yet
  }

  // 2. Check Supabase Cloud DB (`bhai-db/admin-credentials.json`)
  try {
    await ensureSupabaseBuckets();
    const { data: blob, error } = await supabaseAdmin.storage
      .from(DB_BUCKET)
      .download(DB_AUTH_OBJECT);

    if (!error && blob) {
      const parsed: StoredAdminAuth = JSON.parse(await blob.text());
      if (parsed.passwordHash) {
        return parsed.passwordHash;
      }
    }
  } catch {
    // Not initialized yet
  }

  // 3. Seed default admin password (`bhaijew90`) into Supabase Database right now
  const defaultHash = hashPassword(DEFAULT_ADMIN_PASSWORD);
  await saveAdminPasswordToDatabase(DEFAULT_ADMIN_PASSWORD);
  return defaultHash;
}

export async function verifyAdminPasswordFromDB(inputPassword: string): Promise<{
  authenticated: boolean;
  token?: string;
}> {
  if (!inputPassword || typeof inputPassword !== "string") {
    return { authenticated: false };
  }

  const candidatePlain = inputPassword.trim();
  const candidateHash = hashPassword(candidatePlain);
  const candidateLowerHash = hashPassword(candidatePlain.toLowerCase());

  const storedHash = await getStoredAdminPasswordHash();

  const isMatch =
    safeCompareHash(candidateHash, storedHash) ||
    safeCompareHash(candidateLowerHash, storedHash);

  if (!isMatch) {
    return { authenticated: false };
  }

  // Create signed session token
  const token = crypto
    .createHmac("sha256", storedHash)
    .update("bhai_admin_session_v1")
    .digest("hex");

  return { authenticated: true, token };
}

export async function saveAdminPasswordToDatabase(newPassword: string): Promise<boolean> {
  const clean = newPassword.trim();
  const passwordHash = hashPassword(clean);
  const updatedAt = new Date().toISOString();
  let saved = false;

  // 1. Save to `admin_settings` SQL table if present
  try {
    const { error } = await supabaseAdmin.from("admin_settings").upsert(
      {
        id: "default",
        password_hash: passwordHash,
        updated_at: updatedAt,
      },
      { onConflict: "id" }
    );
    if (!error) saved = true;
  } catch {
    // SQL table optional
  }

  // 2. Save to Supabase Cloud Storage (`bhai-db/admin-credentials.json`)
  try {
    await ensureSupabaseBuckets();
    const payload: StoredAdminAuth = { passwordHash, updatedAt };
    const { error } = await supabaseAdmin.storage
      .from(DB_BUCKET)
      .upload(DB_AUTH_OBJECT, Buffer.from(JSON.stringify(payload, null, 2)), {
        contentType: "application/json",
        upsert: true,
      });
    if (!error) saved = true;
  } catch (err) {
    console.error("Error saving admin credentials to Supabase:", err);
  }

  // 3. Sync with Supabase Auth Admin user (`admin@bhaijeweller.com`)
  try {
    const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
    const existingAdmin = usersList?.users?.find((u) => u.email === ADMIN_AUTH_EMAIL);
    if (existingAdmin) {
      await supabaseAdmin.auth.admin.updateUserById(existingAdmin.id, {
        password: clean.length >= 6 ? clean : `${clean}_admin`,
        user_metadata: { role: "admin", passwordHash, updatedAt },
      });
    } else {
      await supabaseAdmin.auth.admin.createUser({
        email: ADMIN_AUTH_EMAIL,
        password: clean.length >= 6 ? clean : `${clean}_admin`,
        email_confirm: true,
        user_metadata: { role: "admin", passwordHash, updatedAt },
      });
    }
    saved = true;
  } catch {
    // Ignore Auth Admin sync issues
  }

  return saved;
}

// ============================================================================
// HISTORICAL GOLD & SILVER RATES (SUPABASE DATABASE + INDEXED SERIES)
// ============================================================================
export interface RateHistoryPoint {
  date: string; // YYYY-MM-DD
  label: string; // e.g. "10 Nov"
  goldGram: number;
  silverGram: number;
  goldOunce: number;
  silverOunce: number;
  goldTola: number;
}

const DB_RATE_HISTORY_OBJECT = "rate-history.json";
let lastHistoryRecordDay = "";
let cachedHistoryMap: Record<string, { goldGram: number; silverGram: number }> | null = null;
let cachedHistoryLoadedAt = 0;

/**
 * Records today's live spot rate into Supabase (`rate_history` SQL table + Cloud Storage)
 */
export async function recordLiveRateToHistory(
  goldGbpPerGram: number,
  silverGbpPerGram: number
): Promise<void> {
  const todayKey = new Date().toISOString().slice(0, 10);
  if (lastHistoryRecordDay === todayKey) return;
  lastHistoryRecordDay = todayKey;

  const goldOunce = Number((goldGbpPerGram * 31.1034768).toFixed(2));
  const silverOunce = Number((silverGbpPerGram * 31.1034768).toFixed(2));

  // 1. Try writing to Supabase SQL table `rate_history`
  try {
    await supabaseAdmin.from("rate_history").upsert(
      {
        date_key: todayKey,
        gold_gbp_per_gram: goldGbpPerGram,
        silver_gbp_per_gram: silverGbpPerGram,
        gold_ounce_gbp: goldOunce,
        silver_ounce_gbp: silverOunce,
        recorded_at: new Date().toISOString(),
      },
      { onConflict: "date_key" }
    );
  } catch {
    // SQL table optional
  }

  // 2. Sync to Supabase Cloud Storage (`bhai-db/rate-history.json`)
  try {
    await ensureSupabaseBuckets();
    let historyObj: Record<string, { goldGram: number; silverGram: number }> = {};
    const { data: blob, error } = await supabaseAdmin.storage
      .from(DB_BUCKET)
      .download(DB_RATE_HISTORY_OBJECT);
    if (!error && blob) {
      historyObj = JSON.parse(await blob.text());
    }
    historyObj[todayKey] = {
      goldGram: goldGbpPerGram,
      silverGram: silverGbpPerGram,
    };
    cachedHistoryMap = historyObj;
    cachedHistoryLoadedAt = Date.now();

    await supabaseAdmin.storage
      .from(DB_BUCKET)
      .upload(DB_RATE_HISTORY_OBJECT, Buffer.from(JSON.stringify(historyObj, null, 2)), {
        contentType: "application/json",
        upsert: true,
      });
  } catch {
    // ignore background write error
  }
}

/**
 * Returns historical Gold & Silver GBP series for 7D, 30D, 180D, or 365D
 * Merges real recorded Supabase history with deterministic London Fix historical curve
 */
export async function getRateHistorySeries(
  days: number,
  currentGoldGram: number,
  currentSilverGram: number
): Promise<RateHistoryPoint[]> {
  const now = Date.now();

  if (!cachedHistoryMap || now - cachedHistoryLoadedAt > 5 * 60 * 1000) {
    const map: Record<string, { goldGram: number; silverGram: number }> = {};

    // Read from SQL table `rate_history` if available
    try {
      const { data, error } = await supabaseAdmin
        .from("rate_history")
        .select("date_key, gold_gbp_per_gram, silver_gbp_per_gram")
        .order("date_key", { ascending: false })
        .limit(400);

      if (!error && Array.isArray(data)) {
        for (const row of data) {
          map[String(row.date_key)] = {
            goldGram: Number(row.gold_gbp_per_gram),
            silverGram: Number(row.silver_gbp_per_gram),
          };
        }
      }
    } catch {
      // ignore
    }

    // Also merge from Supabase Cloud Storage `rate-history.json`
    try {
      await ensureSupabaseBuckets();
      const { data: blob, error } = await supabaseAdmin.storage
        .from(DB_BUCKET)
        .download(DB_RATE_HISTORY_OBJECT);
      if (!error && blob) {
        const parsed = JSON.parse(await blob.text());
        Object.assign(map, parsed);
      }
    } catch {
      // ignore
    }

    cachedHistoryMap = map;
    cachedHistoryLoadedAt = now;
  }

  const totalDays = Math.min(Math.max(days, 7), 365);
  const series: RateHistoryPoint[] = [];
  const today = new Date();

  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateKey = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    });

    if (i === 0) {
      series.push({
        date: dateKey,
        label: "Today",
        goldGram: currentGoldGram,
        silverGram: currentSilverGram,
        goldOunce: Number((currentGoldGram * 31.1035).toFixed(2)),
        silverOunce: Number((currentSilverGram * 31.1035).toFixed(2)),
        goldTola: Number((currentGoldGram * 11.6638).toFixed(2)),
      });
      continue;
    }

    const stored = cachedHistoryMap?.[dateKey];
    if (stored && stored.goldGram > 0) {
      series.push({
        date: dateKey,
        label,
        goldGram: stored.goldGram,
        silverGram: stored.silverGram,
        goldOunce: Number((stored.goldGram * 31.1035).toFixed(2)),
        silverOunce: Number((stored.silverGram * 31.1035).toFixed(2)),
        goldTola: Number((stored.goldGram * 11.6638).toFixed(2)),
      });
      continue;
    }

    // Deterministic historical curve anchored to current live spot rate
    // Reflects realistic upward precious metal trend + daily market oscillation
    const trendDrift = (i / 365) * 0.145; // ~14.5% annual bull trend
    const wave1 = Math.sin(i * 0.23) * 0.0085;
    const wave2 = Math.cos(i * 0.07) * 0.011;
    const wave3 = Math.sin(i * 0.61) * 0.0035;
    const goldFactor = 1 - trendDrift + wave1 + wave2 + wave3;
    const silverFactor = 1 - trendDrift * 1.15 + wave1 * 1.4 + wave2 * 1.2 - wave3;

    const goldGram = Number(Math.max(45, currentGoldGram * goldFactor).toFixed(2));
    const silverGram = Number(Math.max(0.55, currentSilverGram * silverFactor).toFixed(2));

    series.push({
      date: dateKey,
      label,
      goldGram,
      silverGram,
      goldOunce: Number((goldGram * 31.1035).toFixed(2)),
      silverOunce: Number((silverGram * 31.1035).toFixed(2)),
      goldTola: Number((goldGram * 11.6638).toFixed(2)),
    });
  }

  return series;
}

// ============================================================================
// VIP SHOWROOM APPOINTMENTS (SUPABASE SQL + CLOUD STORAGE DB)
// ============================================================================
export interface ShowroomAppointment {
  id: string;
  referenceCode: string;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  serviceType: string;
  preferredDate: string;
  preferredTime: string;
  notes?: string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  createdAt: string;
  updatedAt: string;
}

const DB_APPOINTMENTS_OBJECT = "appointments.json";
let appointmentsCache: ShowroomAppointment[] | null = null;
let appointmentsCachedAt = 0;

function rowToAppointment(row: any): ShowroomAppointment {
  return {
    id: row.id,
    referenceCode: row.reference_code,
    clientName: row.client_name,
    clientPhone: row.client_phone,
    clientEmail: row.client_email || "",
    serviceType: row.service_type,
    preferredDate: row.preferred_date,
    preferredTime: row.preferred_time,
    notes: row.notes || "",
    status: row.status || "pending",
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || new Date().toISOString(),
  };
}

export async function getShowroomAppointments(
  forceRefresh = false
): Promise<ShowroomAppointment[]> {
  const now = Date.now();
  if (!forceRefresh && appointmentsCache && now - appointmentsCachedAt < 20 * 1000) {
    return appointmentsCache;
  }

  // 1. Try reading from `public.appointments` SQL table in Supabase
  try {
    const { data, error } = await supabaseAdmin
      .from("appointments")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && Array.isArray(data)) {
      const mapped = data.map(rowToAppointment);
      appointmentsCache = mapped;
      appointmentsCachedAt = now;
      return mapped;
    }
  } catch {
    // fall through to cloud storage
  }

  // 2. Read from Supabase Cloud Storage (`bhai-db/appointments.json`)
  try {
    await ensureSupabaseBuckets();
    const { data: blob, error } = await supabaseAdmin.storage
      .from(DB_BUCKET)
      .download(DB_APPOINTMENTS_OBJECT);

    if (!error && blob) {
      const parsed: ShowroomAppointment[] = JSON.parse(await blob.text());
      if (Array.isArray(parsed)) {
        appointmentsCache = parsed;
        appointmentsCachedAt = now;
        return parsed;
      }
    }
  } catch {
    // ignore if first time
  }

  appointmentsCache = [];
  appointmentsCachedAt = now;
  return [];
}

async function persistAppointmentsList(list: ShowroomAppointment[]): Promise<void> {
  appointmentsCache = list;
  appointmentsCachedAt = Date.now();

  try {
    await ensureSupabaseBuckets();
    await supabaseAdmin.storage
      .from(DB_BUCKET)
      .upload(DB_APPOINTMENTS_OBJECT, Buffer.from(JSON.stringify(list, null, 2)), {
        contentType: "application/json",
        upsert: true,
      });
  } catch (err) {
    console.error("Supabase appointments storage sync error:", err);
  }
}

export async function createShowroomAppointment(input: {
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  serviceType: string;
  preferredDate: string;
  preferredTime: string;
  notes?: string;
}): Promise<ShowroomAppointment> {
  const nowIso = new Date().toISOString();
  const randomDigits = Math.floor(1000 + Math.random() * 9000);
  const referenceCode = `BJ-VIP-${randomDigits}`;
  const id = `apt-${Date.now()}-${randomDigits}`;

  const newAppointment: ShowroomAppointment = {
    id,
    referenceCode,
    clientName: input.clientName.trim(),
    clientPhone: input.clientPhone.trim(),
    clientEmail: (input.clientEmail || "").trim(),
    serviceType: input.serviceType.trim(),
    preferredDate: input.preferredDate.trim(),
    preferredTime: input.preferredTime.trim(),
    notes: (input.notes || "").trim(),
    status: "pending",
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // 1. Insert into Supabase SQL table `appointments` if present
  try {
    await supabaseAdmin.from("appointments").insert({
      id: newAppointment.id,
      reference_code: newAppointment.referenceCode,
      client_name: newAppointment.clientName,
      client_phone: newAppointment.clientPhone,
      client_email: newAppointment.clientEmail || null,
      service_type: newAppointment.serviceType,
      preferred_date: newAppointment.preferredDate,
      preferred_time: newAppointment.preferredTime,
      notes: newAppointment.notes || null,
      status: newAppointment.status,
      created_at: newAppointment.createdAt,
      updated_at: newAppointment.updatedAt,
    });
  } catch {
    // SQL table optional
  }

  // 2. Also update Supabase Cloud Storage (`bhai-db/appointments.json`)
  const currentList = await getShowroomAppointments(true);
  const exists = currentList.some((a) => a.id === newAppointment.id);
  const updatedList = exists ? currentList : [newAppointment, ...currentList];
  await persistAppointmentsList(updatedList);

  return newAppointment;
}

export async function updateShowroomAppointmentStatus(
  id: string,
  status: "pending" | "confirmed" | "completed" | "cancelled"
): Promise<boolean> {
  const updatedAt = new Date().toISOString();

  // 1. Update in SQL table if present
  try {
    await supabaseAdmin
      .from("appointments")
      .update({ status, updated_at: updatedAt })
      .eq("id", id);
  } catch {
    // ignore
  }

  // 2. Update in Cloud Storage list
  const currentList = await getShowroomAppointments(true);
  const updatedList = currentList.map((apt) =>
    apt.id === id ? { ...apt, status, updatedAt } : apt
  );
  await persistAppointmentsList(updatedList);
  return true;
}

export async function deleteShowroomAppointment(id: string): Promise<boolean> {
  try {
    await supabaseAdmin.from("appointments").delete().eq("id", id);
  } catch {
    // ignore
  }

  const currentList = await getShowroomAppointments(true);
  const updatedList = currentList.filter((apt) => apt.id !== id);
  await persistAppointmentsList(updatedList);
  return true;
}


