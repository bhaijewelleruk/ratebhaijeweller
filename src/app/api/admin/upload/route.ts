import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { supabaseAdmin } from "@/lib/supabase";

const MEDIA_BUCKET = "showroom-media";

export async function POST(request: NextRequest) {
  try {
    const data = await request.formData();
    const file: File | null = data.get("file") as unknown as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file uploaded" },
        { status: 400 }
      );
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { success: false, error: "Only image files are allowed" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const uniqueFileName = `${Date.now()}-${cleanName}`;

    // 1. Primary: Upload to Supabase Storage (`showroom-media` public bucket)
    try {
      const { data: buckets } = await supabaseAdmin.storage.listBuckets();
      if (!buckets?.some((b) => b.id === MEDIA_BUCKET)) {
        await supabaseAdmin.storage.createBucket(MEDIA_BUCKET, { public: true });
      }

      const { error: uploadErr } = await supabaseAdmin.storage
        .from(MEDIA_BUCKET)
        .upload(`products/${uniqueFileName}`, buffer, {
          contentType: file.type,
          upsert: true,
        });

      if (!uploadErr) {
        const { data: publicUrlData } = supabaseAdmin.storage
          .from(MEDIA_BUCKET)
          .getPublicUrl(`products/${uniqueFileName}`);

        if (publicUrlData?.publicUrl) {
          return NextResponse.json({
            success: true,
            url: publicUrlData.publicUrl,
            fileName: uniqueFileName,
            storage: "supabase",
          });
        }
      }
    } catch (supaErr) {
      console.warn("Supabase storage upload fallback to local:", supaErr);
    }

    // 2. Fallback: Save locally to /public/uploads
    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, uniqueFileName);
    await writeFile(filePath, buffer);

    return NextResponse.json({
      success: true,
      url: `/uploads/${uniqueFileName}`,
      fileName: uniqueFileName,
      storage: "local",
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to upload file" },
      { status: 500 }
    );
  }
}
