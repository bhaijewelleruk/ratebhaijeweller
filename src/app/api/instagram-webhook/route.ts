import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { InstagramStoryItem } from "../instagram-stories/route";

const STORAGE_BUCKET = "bhai-db";
const STORIES_PATH = "instagram-stories.json";

// GET: Health check & current stored webhook stories status
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .download(STORIES_PATH);

    if (error || !data) {
      return NextResponse.json({
        status: "ready",
        endpoint: "/api/instagram-webhook",
        message: "Webhook receiver is active and waiting for Make.com data.",
        storedStoriesCount: 0,
      });
    }

    const text = await data.text();
    const parsed = JSON.parse(text);
    return NextResponse.json({
      status: "ready",
      endpoint: "/api/instagram-webhook",
      message: "Webhook receiver is active.",
      storedStoriesCount: Array.isArray(parsed?.stories) ? parsed.stories.length : 0,
      lastUpdated: parsed?.lastUpdated || null,
    });
  } catch (err: any) {
    return NextResponse.json({
      status: "ready",
      message: "Webhook receiver ready",
      error: err.message,
    });
  }
}

// POST: Accepts webhook payloads from Make.com or Instagram triggers
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body) {
      return NextResponse.json({ success: false, error: "Empty request body" }, { status: 400 });
    }

    // Support Apify webhook, Make.com, or direct JSON payloads
    let rawItems: any[] = [];
    const token =
      body.token ||
      body.apifyToken ||
      request.nextUrl.searchParams.get("token") ||
      process.env.APIFY_API_TOKEN ||
      "";

    if (body.resource?.defaultDatasetId || body.datasetId) {
      const datasetId = body.resource?.defaultDatasetId || body.datasetId;
      // Apify Webhook automatically delivers dataset ID -> fetch the scraped stories directly
      try {
        const apifyUrl = `https://api.apify.com/v2/datasets/${datasetId}/items?clean=true${token ? `&token=${token}` : ""}`;
        const apifyRes = await fetch(apifyUrl, { headers: { Accept: "application/json" } });
        if (apifyRes.ok) {
          rawItems = await apifyRes.json();
        } else {
          console.error("Apify dataset fetch status:", apifyRes.status);
        }
      } catch (err: any) {
        console.error("Error fetching Apify dataset:", err.message);
      }
    } else if (Array.isArray(body)) {
      rawItems = body;
    } else if (Array.isArray(body.items)) {
      rawItems = body.items;
    } else if (Array.isArray(body.stories)) {
      rawItems = body.stories;
    } else {
      rawItems = [body];
    }

    // Download existing stories from Supabase
    let existingStories: InstagramStoryItem[] = [];
    try {
      const { data } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .download(STORIES_PATH);
      if (data) {
        const text = await data.text();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed.stories)) {
          existingStories = parsed.stories;
        }
      }
    } catch {
      // file might not exist yet
    }

    const incomingStories: InstagramStoryItem[] = rawItems
      .filter((item: any) => item && (item.mediaUrl || item.media_url || item.imageUrl || item.url || item.image || item.display_url || item.displayUrl || item.video_url || item.videoUrl || item.thumbnail_src))
      .map((item: any, idx: number) => {
        const id = String(item.storyId || item.id || item.code || item.pk || `story-${Date.now()}-${idx}`);
        const code = String(item.code || item.shortcode || item.id || id.slice(-8));
        const mediaUrl = item.mediaUrl || item.media_url || item.imageUrl || item.display_url || item.displayUrl || item.video_url || item.videoUrl || item.url || item.image || item.thumbnail_src || "";
        const isVideo =
          item.mediaType === "video" ||
          item.media_type === "VIDEO" ||
          item.isVideo === true ||
          item.is_video === true ||
          item.is_video === "true" ||
          Boolean(item.video_url || item.videoUrl) ||
          mediaUrl.includes(".mp4");

        const timestamp = item.timestamp || item.taken_at || item.takenAt || item.date || new Date().toISOString();
        let dateFormatted = "Showroom Story";
        try {
          const d = new Date(typeof timestamp === "number" ? (timestamp < 1e11 ? timestamp * 1000 : timestamp) : timestamp);
          const day = String(d.getDate()).padStart(2, "0");
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const year = String(d.getFullYear()).slice(-2);
          dateFormatted = `${day}/${month}/${year}`;
        } catch {
          dateFormatted = "Showroom Story";
        }

        const title = item.caption || item.title || item.text || "Live Bradford Showroom Story";
        const ref = `BJ-${code.slice(0, 6).toUpperCase()}`;

        return {
          id,
          code,
          ref,
          title,
          imageUrl: isVideo && (item.thumbnailUrl || item.thumbnail_url || item.display_url) ? (item.thumbnailUrl || item.thumbnail_url || item.display_url) : mediaUrl,
          fullPicUrl: mediaUrl,
          videoUrl: isVideo ? (item.video_url || item.videoUrl || mediaUrl) : null,
          isVideo,
          link: item.permalink || item.url || `https://www.instagram.com/stories/bhaijeweller/${code}/`,
          date: String(timestamp),
          dateFormatted,
          caption: title,
        };
      });

    if (incomingStories.length === 0) {
      return NextResponse.json(
        { success: false, error: "No valid media found in webhook payload" },
        { status: 400 }
      );
    }

    // Merge new stories: new incoming stories at top, deduplicating by id/code
    const seenIds = new Set<string>();
    const mergedStories: InstagramStoryItem[] = [];

    for (const st of [...incomingStories, ...existingStories]) {
      const key = st.id || st.code;
      if (!seenIds.has(key)) {
        seenIds.add(key);
        mergedStories.push(st);
      }
    }

    // Keep at most 30 recent stories
    const trimmedStories = mergedStories.slice(0, 30);

    const payload = {
      stories: trimmedStories,
      lastUpdated: new Date().toISOString(),
      source: "make-com-webhook",
    };

    // Save to Supabase Storage bhai-db/instagram-stories.json
    const buffer = Buffer.from(JSON.stringify(payload, null, 2), "utf-8");
    const { error: uploadError } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(STORIES_PATH, buffer, {
        contentType: "application/json",
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    return NextResponse.json({
      success: true,
      message: `Successfully processed and saved ${incomingStories.length} new stories!`,
      totalActiveStories: trimmedStories.length,
      lastUpdated: payload.lastUpdated,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to process webhook" },
      { status: 500 }
    );
  }
}
