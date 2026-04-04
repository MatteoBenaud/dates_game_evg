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
      const { data: gamesData } = await supabase
        .from('games')
        .select('*')
        .order('created_at', { ascending: false })

      if (gamesData) {
        // Load stats for each game
        const gamesWithStats = await Promise.all(
          gamesData.map(async (game) => {
            const { count: playerCount } = await supabase
              .from('players')
              .select('*', { count: 'exact', head: true })
              .eq('game_id', game.id)

            const { count: questionCount } = await supabase
              .from('questions')
              .select('*', { count: 'exact', head: true })
              .eq('game_id', game.id)

            return {
              id: game.id,
              code: game.code,
              status: game.status as GameStatus,
              created_at: game.created_at,
              player_count: playerCount || 0,
              question_count: questionCount || 0,
            }
          })
        )

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
      // Set host_ready to true when launching from admin
      await supabase
        .from('games')
        .update({ host_ready: true })
        .eq('id', gameId)

      // Navigate to host page
      router.push(`/host/${gameId}`)
    } catch (error) {
      console.error('Error launching game:', error)
    }
  }

  const handleDuplicateGame = async (gameId: string) => {
    try {
      // Get original game questions
      const { data: questions } = await supabase
        .from('questions')
        .select('*')
        .eq('game_id', gameId)
        .order('question_number', { ascending: true })

      // Generate new code
      const { data: newCode } = await supabase.rpc('generate_game_code')

      if (!newCode) throw new Error('Failed to generate game code')

      // Create new game
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

      // Duplicate questions
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

  const filteredGames = games.filter((game) =>
    filter === 'all' ? true : game.status === filter
  )

  const getStatusBadge = (status: GameStatus) => {
    const badges = {
      waiting: 'bg-yellow-100 text-yellow-800',
      started: 'bg-green-100 text-green-800',
      finished: 'bg-gray-100 text-gray-800',
    }
    const labels = {
      waiting: 'En attente',
      started: 'En cours',
      finished: 'Terminée',
    }
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${badges[status]}`}>
        {labels[status]}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-2xl font-semibold text-gray-600">Chargement...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">🎮 Admin - Jeu de Dates</h1>
          <p className="text-gray-600">Gérez toutes vos parties en un coup d'œil</p>
        </div>

        {/* Actions & Filters */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Toutes ({games.length})
              </button>
              <button
                onClick={() => setFilter('waiting')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'waiting'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                En attente ({games.filter((g) => g.status === 'waiting').length})
              </button>
              <button
                onClick={() => setFilter('started')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'started'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                En cours ({games.filter((g) => g.status === 'started').length})
              </button>
              <button
                onClick={() => setFilter('finished')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'finished'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Terminées ({games.filter((g) => g.status === 'finished').length})
              </button>
            </div>

            <button
              onClick={() => router.push('/')}
              className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
            >
              + Nouvelle partie
            </button>
          </div>
        </div>

        {/* Games List */}
        {filteredGames.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <p className="text-gray-500 text-lg">Aucune partie trouvée</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredGames.map((game) => (
              <div key={game.id} className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-6">
                    {/* Code */}
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Code</p>
                      <p className="text-3xl font-bold font-mono text-blue-600">{game.code}</p>
                    </div>

                    {/* Status */}
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Statut</p>
                      {getStatusBadge(game.status)}
                    </div>

                    {/* Stats */}
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Joueurs</p>
                      <p className="text-xl font-semibold text-gray-900">{game.player_count}</p>
                    </div>

                    <div>
                      <p className="text-sm text-gray-500 mb-1">Questions</p>
                      <p className="text-xl font-semibold text-gray-900">{game.question_count}</p>
                    </div>

                    {/* Date */}
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Créée le</p>
                      <p className="text-sm text-gray-900">
                        {game.created_at ? new Date(game.created_at).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        }) : 'N/A'}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => router.push(`/admin/${game.id}`)}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      Gérer
                    </button>
                    <button
                      onClick={() => handleLaunchGame(game.id)}
                      className="bg-purple-600 hover:bg-purple-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      Lancer
                    </button>
                    <button
                      onClick={() => handleDuplicateGame(game.id)}
                      className="bg-gray-600 hover:bg-gray-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
                    >
                      Dupliquer
                    </button>
                    <button
                      onClick={() => handleDeleteGame(game.id)}
                      className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
                    >
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
