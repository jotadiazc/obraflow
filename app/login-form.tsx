"use client";

import { FormEvent, useState } from "react";

export function LoginForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo iniciar sesión.");
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <h1 className="mt-2 text-2xl font-bold">Ingresa a ObraFlow</h1>
    <p className="mt-2 text-sm leading-6 text-slate-600">Usa el correo y la contraseña que te asignó el administrador.</p>
    <form className="mt-6 grid gap-4" onSubmit={submit}>
      <label className="grid gap-1.5 text-sm font-medium">Correo electrónico
        <input className="rounded-xl border border-slate-300 px-3 py-2.5" type="email" name="email" autoComplete="username" required />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">Contraseña
        <input className="rounded-xl border border-slate-300 px-3 py-2.5" type="password" name="password" autoComplete="current-password" required />
      </label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <button className="mt-1 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60" disabled={busy}>{busy ? "Ingresando…" : "Iniciar sesión"}</button>
    </form>
    <p className="mt-4 text-xs leading-5 text-slate-500">¿Necesitas una cuenta o restablecer tu acceso? Contacta al administrador de ObraFlow.</p>
  </>;
}
