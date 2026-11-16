"use client";

import { locale } from "@/modules/shared/country";

/** Last-resort boundary when the root layout itself fails; renders its own document. */
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang={locale}>
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 16,
          textAlign: "center",
        }}
      >
        <title>Something went wrong</title>
        <div>
          <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
          <p style={{ color: "#666" }}>Please try again in a moment.</p>
          <button
            onClick={() => retry()}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "1px solid #ccc",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
