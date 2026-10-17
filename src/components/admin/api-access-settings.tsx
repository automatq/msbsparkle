"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  regenerateApiKeyAction,
  revokeApiKeyAction,
  updateAllowedOriginAction,
} from "@/modules/admin/actions";

export function ApiAccessSettings({
  hasKey,
  allowedOrigin,
}: {
  hasKey: boolean;
  allowedOrigin: string | null;
}) {
  const [newKey, setNewKey] = useState<string | null>(null);
  const [origin, setOrigin] = useState(allowedOrigin ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="space-y-6 text-sm">
      <div className="space-y-3">
        <p className="text-muted-foreground">
          The <code>X-Api-Key</code> header for calls to <code>/api/v1/*</code> from your external
          frontend.
        </p>
        {newKey && (
          <p className="rounded-lg bg-amber-50 p-3 text-amber-900">
            Copy this now — it won&apos;t be shown again:{" "}
            <span className="font-mono break-all" data-testid="api-key-value">
              {newKey}
            </span>
          </p>
        )}
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await regenerateApiKeyAction();
                if (r.ok) {
                  setNewKey(r.apiKey ?? null);
                  toast.success("New API key generated");
                  router.refresh();
                } else toast.error(r.message);
              })
            }
          >
            {hasKey ? "Regenerate key" : "Generate key"}
          </Button>
          {hasKey && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await revokeApiKeyAction();
                  if (r.ok) {
                    setNewKey(null);
                    toast.success("API key revoked");
                    router.refresh();
                  } else toast.error(r.message);
                })
              }
            >
              Revoke
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-3">
        <p className="text-muted-foreground">
          Allowed origin for CORS (your frontend&apos;s URL), e.g.{" "}
          <code>https://app.example.com</code>.
        </p>
        <div className="flex items-center gap-2">
          <Input
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            placeholder="https://app.example.com"
            className="max-w-sm"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await updateAllowedOriginAction(origin);
                if (r.ok) {
                  toast.success("Saved");
                  router.refresh();
                } else toast.error(r.message);
              })
            }
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
