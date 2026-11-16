"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { anonymizeCustomerAction, updateCustomerNotesAction } from "@/modules/admin/actions";
import { ActionButton } from "./ui";

export function CustomerNotes({ customerId, notes }: { customerId: string; notes: string }) {
  const [v, setV] = useState(notes);
  return (
    <div className="space-y-2">
      <Textarea
        value={v}
        onChange={(e) => setV(e.target.value)}
        rows={3}
        placeholder="Internal notes (preferences, access, history)"
      />
      <ActionButton action={() => updateCustomerNotesAction(customerId, v)}>
        Save notes
      </ActionButton>
    </div>
  );
}

export function AnonymizeButton({
  customerId,
  anonymized,
}: {
  customerId: string;
  anonymized: boolean;
}) {
  if (anonymized)
    return (
      <p className="text-xs text-muted-foreground">Personal data was removed from this customer.</p>
    );
  return (
    <ActionButton
      action={() => anonymizeCustomerAction(customerId)}
      variant="destructive"
      size="sm"
      confirm="Remove this customer's personal data (name, contact, addresses, notes, cards)? Bookings and charges are kept for accounting. This cannot be undone."
    >
      Delete personal data
    </ActionButton>
  );
}
