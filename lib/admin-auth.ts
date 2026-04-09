import { createHash } from 'node:crypto'
import { cookies } from 'next/headers'

const ADMIN_COOKIE_NAME = 'dates_admin_session'
const ONE_WEEK_IN_SECONDS = 60 * 60 * 24 * 7

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || ''
}

function buildSessionValue(password: string) {
  return createHash('sha256').update(`dates-admin:${password}`).digest('hex')
}

export function isAdminPasswordConfigured() {
  return getAdminPassword().length > 0
}

export async function isAdminAuthenticated() {
  const configuredPassword = getAdminPassword()
  if (!configuredPassword) return false

  const cookieStore = await cookies()
  const currentValue = cookieStore.get(ADMIN_COOKIE_NAME)?.value

  return currentValue === buildSessionValue(configuredPassword)
}

export async function setAdminSession() {
  const configuredPassword = getAdminPassword()
  if (!configuredPassword) {
    throw new Error('ADMIN_PASSWORD is not configured')
  }

  const cookieStore = await cookies()
  cookieStore.set(ADMIN_COOKIE_NAME, buildSessionValue(configuredPassword), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: ONE_WEEK_IN_SECONDS,
  })
}

export async function clearAdminSession() {
  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_COOKIE_NAME)
}

export function verifyAdminPassword(candidate: string) {
  const configuredPassword = getAdminPassword()
  if (!configuredPassword) return false

  return candidate === configuredPassword
}
