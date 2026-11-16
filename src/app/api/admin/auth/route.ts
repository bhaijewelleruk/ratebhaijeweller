import { NextRequest, NextResponse } from "next/server";
import {
  verifyAdminPasswordFromDB,
  saveAdminPasswordToDatabase,
} from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, password, currentPassword, newPassword } = body;

    // 1. Change Admin Password in Database
    if (action === "change-password") {
      if (!currentPassword || !newPassword || newPassword.trim().length < 4) {
        return NextResponse.json(
          {
            success: false,
            error: "Current password and a new password (min 4 characters) are required.",
          },
          { status: 400 }
        );
      }

      const verifyCurrent = await verifyAdminPasswordFromDB(currentPassword);
      if (!verifyCurrent.authenticated) {
        return NextResponse.json(
          {
            success: false,
            error: "Current admin password is incorrect.",
          },
          { status: 401 }
        );
      }

      const updated = await saveAdminPasswordToDatabase(newPassword);
      if (!updated) {
        return NextResponse.json(
          {
            success: false,
            error: "Failed to update password in Supabase database.",
          },
          { status: 500 }
        );
      }

      const newVerify = await verifyAdminPasswordFromDB(newPassword);
      return NextResponse.json({
        success: true,
        message: "Admin password updated in Supabase database!",
        token: newVerify.token,
      });
    }

    // 2. Verify Admin Password from Database
    const result = await verifyAdminPasswordFromDB(password);
    if (!result.authenticated) {
      return NextResponse.json(
        {
          success: false,
          authenticated: false,
          error: "Access Denied. Invalid admin password.",
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      token: result.token,
    });
  } catch (error: any) {
    console.error("Admin auth API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Authentication failed",
      },
      { status: 500 }
    );
  }
}

