'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { GameStatus, QuestionStatus } from '@/types/game.types'
import { calculateScore } from '@/utils/score'
import AnimatedLeaderboard from '@/components/AnimatedLeaderboard'
import BubbleLobby from '@/components/BubbleLobby'
import TimelineReveal from '@/components/TimelineReveal'

interface Player {
  id: string
  pseudo: string
  total_score: number | null
  connected: boolean | null
}

interface Question {
  id: string
  question_number: number
  text: string
  correct_date: string
  status: QuestionStatus
}

interface Answer {
  id: string
  player_id: string
  submitted_date: string
  score: number | null
}

export default function HostPage() {
  const params = useParams()
  const router = useRouter()
  const gameId = params.gameId as string

  const [gameStatus, setGameStatus] = useState<GameStatus>('waiting')
  const [gameCode, setGameCode] = useState('')
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [players, setPlayers] = useState<Player[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Answer[]>([])
  const [loading, setLoading] = useState(true)
  const [showTimeline, setShowTimeline] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)


  useEffect(() => {
    loadGame()
    const cleanup = setupRealtimeSubscriptions()
    return cleanup
  }, [gameId])


  const loadGame = async () => {
    try {
      // Load game
      const { data: game, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()

      if (gameError) throw gameError

      // Set host_ready to true when host opens the page
      await supabase
        .from('games')
        .update({ host_ready: true })
        .eq('id', gameId)

      setGameCode(game.code)
      setGameStatus(game.status as GameStatus)
      setCurrentQuestionIndex(game.current_question_index)

      // Load players
      const { data: playersData } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', gameId)
        .order('joined_at', { ascending: true })

      setPlayers(playersData || [])

      // Load questions
      const { data: questionsData } = await supabase
        .from('questions')
        .select('*')
        .eq('game_id', gameId)
        .order('question_number', { ascending: true })

      setQuestions((questionsData || []).map(q => ({
        ...q,
        status: q.status as QuestionStatus
      })))

      // Load answers for current question
      if (questionsData && questionsData.length > 0) {
        loadAnswers(questionsData[game.current_question_index]?.id)
      }

      setLoading(false)
    } catch (error) {
      console.error('Error loading game:', error)
      setLoading(false)
    }
  }

  const loadAnswers = async (questionId: string) => {
    if (!questionId) return

    const { data } = await supabase
      .from('answers')
      .select('*')
      .eq('question_id', questionId)

    setAnswers(data || [])
  }

  const setupRealtimeSubscriptions = () => {
    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
        () => loadGame()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'answers' },
        async (payload) => {
          console.log('Answer change detected:', payload)
          // Reload answers for current question
          const { data: questionsData } = await supabase
            .from('questions')
            .select('*')
            .eq('game_id', gameId)
            .order('question_number', { ascending: true })

          const { data: gameData } = await supabase
            .from('games')
            .select('current_question_index')
            .eq('id', gameId)
            .single()

          if (questionsData && gameData && questionsData[gameData.current_question_index]) {
            loadAnswers(questionsData[gameData.current_question_index].id)
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        () => loadGame()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'questions' },
        () => loadGame()
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }


  const handleStartGame = async () => {
    try {
      // Update game status
      const { error } = await supabase
        .from('games')
        .update({ status: 'started' })
        .eq('id', gameId)

      if (error) throw error

      // Open first question automatically
      if (questions.length > 0) {
        await supabase
          .from('questions')
          .update({ status: 'open' })
          .eq('id', questions[0].id)
      }

      setGameStatus('started')
      await loadGame()
    } catch (error) {
      console.error('Error starting game:', error)
    }
  }


  const handleRevealQuestion = async () => {
    const currentQuestion = questions[currentQuestionIndex]
    if (!currentQuestion) return

    try {
      // Calculate scores for all answers
      for (const answer of answers) {
        const score = calculateScore(answer.submitted_date, currentQuestion.correct_date)

        await supabase
          .from('answers')
          .update({ score })
          .eq('id', answer.id)
      }

      // Reload answers with scores
      await loadAnswers(currentQuestion.id)

      // Mark question as revealed
      await supabase
        .from('questions')
        .update({ status: 'revealed' })
        .eq('id', currentQuestion.id)

      // Show timeline animation
      setShowTimeline(true)
      setShowLeaderboard(false)
    } catch (error) {
      console.error('Error revealing question:', error)
    }
  }

  const handleTimelineComplete = async () => {
    const currentQuestion = questions[currentQuestionIndex]

    // Update player total scores
    for (const player of players) {
      const playerAnswers = await supabase
        .from('answers')
        .select('score, question_id')
        .eq('player_id', player.id)
        .in('question_id', questions.map(q => q.id))

      const totalScore = playerAnswers.data?.reduce((sum, a) => sum + (a.score || 0), 0) || 0

      await supabase
        .from('players')
        .update({ total_score: totalScore })
        .eq('id', player.id)
    }

    // Reload players with updated scores
    await loadGame()

    // Hide timeline, show leaderboard
    setShowTimeline(false)
    setShowLeaderboard(true)
  }

  const handleNextQuestion = async () => {
    const nextIndex = currentQuestionIndex + 1

    // Reset timeline and leaderboard states
    setShowTimeline(false)
    setShowLeaderboard(false)

    if (nextIndex >= questions.length) {
      // Finish game
      await supabase
        .from('games')
        .update({ status: 'finished' })
        .eq('id', gameId)

      setGameStatus('finished')
    } else {
      // Update game index
      await supabase
        .from('games')
        .update({ current_question_index: nextIndex })
        .eq('id', gameId)

      // Open next question automatically
      await supabase
        .from('questions')
        .update({ status: 'open' })
        .eq('id', questions[nextIndex].id)

      setCurrentQuestionIndex(nextIndex)
      loadAnswers(questions[nextIndex].id)
      await loadGame()
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-2xl font-semibold text-gray-600">Chargement...</div>
      </div>
    )
  }

  // Redirect to admin if no questions configured
  if (questions.length === 0 && gameStatus === 'waiting') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-8">
        <div className="max-w-md bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Partie non configurée</h1>
          <p className="text-gray-600 mb-6">
            Cette partie n'a pas encore de questions. Configurez-la depuis l'interface admin.
          </p>
          <button
            onClick={() => router.push(`/admin/${gameId}`)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
          >
            → Aller à l'admin
          </button>
        </div>
      </div>
    )
  }

  const currentQuestion = questions[currentQuestionIndex]
  const currentQuestionStatus = currentQuestion?.status || 'locked'

  // Waiting phase
  if (gameStatus === 'waiting') {
    return (
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.push(`/admin/${gameId}`)}
            className="text-blue-600 hover:text-blue-700 font-medium mb-4 flex items-center gap-2"
          >
            ⚙️ Admin
          </button>
          <div className="bg-white rounded-xl shadow-lg p-8">
            <div className="text-center mb-8">
              <h1 className="text-4xl font-bold text-gray-900 mb-4">En attente des joueurs</h1>
            <div className="bg-blue-50 border-2 border-blue-500 rounded-xl p-6 mb-6">
              <p className="text-gray-600 mb-2">Code de la partie:</p>
              <p className="font-mono text-6xl font-bold text-blue-600">{gameCode}</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4 text-center">
              {players.length} {players.length > 1 ? 'joueurs connectés' : 'joueur connecté'}
            </h2>
            <BubbleLobby players={players} />
          </div>

          <button
            onClick={handleStartGame}
            disabled={players.length === 0}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            Lancer la partie
          </button>
          </div>
        </div>
      </div>
    )
  }

  // Game phase
  const answeredCount = answers.length
  const totalPlayers = players.length

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold text-gray-900">
              Question {currentQuestionIndex + 1} / {questions.length}
            </h1>
            <div className="text-right">
              <p className="text-gray-600">Code: <span className="font-mono font-bold">{gameCode}</span></p>
              <p className="text-gray-600">Joueurs: {totalPlayers}</p>
            </div>
          </div>

          <div className="bg-blue-50 border-2 border-blue-500 rounded-xl p-6 mb-6">
            <p className="text-2xl font-semibold text-gray-900">{currentQuestion?.text}</p>
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-700 font-medium">Réponses reçues</p>
              <p className="text-2xl font-bold text-blue-600">{answeredCount} / {totalPlayers}</p>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                style={{ width: `${totalPlayers > 0 ? (answeredCount / totalPlayers) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="flex gap-4">
            {currentQuestionStatus === 'open' && (
              <button
                onClick={handleRevealQuestion}
                className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors text-lg"
              >
                Révéler les réponses
              </button>
            )}

            {currentQuestionStatus === 'revealed' && showLeaderboard && (
              <button
                onClick={handleNextQuestion}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors text-lg"
              >
                {currentQuestionIndex + 1 >= questions.length ? 'Terminer la partie' : 'Question suivante'}
              </button>
            )}
          </div>
        </div>

        {/* Timeline reveal - Full screen overlay */}
        {currentQuestionStatus === 'revealed' && showTimeline && (
          <div className="fixed inset-0 z-50">
            <TimelineReveal
              correctDate={currentQuestion.correct_date}
              answers={answers}
              players={players}
              onComplete={handleTimelineComplete}
            />
          </div>
        )}

        {/* Leaderboard */}
        {currentQuestionStatus === 'revealed' && showLeaderboard && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Classement</h2>
            <AnimatedLeaderboard players={players} />
          </div>
        )}

        {/* Final leaderboard */}
        {gameStatus === 'finished' && (
          <div className="bg-white rounded-xl shadow-lg p-8">
            <h2 className="text-4xl font-bold mb-8 text-center text-gray-900">🏆 Classement Final 🏆</h2>
            <AnimatedLeaderboard players={players} />
          </div>
        )}
      </div>
    </div>
  )
}
