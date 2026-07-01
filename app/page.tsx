export default function Page() {
  return (
    <main className="flex h-screen items-center justify-center bg-slate-50">
      <div className="absolute inset-0 -z-10 opacity-60" aria-hidden="true">
        <div className="absolute left-10 top-10 h-48 w-48 rounded-full bg-[#f5f0e6] blur-3xl" />
        <div className="absolute right-24 top-8 h-64 w-64 rounded-full bg-[#e1f0ff] blur-3xl" />
        <div className="absolute bottom-10 left-1/3 h-72 w-72 rounded-full bg-[#eef7ee] blur-3xl" />
      </div>
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white/90 p-8 shadow-lg text-center">
        <h1 className="text-xl font-bold text-slate-900">ACE CPX 채점 시스템</h1>
        <p className="mt-2 text-sm text-slate-500">
          채점을 시작하려면 교수님께 전달된 링크를 열어주세요.
        </p>
      </div>
    </main>
  );
}
