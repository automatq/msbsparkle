"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { updateCustomerNotesAction } from "@/modules/admin/actions";
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
