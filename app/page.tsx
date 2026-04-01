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
    <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8 bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Jeu de Dates
          </h1>
          <p className="text-gray-600">
            Devine les dates, gagne des points !
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {/* Create Game */}
          <div className="space-y-3">
            <button
              onClick={handleCreateGame}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
            >
              {loading ? 'Création...' : 'Créer une partie'}
            </button>
            <p className="text-sm text-gray-500 text-center">
              Pour organiser une soirée
            </p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">ou</span>
            </div>
          </div>

          {/* Join Game */}
          <form onSubmit={handleJoinGame} className="space-y-3">
            <input
              type="text"
              placeholder="Code à 6 chiffres"
              value={gameCode}
              onChange={(e) => setGameCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              maxLength={6}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-center text-2xl font-mono tracking-wider"
              required
            />
            <button
              type="submit"
              disabled={loading || gameCode.length !== 6}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
            >
              {loading ? 'Connexion...' : 'Rejoindre une partie'}
            </button>
            <p className="text-sm text-gray-500 text-center">
              Pour jouer avec tes amis
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
