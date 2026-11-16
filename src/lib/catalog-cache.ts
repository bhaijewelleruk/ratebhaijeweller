import { BullionProduct, INITIAL_GOLD_ITEMS, INITIAL_SILVER_ITEMS } from "@/data/bullion-items";
import { INITIAL_SITE_CONTENT, SiteContent } from "@/data/site-content";

const STORAGE_KEY = "bhai_catalog_cache_v1";
const CLIENT_TTL_MS = 45 * 1000; // 45s client cache before background revalidation

export interface ClientCatalogData {
  goldItems: BullionProduct[];
  silverItems: BullionProduct[];
  siteContent: SiteContent;
  lastUpdated: string;
  etag?: string;
  fetchedAt: number;
}

let inMemoryClientCache: ClientCatalogData | null = null;

export function clearClientCatalogCache() {
  inMemoryClientCache = null;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }
}

export async function fetchCachedCatalog(forceFresh = false): Promise<ClientCatalogData> {
  const now = Date.now();

  if (!forceFresh) {
    if (inMemoryClientCache && now - inMemoryClientCache.fetchedAt < CLIENT_TTL_MS) {
      return inMemoryClientCache;
    }

    if (typeof window !== "undefined") {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed: ClientCatalogData = JSON.parse(raw);
          if (parsed && now - parsed.fetchedAt < CLIENT_TTL_MS) {
            inMemoryClientCache = parsed;
            return parsed;
          }
        }
      } catch {
        // ignore parse errors
      }
    }
  }

  const url = forceFresh ? `/api/admin/content?fresh=true&t=${now}` : "/api/admin/content";
  const res = await fetch(url, forceFresh ? { cache: "no-store" } : undefined);
  const json = await res.json();

  if (json.success && json.data) {
    const result: ClientCatalogData = {
      goldItems: Array.isArray(json.data.goldItems) ? json.data.goldItems : INITIAL_GOLD_ITEMS,
      silverItems: Array.isArray(json.data.silverItems) ? json.data.silverItems : INITIAL_SILVER_ITEMS,
      siteContent: {
        ...INITIAL_SITE_CONTENT,
        ...(json.data.siteContent || {}),
        slides: Array.isArray(json.data.siteContent?.slides)
          ? json.data.siteContent.slides
          : INITIAL_SITE_CONTENT.slides,
      },
      lastUpdated: json.data.lastUpdated || new Date().toISOString(),
      etag: json.indexStats?.etag,
      fetchedAt: now,
    };

    inMemoryClientCache = result;
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result));
      } catch {
        // ignore quota errors
      }
    }
    return result;
  }

  return (
    inMemoryClientCache || {
      goldItems: INITIAL_GOLD_ITEMS,
      silverItems: INITIAL_SILVER_ITEMS,
      siteContent: INITIAL_SITE_CONTENT,
      lastUpdated: new Date().toISOString(),
      fetchedAt: now,
    }
  );
}

