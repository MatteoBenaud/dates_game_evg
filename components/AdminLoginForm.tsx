'use client'

import { useActionState } from 'react'
import { loginAdmin, type AdminAuthState } from '@/app/admin/actions'

const initialState: AdminAuthState = {}

export default function AdminLoginForm() {
  const [state, action, pending] = useActionState(loginAdmin, initialState)

  return (
    <form action={action} className="glass-panel w-full max-w-md rounded-[32px] p-8">
      <p className="mb-3 text-center text-xs font-black uppercase tracking-[0.3em] text-[var(--ink-3)]">Admin</p>
      <h1 className="section-title mb-4 text-center text-4xl font-black text-[var(--ink-1)]">
        Accès protégé
      </h1>
      <p className="mb-6 text-center text-[var(--ink-2)]">
        Entre le mot de passe admin pour gérer les parties.
      </p>

      {state.error && (
        <div className="mb-4 rounded-[20px] border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-red-800">
          {state.error}
        </div>
      )}

      <label className="mb-3 block text-sm font-black uppercase tracking-[0.2em] text-[var(--ink-3)]" htmlFor="admin-password">
        Mot de passe
      </label>
      <input
        id="admin-password"
        name="password"
        type="password"
        autoComplete="current-password"
        className="w-full rounded-[20px] border border-[var(--line-soft)] bg-white/85 px-4 py-4 text-lg text-[var(--ink-1)] outline-none"
        required
      />

      <button
        type="submit"
        disabled={pending}
        className="action-primary mt-6 w-full rounded-[20px] px-6 py-4 text-lg font-black uppercase tracking-[0.14em] disabled:opacity-50"
      >
        {pending ? 'Connexion...' : 'Entrer'}
      </button>
    </form>
  )
}
