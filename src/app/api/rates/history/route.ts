import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_RATES } from "@/lib/rates";
import { getRateHistorySeries } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const daysParam = parseInt(searchParams.get("days") || "30", 10);
    const goldGramParam = parseFloat(searchParams.get("gold") || "");
    const silverGramParam = parseFloat(searchParams.get("silver") || "");

    const currentGold =
      !isNaN(goldGramParam) && goldGramParam > 0
        ? goldGramParam
        : DEFAULT_RATES.goldGbpPerGram;
    const currentSilver =
      !isNaN(silverGramParam) && silverGramParam > 0
        ? silverGramParam
        : DEFAULT_RATES.silverGbpPerGram;

    const series = await getRateHistorySeries(daysParam, currentGold, currentSilver);

    return NextResponse.json(
      {
        success: true,
        days: daysParam,
        series,
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (error: any) {
    console.error("Rate history API error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load rate history" },
      { status: 500 }
    );
  }
}

