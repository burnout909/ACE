"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setBusy(false);
    if (res.ok) {
      router.push("/admin");
      router.refresh();
    } else {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "80px auto", fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 20, marginBottom: 24 }}>ACE 관리자 로그인</h1>
      <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
        <input
          type="email"
          placeholder="이메일"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
        />
        <input
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          style={{ padding: 10, border: "1px solid #ccc", borderRadius: 6 }}
        />
        <button
          type="submit"
          disabled={busy || !email || !password}
          style={{ padding: 10, borderRadius: 6, background: "#111", color: "#fff", border: 0 }}
        >
          {busy ? "확인 중…" : "로그인"}
        </button>
        {error && <p style={{ color: "#c00", fontSize: 13 }}>{error}</p>}
      </form>
    </div>
  );
}
