"use client";

import { useEffect } from "react";

/**
 * Last-resort screen when the root layout itself fails. It renders its own document
 * without the app's stylesheet, so styles are inline and it follows the OS theme.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          colorScheme: "light dark",
          textAlign: "center",
          padding: 24,
        }}
      >
        <title>Something went wrong · Hilltop</title>
        <div>
          <h1 style={{ fontSize: 24, margin: 0 }}>Hilltop is having trouble</h1>
          <p style={{ opacity: 0.7, maxWidth: 360 }}>Please try again in a moment. Your orders and payments are safe.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 16,
              padding: "12px 20px",
              borderRadius: 12,
              border: 0,
              background: "#761d27",
              color: "white",
              fontSize: 15,
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
