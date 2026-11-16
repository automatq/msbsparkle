"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopySnippet({ code, testId }: { code: string; testId?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2">
      <pre
        className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs"
        data-testid={testId}
      >
        <code>{code}</code>
      </pre>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}
