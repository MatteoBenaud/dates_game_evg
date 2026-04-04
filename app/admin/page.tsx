'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { GameStatus } from '@/types/game.types'

interface GameWithStats {
  id: string
  code: string
  status: GameStatus
  created_at: string | null
  player_count: number
  question_count: number
}

interface GamesWithStatsRow {
  id: string
  code: string
  status: string
  created_at: string | null
  player_count: number
  question_count: number
}

export default function AdminDashboard() {
  const router = useRouter()
  const [games, setGames] = useState<GameWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | GameStatus>('all')

  useEffect(() => {
    loadGames()
  }, [])

  const loadGames = async () => {
    try {
      const { data: gamesData } = await supabase.rpc('get_games_with_stats')

      if (gamesData) {
        const gamesWithStats = (gamesData as GamesWithStatsRow[]).map((game) => ({
          id: game.id,
          code: game.code,
          status: game.status as GameStatus,
          created_at: game.created_at,
          player_count: Number(game.player_count) || 0,
          question_count: Number(game.question_count) || 0,
        }))

        setGames(gamesWithStats)
      }

      setLoading(false)
    } catch (error) {
      console.error('Error loading games:', error)
      setLoading(false)
    }
  }

  const handleDeleteGame = async (gameId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette partie ?')) return

    try {
      await supabase.from('games').delete().eq('id', gameId)
      loadGames()
    } catch (error) {
      console.error('Error deleting game:', error)
      alert('Erreur lors de la suppression')
    }
  }

  const handleLaunchGame = async (gameId: string) => {
    try {
      await supabase.from('games').update({ host_ready: true }).eq('id', gameId)
      router.push(`/host/${gameId}`)
    } catch (error) {
      console.error('Error launching game:', error)
    }
  }

  const handleDuplicateGame = async (gameId: string) => {
    try {
      const { data: questions } = await supabase
        .from('questions')
        .select('*')
        .eq('game_id', gameId)
        .order('question_number', { ascending: true })

      const { data: newCode } = await supabase.rpc('generate_game_code')

      if (!newCode) throw new Error('Failed to generate game code')

      const { data: newGame, error: gameError } = await supabase
        .from('games')
        .insert([
          {
            code: newCode,
            status: 'waiting',
            current_question_index: 0,
          },
        ])
        .select()
        .single()

      if (gameError) throw gameError

      if (questions) {
        const newQuestions = questions.map((q) => ({
          game_id: newGame.id,
          question_number: q.question_number,
          text: q.text,
          correct_date: q.correct_date,
          status: 'locked',
        }))

        await supabase.from('questions').insert(newQuestions)
      }

      alert(`Partie dupliquée ! Nouveau code : ${newCode}`)
      loadGames()
    } catch (error) {
      console.error('Error duplicating game:', error)
      alert('Erreur lors de la duplication')
    }
  }

  const filteredGames = games.filter((game) => (filter === 'all' ? true : game.status === filter))

  const getStatusBadge = (status: GameStatus) => {
    const badges = {
      waiting: 'bg-amber-100 text-amber-900',
      started: 'bg-emerald-100 text-emerald-900',
      finished: 'bg-slate-200 text-slate-800',
    }
    const labels = {
      waiting: 'En attente',
      started: 'En cours',
      finished: 'Terminée',
    }

    return <span className={`status-pill ${badges[status]}`}>{labels[status]}</span>
  }

  if (loading) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center px-6">
        <div className="glass-panel rounded-[32px] px-10 py-8 text-center">
          <p className="section-title text-3xl font-black text-[var(--ink-1)]">Chargement du dashboard</p>
          <p className="mt-3 text-[var(--ink-2)]">Récupération des parties et de leurs statistiques.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="mb-3 text-sm font-black uppercase tracking-[0.28em] text-[var(--ink-3)]">Back office</p>
            <h1 className="section-title text-5xl font-black text-[var(--ink-1)] md:text-6xl">Piloter toutes les parties.</h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-[var(--ink-2)]">
              Visualise les salons, relance une session, duplique une sélection de questions et garde une vue nette sur l’état global.
            </p>
          </div>

          <div className="glass-panel rounded-[30px] p-6">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="metric-card rounded-[24px] p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.25em] text-[var(--ink-3)]">Total</p>
                <p className="mt-2 text-3xl font-black text-[var(--ink-1)]">{games.length}</p>
              </div>
              <div className="metric-card rounded-[24px] p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.25em] text-[var(--ink-3)]">Actives</p>
                <p className="mt-2 text-3xl font-black text-[var(--accent)]">{games.filter((g) => g.status === 'started').length}</p>
              </div>
              <div className="metric-card rounded-[24px] p-4">
                <p className="text-[11px] font-black uppercase tracking-[0.25em] text-[var(--ink-3)]">Questions</p>
                <p className="mt-2 text-3xl font-black text-[var(--brand)]">{games.reduce((sum, game) => sum + game.question_count, 0)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="glass-panel mb-6 rounded-[30px] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-3">
              {[
                ['all', `Toutes (${games.length})`],
                ['waiting', `En attente (${games.filter((g) => g.status === 'waiting').length})`],
                ['started', `En cours (${games.filter((g) => g.status === 'started').length})`],
                ['finished', `Terminées (${games.filter((g) => g.status === 'finished').length})`],
              ].map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setFilter(value as 'all' | GameStatus)}
                  className={`rounded-full px-4 py-2 text-sm font-black uppercase tracking-[0.2em] transition-colors ${
                    filter === value ? 'action-secondary' : 'action-ghost hover:bg-white'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={() => router.push('/')}
              className="action-primary rounded-[18px] px-6 py-3 text-sm font-black uppercase tracking-[0.2em] transition-transform hover:-translate-y-0.5"
            >
              Nouvelle partie
            </button>
          </div>
        </div>

        {filteredGames.length === 0 ? (
          <div className="glass-panel rounded-[30px] p-12 text-center">
            <p className="section-title text-3xl font-black text-[var(--ink-1)]">Aucune partie visible</p>
            <p className="mt-3 text-[var(--ink-2)]">Essaie un autre filtre ou crée une nouvelle session.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredGames.map((game) => (
              <div key={game.id} className="glass-panel rounded-[28px] p-6 transition-transform hover:-translate-y-1">
                <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                  <div className="grid flex-1 gap-4 md:grid-cols-4">
                    <div className="metric-card rounded-[22px] p-4">
                      <p className="text-[11px] font-black uppercase tracking-[0.25em] text-[var(--ink-3)]">Code</p>
                      <p className="mt-2 font-mono text-3xl font-black text-[var(--brand)]">{game.code}</p>
                    </div>
                    <div className="metric-card rounded-[22px] p-4">
                      <p className="text-[11px] font-black uppercase tracking-[0.25em] text-[var(--ink-3)]">Statut</p>
                      <div className="mt-3">{getStatusBadge(game.status)}</div>
                    </div>
                    <div className="metric-card rounded-[22px] p-4">
                      <p className="text-[11px] font-black uppercase tracking-[0.25em] text-[var(--ink-3)]">Joueurs</p>
                      <p className="mt-2 text-3xl font-black text-[var(--ink-1)]">{game.player_count}</p>
                    </div>
                    <div className="metric-card rounded-[22px] p-4">
                      <p className="text-[11px] font-black uppercase tracking-[0.25em] text-[var(--ink-3)]">Questions</p>
                      <p className="mt-2 text-3xl font-black text-[var(--ink-1)]">{game.question_count}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 xl:w-[360px] xl:justify-end">
                    <div className="mr-auto self-center text-sm text-[var(--ink-2)] xl:mr-0 xl:w-full xl:text-right">
                      Créée le{' '}
                      {game.created_at ? new Date(game.created_at).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      }) : 'N/A'}
                    </div>
                    <button onClick={() => router.push(`/admin/${game.id}`)} className="action-secondary rounded-[16px] px-4 py-3 text-sm font-black uppercase tracking-[0.18em]">
                      Gérer
                    </button>
                    <button onClick={() => handleLaunchGame(game.id)} className="action-primary rounded-[16px] px-4 py-3 text-sm font-black uppercase tracking-[0.18em]">
                      Lancer
                    </button>
                    <button onClick={() => handleDuplicateGame(game.id)} className="action-ghost rounded-[16px] px-4 py-3 text-sm font-black uppercase tracking-[0.18em]">
                      Dupliquer
                    </button>
                    <button onClick={() => handleDeleteGame(game.id)} className="rounded-[16px] bg-red-600 px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-white">
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
