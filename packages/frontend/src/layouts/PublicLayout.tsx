import { Outlet } from 'react-router-dom';

export default function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-7 h-7 rounded bg-gradient-to-br from-space-s to-space-e" />
          <span className="font-semibold">SPACE Survey</span>
        </div>
      </header>
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
