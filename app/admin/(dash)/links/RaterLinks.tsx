"use client";

import { useState } from "react";

export type RaterLink = { raterId: string; name: string; s1: string; s2: string };

function CopyRow({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 26, color: "#6b7280", fontSize: 12 }}>{label}</span>
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        style={{ flex: 1, padding: "4px 8px", border: "1px solid #e5e7eb", borderRadius: 5, fontSize: 12, fontFamily: "monospace" }}
      />
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
        style={{ padding: "4px 10px", borderRadius: 5, border: "1px solid #d1d5db", background: copied ? "#dcfce7" : "#fff", fontSize: 12, cursor: "pointer" }}
      >
        {copied ? "복사됨" : "복사"}
      </button>
    </div>
  );
}

export default function RaterLinks({ rows }: { rows: RaterLink[] }) {
  return (
    <div style={{ display: "grid", gap: 16, maxWidth: 820 }}>
      {rows.map((r) => (
        <div key={r.raterId} style={{ border: "1px solid #eee", borderRadius: 8, padding: 12 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            {r.name} <span style={{ color: "#9ca3af", fontWeight: 400 }}>({r.raterId})</span>
          </div>
          <div style={{ display: "grid", gap: 6 }}>
            <CopyRow label="S1" url={r.s1} />
            <CopyRow label="S2" url={r.s2} />
          </div>
        </div>
      ))}
    </div>
  );
}
