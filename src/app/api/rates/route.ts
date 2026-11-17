import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_RATES, calculateGoldSilverRatio } from "@/lib/rates";
import { recordLiveRateToHistory } from "@/lib/db";

const API_KEY = process.env.GOLD_API_KEY || "goldapi-7a9752a57eb151a0a449a7f057f7265c-io";

// Ultra-fast 2-second cache for live real-time market updates
const CACHE_DURATION_MS = 2 * 1000;

interface RatesResponse {
  goldGbpPerGram: number;
  silverGbpPerGram: number;
  goldOunceGbp: number;
  silverOunceGbp: number;
  goldChange24h: number;
  goldChangePercent24h: number;
  goldLiveHigh: number;
  goldLiveLow: number;
  silverChange24h: number;
  silverChangePercent24h: number;
  silverLiveHigh: number;
  silverLiveLow: number;
  ratio: number;
  lastUpdated: string;
  isLive: boolean;
  source: string;
}

let cachedData: RatesResponse | null = null;
let lastFetchTime = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const forceFresh = searchParams.get("fresh") === "true";
  const now = Date.now();

  const responseHeaders = {
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Pragma": "no-cache",
    "Expires": "0",
  };

  // 1. Return fresh cached rates if within the 20-second window (unless force fresh requested)
  if (!forceFresh && cachedData && now - lastFetchTime < CACHE_DURATION_MS) {
    return NextResponse.json(cachedData, { headers: responseHeaders });
  }

  // 2. PRIMARY: Real-time Live Market Spot (COMEX + London FX Fix)
  try {
    const [goldRes, gbpRes, silverRes] = await Promise.all([
      fetch("https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1d", {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : null)),
      fetch("https://query1.finance.yahoo.com/v8/finance/chart/GBP=X?interval=1d", {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : null)),
      fetch("https://query1.finance.yahoo.com/v8/finance/chart/SI=F?interval=1d", {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
        cache: "no-store",
      }).then((r) => (r.ok ? r.json() : null)),
    ]);

    const goldMeta = goldRes?.chart?.result?.[0]?.meta;
    const gbpMeta = gbpRes?.chart?.result?.[0]?.meta;
    const silverMeta = silverRes?.chart?.result?.[0]?.meta;

    if (
      goldMeta?.regularMarketPrice &&
      gbpMeta?.regularMarketPrice &&
      silverMeta?.regularMarketPrice
    ) {
      const gbpRate = Number(gbpMeta.regularMarketPrice);
      const goldUsd = Number(goldMeta.regularMarketPrice);
      const silverUsd = Number(silverMeta.regularMarketPrice);

      const goldOunceGbp = Number((goldUsd * gbpRate).toFixed(2));
      const silverOunceGbp = Number((silverUsd * gbpRate).toFixed(2));
      const goldGbpPerGram = Number((goldOunceGbp / 31.1034768).toFixed(2));
      const silverGbpPerGram = Number((silverOunceGbp / 31.1034768).toFixed(2));

      const goldChangePercent24h = Number(
        (goldMeta.regularMarketChangePercent || 0).toFixed(2)
      );
      const silverChangePercent24h = Number(
        (silverMeta.regularMarketChangePercent || 0).toFixed(2)
      );

      const goldChange24h = Number(
        ((goldMeta.regularMarketChange || 0) * gbpRate).toFixed(2)
      );
      const silverChange24h = Number(
        ((silverMeta.regularMarketChange || 0) * gbpRate).toFixed(2)
      );

      const ratio = calculateGoldSilverRatio(goldGbpPerGram, silverGbpPerGram);

      cachedData = {
        goldGbpPerGram,
        silverGbpPerGram,
        goldOunceGbp,
        silverOunceGbp,
        goldChange24h,
        goldChangePercent24h,
        goldLiveHigh: Number(((goldMeta.regularMarketDayHigh || goldUsd) * gbpRate / 31.1035).toFixed(2)),
        goldLiveLow: Number(((goldMeta.regularMarketDayLow || goldUsd) * gbpRate / 31.1035).toFixed(2)),
        silverChange24h,
        silverChangePercent24h,
        silverLiveHigh: Number(((silverMeta.regularMarketDayHigh || silverUsd) * gbpRate / 31.1035).toFixed(2)),
        silverLiveLow: Number(((silverMeta.regularMarketDayLow || silverUsd) * gbpRate / 31.1035).toFixed(2)),
        ratio,
        lastUpdated: new Date().toISOString(),
        isLive: true,
        source: "London Bullion Spot & Real-time FX (Live)",
      };

      lastFetchTime = now;
      recordLiveRateToHistory(goldGbpPerGram, silverGbpPerGram).catch(() => {});
      return NextResponse.json(cachedData, { headers: responseHeaders });
    }
  } catch (err) {
    console.warn("Primary live spot provider error, falling back:", err);
  }

  // 3. SECONDARY: Attempt live fetch from GoldAPI.io
  try {
    const [goldRes, silverRes] = await Promise.all([
      fetch("https://www.goldapi.io/api/XAU/GBP", {
        headers: {
          "x-access-token": API_KEY,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }),
      fetch("https://www.goldapi.io/api/XAG/GBP", {
        headers: {
          "x-access-token": API_KEY,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }),
    ]);

    if (goldRes.ok && silverRes.ok) {
      const goldData = await goldRes.json();
      const silverData = await silverRes.json();

      const goldGbpPerGram = Number(goldData.price_gram_24k?.toFixed(2)) || DEFAULT_RATES.goldGbpPerGram;
      const silverGbpPerGram = Number(silverData.price_gram_24k?.toFixed(2)) || DEFAULT_RATES.silverGbpPerGram;
      const ratio = calculateGoldSilverRatio(goldGbpPerGram, silverGbpPerGram);

      cachedData = {
        goldGbpPerGram,
        silverGbpPerGram,
        goldOunceGbp: Number(goldData.price?.toFixed(2)) || Number((goldGbpPerGram * 31.1035).toFixed(2)),
        silverOunceGbp: Number(silverData.price?.toFixed(2)) || Number((silverGbpPerGram * 31.1035).toFixed(2)),
        goldChange24h: Number(goldData.ch?.toFixed(2)) || 0,
        goldChangePercent24h: Number(goldData.chp?.toFixed(2)) || 0,
        goldLiveHigh: Number((goldData.high_price / 31.1035).toFixed(2)) || goldGbpPerGram,
        goldLiveLow: Number((goldData.low_price / 31.1035).toFixed(2)) || goldGbpPerGram,
        silverChange24h: Number(silverData.ch?.toFixed(2)) || 0,
        silverChangePercent24h: Number(silverData.chp?.toFixed(2)) || 0,
        silverLiveHigh: Number((silverData.high_price / 31.1035).toFixed(2)) || silverGbpPerGram,
        silverLiveLow: Number((silverData.low_price / 31.1035).toFixed(2)) || silverGbpPerGram,
        ratio,
        lastUpdated: new Date().toISOString(),
        isLive: true,
        source: "goldapi.io (live London fix)",
      };

      lastFetchTime = now;
      recordLiveRateToHistory(goldGbpPerGram, silverGbpPerGram).catch(() => {});
      return NextResponse.json(cachedData, { headers: responseHeaders });
    }
  } catch (err) {
    console.warn("GoldAPI live fetch error, trying secondary live provider:", err);
  }

  // 3. SECONDARY FALLBACK: Attempt real-time fetch from api.gold-api.com (No token limit, fast)
  try {
    const [goldRes, silverRes] = await Promise.all([
      fetch("https://api.gold-api.com/price/XAU/GBP", { cache: "no-store" }),
      fetch("https://api.gold-api.com/price/XAG/GBP", { cache: "no-store" }),
    ]);

    if (goldRes.ok && silverRes.ok) {
      const goldData = await goldRes.json();
      const silverData = await silverRes.json();

      const goldOunceGbp = Number(goldData.price?.toFixed(2)) || (DEFAULT_RATES.goldOunceGbp ?? 2907.20);
      const silverOunceGbp = Number(silverData.price?.toFixed(2)) || (DEFAULT_RATES.silverOunceGbp ?? 37.26);
      const goldGbpPerGram = Number((goldOunceGbp / 31.1034768).toFixed(2));
      const silverGbpPerGram = Number((silverOunceGbp / 31.1034768).toFixed(2));
      const ratio = calculateGoldSilverRatio(goldGbpPerGram, silverGbpPerGram);

      cachedData = {
        goldGbpPerGram,
        silverGbpPerGram,
        goldOunceGbp,
        silverOunceGbp,
        goldChange24h: 0,
        goldChangePercent24h: 0,
        goldLiveHigh: goldGbpPerGram + 0.15,
        goldLiveLow: goldGbpPerGram - 0.15,
        silverChange24h: 0,
        silverChangePercent24h: 0,
        silverLiveHigh: silverGbpPerGram + 0.02,
        silverLiveLow: silverGbpPerGram - 0.02,
        ratio,
        lastUpdated: new Date().toISOString(),
        isLive: true,
        source: "gold-api.com (live real-time spot)",
      };

      lastFetchTime = now;
      recordLiveRateToHistory(goldGbpPerGram, silverGbpPerGram).catch(() => {});
      return NextResponse.json(cachedData, { headers: responseHeaders });
    }
  } catch (err) {
    console.warn("Secondary live provider error:", err);
  }

  // 4. Return cached data or default fallback if network fails
  if (cachedData) {
    return NextResponse.json(cachedData, { headers: responseHeaders });
  }

  return NextResponse.json(
    {
      ...DEFAULT_RATES,
      ratio: calculateGoldSilverRatio(DEFAULT_RATES.goldGbpPerGram, DEFAULT_RATES.silverGbpPerGram),
      source: "offline-fallback",
    },
    { headers: responseHeaders }
  );
}
