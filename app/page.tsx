'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const router = useRouter()
  const [gameCode, setGameCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreateGame = async () => {
    setLoading(true)
    setError('')

    try {
      // Generate game code using Supabase function
      const { data: codeData, error: codeError } = await supabase.rpc('generate_game_code')

      if (codeError) throw codeError

      // Create game in database
      const { data: game, error: gameError } = await supabase
        .from('games')
        .insert([
          {
            code: codeData,
            status: 'waiting',
            current_question_index: 0,
          },
        ])
        .select()
        .single()

      if (gameError) throw gameError

      // Redirect to host page
      router.push(`/host/${game.id}`)
    } catch (err) {
      console.error('Error creating game:', err)
      setError('Erreur lors de la création de la partie')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinGame = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Check if game exists
      const { data: game, error: gameError } = await supabase
        .from('games')
        .select('id')
        .eq('code', gameCode)
        .single()

      if (gameError || !game) {
        setError('Code de partie invalide')
        setLoading(false)
        return
      }

      // Redirect to player page
      router.push(`/play/${game.id}`)
    } catch (err) {
      console.error('Error joining game:', err)
      setError('Erreur lors de la connexion à la partie')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app-shell overflow-hidden px-4 py-8 md:px-8 md:py-10">
      <div className="floating-orb left-[8%] top-24 h-32 w-32 bg-[rgba(216,87,42,0.18)]" />
      <div className="floating-orb right-[12%] top-40 h-40 w-40 bg-[rgba(15,118,110,0.18)]" />
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="relative">
          <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-[var(--line-strong)] bg-white/60 px-4 py-2 text-sm font-semibold text-[var(--ink-2)] backdrop-blur">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--brand)]" />
            Soiree multijoueur en direct
          </div>
          <h1 className="section-title display-font max-w-3xl text-5xl font-black leading-[0.95] text-[var(--ink-1)] md:text-7xl">
            Faites deviner l’histoire
            <span className="block text-[var(--brand)]">une date a la fois.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--ink-2)] md:text-xl">
            Cree une partie, lance les questions depuis l’ecran host et laisse les joueurs viser la date la plus proche.
            L’interface est pensee pour une salle, un ecran partage et des reponses en direct.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              ['Temps reel', 'Admin, host et joueurs synchronises'],
              ['Scores lisibles', 'Classement instantane apres chaque reveal'],
              ['Setup simple', 'Un code, un lien, la partie commence'],
            ].map(([title, text]) => (
              <div key={title} className="soft-panel rounded-[24px] p-5">
                <p className="text-sm font-black uppercase tracking-[0.24em] text-[var(--ink-3)]">{title}</p>
                <p className="mt-3 text-sm leading-6 text-[var(--ink-2)]">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-panel relative rounded-[32px] p-6 sm:p-8">
          <div className="absolute right-6 top-6 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-black uppercase tracking-[0.24em] text-[var(--accent)]">
            Live room
          </div>
          <div className="mb-8">
            <p className="text-sm font-black uppercase tracking-[0.28em] text-[var(--ink-3)]">Jeu de Dates</p>
            <h2 className="section-title mt-3 text-4xl font-black text-[var(--ink-1)]">Choisir une entree</h2>
            <p className="mt-3 text-[15px] leading-7 text-[var(--ink-2)]">
              Lancement cote host, connexion cote player. Meme partie, deux rythmes.
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-[24px] border border-red-200 bg-[var(--danger-soft)] px-5 py-4 text-sm font-medium text-red-800">
              {error}
            </div>
          )}

          <div className="space-y-6">
            <div className="soft-panel rounded-[28px] p-5">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--ink-3)]">Organiser</p>
              <h3 className="mt-2 text-2xl font-black text-[var(--ink-1)]">Creer une nouvelle partie</h3>
              <p className="mt-2 text-sm leading-6 text-[var(--ink-2)]">Installe le salon, prepare les questions puis ouvre l’ecran host.</p>
              <button
                onClick={handleCreateGame}
                disabled={loading}
                className="action-primary mt-5 w-full rounded-[20px] px-6 py-4 text-lg font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-50"
              >
                {loading ? 'Creation...' : 'Creer une partie'}
              </button>
            </div>

            <div className="relative text-center">
              <div className="absolute inset-x-0 top-1/2 border-t border-[var(--line-soft)]" />
              <span className="relative inline-block rounded-full bg-[var(--surface-0)] px-4 text-xs font-black uppercase tracking-[0.32em] text-[var(--ink-3)]">
                ou
              </span>
            </div>

            <form onSubmit={handleJoinGame} className="soft-panel rounded-[28px] p-5">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--ink-3)]">Jouer</p>
              <h3 className="mt-2 text-2xl font-black text-[var(--ink-1)]">Rejoindre avec un code</h3>
              <div className="mt-5 rounded-[22px] border border-[var(--line-soft)] bg-white/90 p-3">
                <input
                  type="text"
                  placeholder="000000"
                  value={gameCode}
                  onChange={(e) => setGameCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  className="w-full bg-transparent px-3 py-4 text-center font-mono text-4xl font-black tracking-[0.5em] text-[var(--ink-1)] outline-none placeholder:text-[var(--ink-3)]"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={loading || gameCode.length !== 6}
                className="action-secondary mt-5 w-full rounded-[20px] px-6 py-4 text-lg font-bold transition-transform hover:-translate-y-0.5 disabled:opacity-50"
              >
                {loading ? 'Connexion...' : 'Rejoindre la partie'}
              </button>
            </form>
          </div>
        </section>
      </div>
    </main>
  )
}
