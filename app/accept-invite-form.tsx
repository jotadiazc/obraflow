"use client";

import { FormEvent, useState } from "react";

export function AcceptInviteForm({ token }: { token: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== form.get("confirmPassword")) {
      setError("Las contraseñas no coinciden.");
      setBusy(false);
      return;
    }
    try {
      const response = await fetch("/api/invites/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password, displayName: form.get("displayName") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "No se pudo aceptar la invitación.");
      window.location.assign("/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo aceptar la invitación.");
    } finally {
      setBusy(false);
    }
  }

  return <>
    <h1 className="mt-2 text-2xl font-bold">Crea tu acceso</h1>
    <p className="mt-2 text-sm leading-6 text-slate-600">La invitación fue creada por un administrador. Elige una contraseña para activar tu cuenta.</p>
    <form className="mt-6 grid gap-4" onSubmit={submit}>
      <label className="grid gap-1.5 text-sm font-medium">Nombre
        <input className="rounded-xl border border-slate-300 px-3 py-2.5" type="text" name="displayName" maxLength={100} autoComplete="name" />
      </label>
      <label className="grid gap-1.5 text-sm font-medium">Contraseña nueva
        <input className="rounded-xl border border-slate-300 px-3 py-2.5" type="password" name="password" minLength={12} maxLength={128} autoComplete="new-password" required />
        <span className="text-xs font-normal text-slate-500">Debe tener al menos 12 caracteres.</span>
      </label>
      <label className="grid gap-1.5 text-sm font-medium">Repite la contraseña
        <input className="rounded-xl border border-slate-300 px-3 py-2.5" type="password" name="confirmPassword" minLength={12} maxLength={128} autoComplete="new-password" required />
      </label>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</p>}
      <button className="mt-1 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-60" disabled={busy}>{busy ? "Activando cuenta…" : "Crear cuenta"}</button>
    </form>
  </>;
}
