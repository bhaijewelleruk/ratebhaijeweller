import { NextRequest, NextResponse } from "next/server";
import { INITIAL_SITE_CONTENT } from "@/data/site-content";
import {
  getIndexedCatalog,
  saveCatalogToDatabase,
  StoredDatabaseState,
} from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const forceFresh = searchParams.get("fresh") === "true";
    const metal = searchParams.get("metal") as "gold" | "silver" | null;
    const type = searchParams.get("type") as "bar" | "coin" | null;
    const itemId = searchParams.get("id");

    const indexed = await getIndexedCatalog(forceFresh);

    // Check If-None-Match ETag for instant 304 Not Modified response
    const clientEtag = request.headers.get("if-none-match");
    if (!forceFresh && clientEtag && clientEtag === indexed.etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: indexed.etag,
          "Cache-Control": "public, max-age=15, s-maxage=60, stale-while-revalidate=300",
        },
      });
    }

    // Optional O(1) single-item lookup via index
    if (itemId) {
      const product = indexed.byId[itemId] || null;
      return NextResponse.json(
        {
          success: true,
          product,
          cachedAt: new Date(indexed.cachedAt).toISOString(),
        },
        {
          headers: {
            ETag: indexed.etag,
            "Cache-Control": "public, max-age=15, s-maxage=60, stale-while-revalidate=300",
          },
        }
      );
    }

    // Optional O(1) indexed slice by metal & type
    let filteredItems = undefined;
    if (metal === "gold" || metal === "silver") {
      if (type === "bar" || type === "coin") {
        filteredItems = indexed.byMetalAndType[`${metal}:${type}`];
      } else {
        filteredItems = indexed.byMetal[metal];
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: indexed.state,
        filteredItems,
        indexStats: {
          totalGold: indexed.byMetal.gold.length,
          totalSilver: indexed.byMetal.silver.length,
          goldBars: indexed.byMetalAndType["gold:bar"].length,
          goldCoins: indexed.byMetalAndType["gold:coin"].length,
          silverBars: indexed.byMetalAndType["silver:bar"].length,
          silverCoins: indexed.byMetalAndType["silver:coin"].length,
          inStockGold: indexed.inStockCount.gold,
          inStockSilver: indexed.inStockCount.silver,
          etag: indexed.etag,
          cachedAt: new Date(indexed.cachedAt).toISOString(),
          dbSource: indexed.state.source || "supabase-cloud",
        },
      },
      {
        headers: {
          ETag: indexed.etag,
          "Cache-Control": forceFresh
            ? "no-store, no-cache, must-revalidate"
            : "public, max-age=15, s-maxage=60, stale-while-revalidate=300",
        },
      }
    );
  } catch (error: any) {
    console.error("Error fetching catalog from Supabase:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to load content from database",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const indexed = await getIndexedCatalog(false);
    const current = indexed.state;

    const updatedData: StoredDatabaseState = {
      goldItems: Array.isArray(body.goldItems) ? body.goldItems : current.goldItems,
      silverItems: Array.isArray(body.silverItems) ? body.silverItems : current.silverItems,
      siteContent: body.siteContent
        ? {
            contact: {
              ...current.siteContent.contact,
              ...(body.siteContent.contact || {}),
            },
            findUs: {
              ...current.siteContent.findUs,
              ...(body.siteContent.findUs || {}),
            },
            privacyPolicy: {
              ...current.siteContent.privacyPolicy,
              ...(body.siteContent.privacyPolicy || {}),
            },
            slides: Array.isArray(body.siteContent.slides)
              ? body.siteContent.slides
              : current.siteContent.slides || INITIAL_SITE_CONTENT.slides,
          }
        : current.siteContent,
      lastUpdated: new Date().toISOString(),
    };

    const result = await saveCatalogToDatabase(updatedData);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: "Failed to save data to Supabase database" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Admin content synced to Supabase database & cache updated!",
      dbSource: result.source,
      data: updatedData,
    });
  } catch (error: any) {
    console.error("Admin update error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update content" },
      { status: 500 }
    );
  }
}
