import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from '@/types/database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Singleton pattern using globalThis to survive Next.js hot-reload
declare global {
  var __supabase: SupabaseClient<Database> | undefined
}

function getSupabaseClient(): SupabaseClient<Database> {
  if (!globalThis.__supabase) {
    globalThis.__supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      realtime: {
        // Web Worker pour éviter le throttling des onglets en arrière-plan
        worker: true,
      },
    })
  }
  return globalThis.__supabase
}

export const supabase = getSupabaseClient()
