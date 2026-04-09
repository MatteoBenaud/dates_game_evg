'use server'

import { redirect } from 'next/navigation'
import { clearAdminSession, setAdminSession, verifyAdminPassword } from '@/lib/admin-auth'

export interface AdminAuthState {
  error?: string
}

export async function loginAdmin(_state: AdminAuthState | undefined, formData: FormData): Promise<AdminAuthState> {
  const password = String(formData.get('password') || '')

  if (!verifyAdminPassword(password)) {
    return { error: 'Mot de passe invalide' }
  }

  await setAdminSession()
  redirect('/admin')
}

export async function logoutAdmin() {
  await clearAdminSession()
  redirect('/admin')
}
