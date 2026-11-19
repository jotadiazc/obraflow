import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const user = await getChatGPTUser();
  const params = await searchParams;

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-slate-900">
        <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-2xl font-bold text-white">↗</div>
          <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-600">Control de instalaciones</p>
          <h1 className="mt-2 text-2xl font-bold">Ingresa a ObraFlow</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">Accede para consultar tus órdenes, registrar avances y respaldar recepciones de trabajo.</p>
          <a className="mt-6 inline-flex rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white" href={chatGPTSignInPath("/")} target="_top">Iniciar sesión</a>
        </section>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col bg-slate-100">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
        <div className="flex items-center gap-2 font-bold text-slate-900"><span className="grid h-8 w-8 place-items-center rounded-xl bg-blue-600 text-white">↗</span>ObraFlow</div>
        <div className="flex items-center gap-3 text-xs text-slate-600"><span className="hidden sm:inline">{user.displayName}</span><a className="font-semibold text-blue-700" href={chatGPTSignOutPath("/")} target="_top">Cerrar sesión</a></div>
      </header>
      <iframe title="Aplicación ObraFlow" src={params.invite ? `/legacy.html?invite=${encodeURIComponent(params.invite)}` : "/legacy.html"} className="min-h-0 w-full flex-1 border-0" />
    </main>
  );
}
