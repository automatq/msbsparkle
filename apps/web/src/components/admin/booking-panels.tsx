"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import {
  cancelBookingAction,
  pauseBookingAction,
  resumeBookingAction,
  updateBookingNotesAction,
} from "@/modules/admin/actions";
import { ActionButton } from "./ui";

export function BookingControls({
  bookingId,
  status,
  internalNotes,
  recurring,
}: {
  bookingId: string;
  status: string;
  internalNotes: string;
  recurring: boolean;
}) {
  const [reason, setReason] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [notes, setNotes] = useState(internalNotes);
  const open = status === "ACTIVE" || status === "PAUSED" || status === "PENDING";
  return (
    <div className="space-y-4 text-sm">
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Internal notes</p>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        <ActionButton action={() => updateBookingNotesAction(bookingId, notes)}>
          Save notes
        </ActionButton>
      </div>
      {open && recurring ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Pause</p>
          {status === "PAUSED" ? (
            <ActionButton action={() => resumeBookingAction(bookingId)}>Resume series</ActionButton>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 rounded-lg border px-2"
              />
              <span>to</span>
              <input
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
                className="h-8 rounded-lg border px-2"
              />
              <ActionButton action={() => pauseBookingAction(bookingId, from, until)}>
                Pause
              </ActionButton>
            </div>
          )}
        </div>
      ) : null}
      {open ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            Cancel {recurring ? "series" : "booking"}
          </p>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason"
            className="h-8 w-full rounded-lg border px-2"
          />
          <ActionButton
            action={() => cancelBookingAction(bookingId, reason)}
            variant="destructive"
            confirm="Cancel all remaining visits? Fees are waived for admin cancellations."
          >
            Cancel all future visits
          </ActionButton>
        </div>
      ) : null}
    </div>
  );
}
