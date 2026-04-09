import type { ReactNode } from 'react'
import AdminLoginForm from '@/components/AdminLoginForm'
import { isAdminAuthenticated, isAdminPasswordConfigured } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const isConfigured = isAdminPasswordConfigured()
  const isAuthenticated = await isAdminAuthenticated()

  if (!isConfigured) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center p-4">
        <div className="glass-panel w-full max-w-lg rounded-[32px] p-8 text-center">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.3em] text-[var(--ink-3)]">Admin</p>
          <h1 className="section-title text-4xl font-black text-[var(--ink-1)]">Configuration requise</h1>
          <p className="mt-4 text-[var(--ink-2)]">
            Défini `ADMIN_PASSWORD` dans `.env.local` pour activer l’interface admin.
          </p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center p-4">
        <AdminLoginForm />
      </div>
    )
  }

  return <>{children}</>
}
