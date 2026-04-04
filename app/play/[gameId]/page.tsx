'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { GameStatus, QuestionStatus } from '@/types/game.types'

interface Game {
  id: string
  code: string
  status: GameStatus
  current_question_index: number
}

interface Question {
  id: string
  question_number: number
  text: string
  correct_date?: string
  status: QuestionStatus
}

interface Player {
  id: string
  pseudo: string
  total_score: number | null
}

interface Answer {
  id: string
  submitted_date: string
  score: number | null
}

export default function PlayerPage() {
  const params = useParams()
  const gameId = params.gameId as string

  const [pseudo, setPseudo] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [hasJoined, setHasJoined] = useState(false)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [game, setGame] = useState<Game | null>(null)
  const [gameStatus, setGameStatus] = useState<GameStatus>('waiting')
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null)
  const [myAnswer, setMyAnswer] = useState<Answer | null>(null)
  const [selectedDate, setSelectedDate] = useState('')
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Check if player already joined (using localStorage)
    const savedPlayerId = localStorage.getItem(`player_${gameId}`)
    if (savedPlayerId) {
      setPlayerId(savedPlayerId)
      setHasJoined(true)
      loadGame()
    }
  }, [gameId])

  useEffect(() => {
    if (hasJoined && game) {
      const cleanup = setupRealtimeSubscriptions()
      return cleanup
    }
  }, [hasJoined, game])

  useEffect(() => {
    if (game && game.current_question_index >= 0) {
      loadCurrentQuestion()
    }
  }, [game?.current_question_index])

  const loadGame = async () => {
    try {
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()

      if (gameError) throw gameError

      setGame(gameData as Game)
      loadPlayers()
    } catch (error) {
      console.error('Error loading game:', error)
    }
  }

  const loadPlayers = async () => {
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameId)
      .order('total_score', { ascending: true })

    setAllPlayers(data || [])
  }

  const loadCurrentQuestion = async () => {
    if (!game) return

    try {
      const { data: questions } = await supabase
        .from('questions')
        .select('*')
        .eq('game_id', gameId)
        .order('question_number', { ascending: true })

      if (questions && questions[game.current_question_index]) {
        const question = questions[game.current_question_index]

        // Only include correct_date if revealed
        setCurrentQuestion({
          id: question.id,
          question_number: question.question_number,
          text: question.text,
          status: question.status as QuestionStatus,
          correct_date: question.status === 'revealed' ? question.correct_date : undefined,
        })

        // Load my answer if exists
        if (playerId) {
          const { data: answerData } = await supabase
            .from('answers')
            .select('*')
            .eq('question_id', question.id)
            .eq('player_id', playerId)
            .single()

          setMyAnswer(answerData || null)
        }
      }
    } catch (error) {
      console.error('Error loading question:', error)
    }
  }

  const setupRealtimeSubscriptions = () => {
    const channel = supabase
      .channel(`player:${gameId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          // Update only game status locally without reload
          if (payload.new.status) {
            setGameStatus(payload.new.status as GameStatus)
          }
          if (payload.new.current_question_index !== undefined) {
            setCurrentQuestionIndex(payload.new.current_question_index)
            loadCurrentQuestion()
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'questions', filter: `game_id=eq.${gameId}` },
        () => {
          // Only reload current question
          loadCurrentQuestion()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
        () => {
          // Only reload players list
          loadPlayers()
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Check if host is ready
      const { data: gameData } = await supabase
        .from('games')
        .select('host_ready')
        .eq('id', gameId)
        .single()

      if (!gameData?.host_ready) {
        setError('La partie n\'est pas encore ouverte. Attendez que l\'hôte lance la partie.')
        setLoading(false)
        return
      }

      // Check if pseudo already taken
      const { data: existingPlayer } = await supabase
        .from('players')
        .select('id')
        .eq('game_id', gameId)
        .eq('pseudo', pseudo)
        .single()

      if (existingPlayer) {
        setError('Ce pseudo est déjà pris')
        setLoading(false)
        return
      }

      // Create player
      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert([
          {
            game_id: gameId,
            pseudo: pseudo,
            avatar_url: avatarUrl || null,
            total_score: 0,
            connected: true,
          },
        ])
        .select()
        .single()

      if (playerError) throw playerError

      setPlayerId(player.id)
      localStorage.setItem(`player_${gameId}`, player.id)
      setHasJoined(true)
      loadGame()
    } catch (error) {
      console.error('Error joining game:', error)
      setError('Erreur lors de la connexion')
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Limit to 2MB
    if (file.size > 2 * 1024 * 1024) {
      setError('La photo doit faire moins de 2MB')
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      setAvatarUrl(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmitAnswer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!playerId || !currentQuestion) return

    setLoading(true)

    try {
      const { error } = await supabase
        .from('answers')
        .insert([
          {
            question_id: currentQuestion.id,
            player_id: playerId,
            submitted_date: selectedDate,
          },
        ])

      if (error) throw error

      setSelectedDate('')
      loadCurrentQuestion()
    } catch (error) {
      console.error('Error submitting answer:', error)
      alert('Erreur lors de la soumission de la réponse')
    } finally {
      setLoading(false)
    }
  }

  // Join screen
  if (!hasJoined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">
            Rejoindre la partie
          </h1>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-gray-700 font-medium mb-2">
                Entre ton pseudo
              </label>
              <input
                type="text"
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                placeholder="Ton pseudo"
                maxLength={20}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg"
                required
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-2">
                Ajoute une photo (optionnel)
              </label>
              <div className="flex items-center gap-4">
                {avatarUrl && (
                  <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-purple-500 flex-shrink-0">
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  </div>
                )}
                <label className="flex-1 cursor-pointer">
                  <div className="w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 transition-colors text-center">
                    <span className="text-gray-600">
                      {avatarUrl ? 'Changer la photo' : 'Choisir une photo'}
                    </span>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !pseudo.trim()}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
            >
              {loading ? 'Connexion...' : 'Rejoindre'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Waiting for game to start
  if (game?.status === 'waiting') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 text-center">
          <div className="mb-6">
            <div className="w-20 h-20 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              En attente du démarrage...
            </h1>
            <p className="text-gray-600">
              La partie commencera bientôt
            </p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-2">Joueurs connectés ({allPlayers.length})</p>
            <div className="space-y-1">
              {allPlayers.map((player) => (
                <div key={player.id} className="text-gray-900 font-medium">
                  {player.pseudo}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Game finished
  if (game?.status === 'finished') {
    const myPlayerData = allPlayers.find(p => p.id === playerId)
    const myRank = allPlayers.findIndex(p => p.id === playerId) + 1

    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6 text-center">
            Partie terminée !
          </h1>

          <div className="bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl p-6 mb-6 text-center">
            <p className="text-lg mb-2">Ta position</p>
            <p className="text-5xl font-bold mb-2">#{myRank}</p>
            <p className="text-xl">{myPlayerData?.total_score} points</p>
          </div>

          <div className="space-y-3">
            <h2 className="text-xl font-bold text-gray-900">Classement final</h2>
            {allPlayers.map((player, index) => (
              <div
                key={player.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  player.id === playerId ? 'bg-purple-100 border-2 border-purple-500' : 'bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl font-bold text-gray-400">#{index + 1}</span>
                  <span className="font-semibold text-gray-900">{player.pseudo}</span>
                </div>
                <span className="font-bold text-gray-900">{player.total_score}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Playing
  if (!currentQuestion) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center p-4">
        <div className="text-white text-2xl">Chargement...</div>
      </div>
    )
  }

  const questionStatus = currentQuestion.status

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 to-pink-600 p-4">
      <div className="max-w-md mx-auto pt-8">
        <div className="bg-white rounded-2xl shadow-2xl p-6 mb-4">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-medium text-gray-600">
              Question {currentQuestion.question_number} / 10
            </span>
            <span className="text-sm font-medium text-gray-600">
              Score: {allPlayers.find(p => p.id === playerId)?.total_score || 0}
            </span>
          </div>

          <div className="bg-purple-50 border-2 border-purple-500 rounded-xl p-4 mb-6">
            <p className="text-lg font-semibold text-gray-900">{currentQuestion.text}</p>
          </div>

          {/* Question locked */}
          {questionStatus === 'locked' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-gray-600">En attente de la question...</p>
            </div>
          )}

          {/* Question open - answer form */}
          {questionStatus === 'open' && !myAnswer && (
            <form onSubmit={handleSubmitAnswer} className="space-y-4">
              <div>
                <label className="block text-gray-700 font-medium mb-2">
                  Sélectionne une date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading || !selectedDate}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
              >
                {loading ? 'Envoi...' : 'Valider ma réponse'}
              </button>
            </form>
          )}

          {/* Answer submitted, waiting for reveal */}
          {questionStatus === 'open' && myAnswer && (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-lg font-semibold text-gray-900 mb-2">Réponse enregistrée !</p>
              <p className="text-gray-600 mb-4">
                Ta réponse: {new Date(myAnswer.submitted_date).toLocaleDateString('fr-FR')}
              </p>
              <p className="text-sm text-gray-500">En attente du reveal...</p>
            </div>
          )}

          {/* Revealed */}
          {questionStatus === 'revealed' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border-2 border-blue-500 rounded-xl p-4">
                <p className="text-sm text-gray-600 mb-1">Bonne réponse:</p>
                <p className="text-xl font-bold text-gray-900">
                  {currentQuestion.correct_date &&
                    new Date(currentQuestion.correct_date).toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                </p>
              </div>

              {myAnswer && (
                <div className="bg-purple-50 border-2 border-purple-500 rounded-xl p-4">
                  <p className="text-sm text-gray-600 mb-1">Ta réponse:</p>
                  <p className="text-xl font-bold text-gray-900 mb-2">
                    {new Date(myAnswer.submitted_date).toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                  <p className="text-2xl font-bold text-purple-600">
                    Écart: {myAnswer.score} jours
                  </p>
                </div>
              )}

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-2">Classement actuel</p>
                <div className="space-y-2">
                  {allPlayers.slice(0, 5).map((player, index) => (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between ${
                        player.id === playerId ? 'font-bold text-purple-600' : 'text-gray-700'
                      }`}
                    >
                      <span>#{index + 1} {player.pseudo}</span>
                      <span>{player.total_score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
