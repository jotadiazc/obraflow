import { getCurrentUser } from "./auth";
import { LoginForm } from "./login-form";
import { AcceptInviteForm } from "./accept-invite-form";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-slate-900">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-2xl font-bold text-white">↗</div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Control de instalaciones</p>
          {params.invite ? <AcceptInviteForm token={params.invite} /> : <LoginForm />}
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col bg-slate-100">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
        <div className="flex items-center gap-2 font-bold text-slate-900"><span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-600 text-white">↗</span>ObraFlow</div>
        <div className="flex items-center gap-3 text-xs text-slate-600">
          <span className="hidden sm:inline">{user.displayName}</span>
          <span className="rounded-full bg-slate-100 px-2 py-1">{user.role === "admin" ? "Administrador" : "Operario"}</span>
          <form action="/api/auth/logout" method="post"><button className="font-semibold text-blue-700" type="submit">Cerrar sesión</button></form>
        </div>
      </header>
      <iframe title="Aplicación ObraFlow" src="/legacy.html" className="min-h-0 w-full flex-1 border-0" />
    </main>
  );
}
