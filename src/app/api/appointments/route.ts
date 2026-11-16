import { NextRequest, NextResponse } from "next/server";
import {
  getShowroomAppointments,
  createShowroomAppointment,
  updateShowroomAppointmentStatus,
  deleteShowroomAppointment,
} from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fresh = searchParams.get("fresh") === "true";
    const appointments = await getShowroomAppointments(fresh);

    return NextResponse.json({
      success: true,
      appointments,
      counts: {
        total: appointments.length,
        pending: appointments.filter((a) => a.status === "pending").length,
        confirmed: appointments.filter((a) => a.status === "confirmed").length,
        completed: appointments.filter((a) => a.status === "completed").length,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch appointments" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      clientName,
      clientPhone,
      clientEmail,
      serviceType,
      preferredDate,
      preferredTime,
      notes,
    } = body;

    if (!clientName || !clientPhone || !serviceType || !preferredDate || !preferredTime) {
      return NextResponse.json(
        {
          success: false,
          error: "Please fill in your name, phone number, service, date, and time slot.",
        },
        { status: 400 }
      );
    }

    const created = await createShowroomAppointment({
      clientName,
      clientPhone,
      clientEmail,
      serviceType,
      preferredDate,
      preferredTime,
      notes,
    });

    return NextResponse.json({
      success: true,
      message: "VIP Showroom Appointment booked in Supabase database!",
      appointment: created,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create appointment" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status } = body;

    if (!id || !["pending", "confirmed", "completed", "cancelled"].includes(status)) {
      return NextResponse.json(
        { success: false, error: "Valid appointment id and status are required." },
        { status: 400 }
      );
    }

    await updateShowroomAppointmentStatus(id, status);
    const updatedList = await getShowroomAppointments(true);

    return NextResponse.json({
      success: true,
      appointments: updatedList,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update appointment" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Appointment ID is required" },
        { status: 400 }
      );
    }

    await deleteShowroomAppointment(id);
    const updatedList = await getShowroomAppointments(true);

    return NextResponse.json({
      success: true,
      appointments: updatedList,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete appointment" },
      { status: 500 }
    );
  }
}

