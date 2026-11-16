"use client";

import React, { useState } from "react";

interface BookedAppointmentResult {
  id: string;
  referenceCode: string;
  clientName: string;
  clientPhone: string;
  serviceType: string;
  preferredDate: string;
  preferredTime: string;
}

const VIP_SERVICES = [
  "🪙 Private VIP Bullion Suite (Buy/Sell Gold & Silver Bars)",
  "💎 22K Bridal Viewing Chambers (Bespoke & Bridal Sets)",
  "🔬 On-Site Laser XRF Scrap Gold Cashout Valuation",
  "⚖️ Zakat & Precious Metal Portfolio Consultation",
];

const TIME_SLOTS = [
  "11:00 AM",
  "12:00 PM",
  "1:00 PM",
  "2:00 PM",
  "3:00 PM",
  "4:00 PM",
  "5:00 PM",
  "6:00 PM",
];

export default function VipAppointmentBooking({
  whatsappNumber = "+447735727897",
}: {
  whatsappNumber?: string;
}) {
  const tomorrowIso = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [serviceType, setServiceType] = useState(VIP_SERVICES[0]);
  const [preferredDate, setPreferredDate] = useState(tomorrowIso);
  const [preferredTime, setPreferredTime] = useState("2:00 PM");
  const [notes, setNotes] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [bookedPass, setBookedPass] = useState<BookedAppointmentResult | null>(null);

  const handleBookAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    try {
      setIsSubmitting(true);
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName,
          clientPhone,
          clientEmail,
          serviceType,
          preferredDate,
          preferredTime,
          notes,
        }),
      });

      const json = await res.json();
      if (res.ok && json.success && json.appointment) {
        setBookedPass(json.appointment);
      } else {
        setErrorMsg(json.error || "Could not book appointment. Please try again.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Network error while booking appointment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const cleanWa = whatsappNumber.replace(/[^0-9]/g, "");

  if (bookedPass) {
    const waText = encodeURIComponent(
      `*VIP Showroom Appointment Pass - Bhai Jewellers*\n\n• *Reference Code:* ${bookedPass.referenceCode}\n• *Client:* ${bookedPass.clientName}\n• *Suite / Service:* ${bookedPass.serviceType}\n• *Date & Time:* ${bookedPass.preferredDate} at ${bookedPass.preferredTime}\n• *Showroom:* 17 Duckworth Lane, Bradford BD9 5ER\n\nPlease confirm my VIP appointment slot.`
    );

    return (
      <div className="bg-gradient-to-b from-white via-[#fdfbf7] to-[#faf5ea] border-2 border-[#d4af37] rounded-2xl p-6 sm:p-8 shadow-md text-center space-y-4 animate-in fade-in">
        <div className="w-12 h-12 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-800 flex items-center justify-center mx-auto text-xl font-bold">
          ✓
        </div>

        <div>
          <span className="text-[10px] font-notche font-bold uppercase tracking-widest px-3 py-1 rounded-full bg-[#faf5ea] text-[#8b6914] border border-[#dfcca6]">
            Saved in Supabase Database
          </span>
          <h3 className="text-xl sm:text-2xl font-notche font-bold text-slate-900 mt-2">
            VIP Showroom Pass Reserved
          </h3>
          <p className="text-xs text-stone-600 mt-1">
            Present your official reference code below upon arrival at 17 Duckworth Lane, Bradford.
          </p>
        </div>

        {/* Official Pass Card */}
        <div className="max-w-md mx-auto p-4 rounded-xl bg-white border-2 border-[#dfcca6] text-left space-y-2 text-xs shadow-2xs">
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <span className="text-stone-400 uppercase font-bold text-[10px]">Booking Ref:</span>
            <span className="font-numbers font-black text-base text-[#8b6914] bg-[#faf5ea] px-2.5 py-0.5 rounded border border-[#dfcca6]">
              {bookedPass.referenceCode}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-500">Guest Name:</span>
            <span className="font-bold text-slate-900">{bookedPass.clientName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-500">Selected Suite:</span>
            <span className="font-semibold text-slate-800 text-right max-w-[210px] truncate">
              {bookedPass.serviceType}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-stone-500">Date & Time:</span>
            <span className="font-numbers font-bold text-emerald-800">
              {bookedPass.preferredDate} · {bookedPass.preferredTime}
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <a
            href={`https://wa.me/${cleanWa}?text=${waText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[#25D366] hover:bg-[#1ebe5b] text-white font-notche font-bold text-xs tracking-wider shadow transition-all flex items-center justify-center gap-2"
          >
            <span>Send Pass to Showroom WhatsApp →</span>
          </a>

          <button
            type="button"
            onClick={() => {
              setBookedPass(null);
              setNotes("");
            }}
            className="px-4 py-2.5 rounded-xl border border-[#dfcca6] bg-white text-stone-700 text-xs font-semibold hover:bg-stone-50 cursor-pointer"
          >
            Book Another Slot
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border-2 border-[#dfcca6] rounded-2xl p-6 sm:p-7 shadow-sm space-y-5">
      <div className="border-b border-[#dfcca6]/60 pb-3.5 flex items-center justify-between">
        <div>
          <span className="text-[10px] font-notche font-bold text-[#8b6914] uppercase tracking-widest block">
            📅 Private Concierge Booking
          </span>
          <h2 className="text-lg sm:text-xl font-notche font-bold text-slate-900 mt-0.5">
            Book a VIP Showroom Appointment
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Reserve our private bullion suite, bridal chamber, or XRF assay lab in Bradford.
          </p>
        </div>
        <span className="hidden sm:inline-block text-[10px] font-bold bg-emerald-50 text-emerald-800 px-2.5 py-1 rounded-full border border-emerald-200">
          ● Instant Ref Code
        </span>
      </div>

      <form onSubmit={handleBookAppointment} className="space-y-4 text-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Your Full Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Tariq Mahmood"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#dfcca6] bg-[#faf8f5] focus:outline-none focus:ring-1 focus:ring-[#8b6914]"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Phone / WhatsApp Number *
            </label>
            <input
              type="tel"
              required
              placeholder="e.g. 07700 900123"
              value={clientPhone}
              onChange={(e) => setClientPhone(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#dfcca6] bg-[#faf8f5] font-numbers focus:outline-none focus:ring-1 focus:ring-[#8b6914]"
            />
          </div>
        </div>

        <div>
          <label className="block font-bold text-slate-700 uppercase mb-1">
            Select VIP Showroom Suite / Service *
          </label>
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-[#dfcca6] bg-[#faf8f5] font-medium focus:outline-none focus:ring-1 focus:ring-[#8b6914]"
          >
            {VIP_SERVICES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Preferred Date *
            </label>
            <input
              type="date"
              required
              min={new Date().toISOString().slice(0, 10)}
              value={preferredDate}
              onChange={(e) => setPreferredDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#dfcca6] bg-[#faf8f5] font-numbers focus:outline-none focus:ring-1 focus:ring-[#8b6914]"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 uppercase mb-1">
              Preferred Time Slot (11 AM – 7 PM) *
            </label>
            <select
              value={preferredTime}
              onChange={(e) => setPreferredTime(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#dfcca6] bg-[#faf8f5] font-numbers font-semibold focus:outline-none focus:ring-1 focus:ring-[#8b6914]"
            >
              {TIME_SLOTS.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block font-bold text-slate-700 uppercase mb-1">
            Special Requests / Bullion or Jewellery Notes (Optional)
          </label>
          <textarea
            rows={2}
            placeholder="e.g. Looking to view 100g PAMP gold bars or 22K bridal necklace sets..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3.5 py-2 rounded-xl border border-[#dfcca6] bg-[#faf8f5] focus:outline-none focus:ring-1 focus:ring-[#8b6914]"
          />
        </div>

        {errorMsg && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3 rounded-xl bg-gradient-to-r from-[#7a5d28] via-[#8b6914] to-[#73582a] hover:from-[#664d1f] hover:to-[#5a441e] text-white font-notche font-bold tracking-wider text-xs shadow-md hover:shadow-lg transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
        >
          {isSubmitting ? "RESERVING VIP SUITE..." : "RESERVE VIP APPOINTMENT PASS"}
        </button>
      </form>
    </div>
  );
}

