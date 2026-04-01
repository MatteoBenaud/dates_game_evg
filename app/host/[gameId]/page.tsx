'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { GameStatus, QuestionStatus } from '@/types/game.types'
import { calculateScore } from '@/utils/score'
import AnimatedLeaderboard from '@/components/AnimatedLeaderboard'

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

  // Setup phase: for entering questions
  const [currentQuestionText, setCurrentQuestionText] = useState('')
  const [currentQuestionDate, setCurrentQuestionDate] = useState('')
  const [addedQuestions, setAddedQuestions] = useState<Array<{ text: string; correct_date: string }>>([])
  const [isAddingQuestion, setIsAddingQuestion] = useState(false)
  const [isInSetupMode, setIsInSetupMode] = useState(true)

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

      setQuestions(questionsData || [])

      // Update addedQuestions when loading from DB
      if (questionsData && questionsData.length > 0) {
        setAddedQuestions(questionsData.map(q => ({ text: q.text, correct_date: q.correct_date })))
      }

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

  const handleAddQuestion = async () => {
    if (!currentQuestionText.trim() || !currentQuestionDate) return

    setIsAddingQuestion(true)

    try {
      // Add to database immediately
      const { error } = await supabase.from('questions').insert([{
        game_id: gameId,
        question_number: addedQuestions.length + 1,
        text: currentQuestionText,
        correct_date: currentQuestionDate,
        status: 'locked' as QuestionStatus,
      }])

      if (error) throw error

      // Add to local state only (don't reload from DB to stay in setup mode)
      setAddedQuestions([...addedQuestions, { text: currentQuestionText, correct_date: currentQuestionDate }])

      // Reset form
      setCurrentQuestionText('')
      setCurrentQuestionDate('')
    } catch (error) {
      console.error('Error adding question:', error)
      alert('Erreur lors de l\'ajout de la question')
    } finally {
      setIsAddingQuestion(false)
    }
  }

  const handleRemoveQuestion = async (index: number) => {
    try {
      // Get the question from database
      const { data: questionsData } = await supabase
        .from('questions')
        .select('id')
        .eq('game_id', gameId)
        .eq('question_number', index + 1)
        .single()

      if (questionsData) {
        // Delete from database
        await supabase.from('questions').delete().eq('id', questionsData.id)
      }

      // Remove from local state
      const newQuestions = addedQuestions.filter((_, i) => i !== index)
      setAddedQuestions(newQuestions)

      // Renumber remaining questions
      for (let i = 0; i < newQuestions.length; i++) {
        await supabase
          .from('questions')
          .update({ question_number: i + 1 })
          .eq('game_id', gameId)
          .eq('text', newQuestions[i].text)
      }
    } catch (error) {
      console.error('Error removing question:', error)
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

  const handleOpenQuestion = async () => {
    const currentQuestion = questions[currentQuestionIndex]
    if (!currentQuestion) return

    try {
      await supabase
        .from('questions')
        .update({ status: 'open' })
        .eq('id', currentQuestion.id)

      loadGame()
    } catch (error) {
      console.error('Error opening question:', error)
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

      // Mark question as revealed
      await supabase
        .from('questions')
        .update({ status: 'revealed' })
        .eq('id', currentQuestion.id)

      loadGame()
    } catch (error) {
      console.error('Error revealing question:', error)
    }
  }

  const handleNextQuestion = async () => {
    const nextIndex = currentQuestionIndex + 1

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

  // Setup phase: enter questions
  if (isInSetupMode && gameStatus === 'waiting') {
    return (
      <div className="min-h-screen bg-gray-100 p-8">
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg p-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Configuration de la partie</h1>
            <p className="text-gray-600">Code de la partie: <span className="font-mono text-2xl font-bold text-blue-600">{gameCode}</span></p>
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-800">Questions ({addedQuestions.length})</h2>
            </div>

            {/* List of added questions */}
            {addedQuestions.length > 0 && (
              <div className="space-y-3 mb-6">
                {addedQuestions.map((q, index) => (
                  <div key={index} className="flex items-start gap-3 bg-gray-50 rounded-lg p-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-bold text-gray-700">Question {index + 1}</span>
                        <span className="text-sm text-gray-500">
                          ({new Date(q.correct_date).toLocaleDateString('fr-FR')})
                        </span>
                      </div>
                      <p className="text-gray-900">{q.text}</p>
                    </div>
                    <button
                      onClick={() => handleRemoveQuestion(index)}
                      className="text-red-600 hover:text-red-700 p-2"
                      title="Supprimer"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Form to add new question */}
            <div className="border-2 border-blue-300 bg-blue-50 rounded-lg p-6 space-y-4">
              <h3 className="font-semibold text-gray-800">Ajouter une question</h3>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Question
                </label>
                <input
                  type="text"
                  placeholder="Ex: Quel jour suis-je allé pour la première fois au Maroc ?"
                  value={currentQuestionText}
                  onChange={(e) => setCurrentQuestionText(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date correcte
                </label>
                <input
                  type="date"
                  value={currentQuestionDate}
                  onChange={(e) => setCurrentQuestionDate(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <button
                onClick={handleAddQuestion}
                disabled={!currentQuestionText.trim() || !currentQuestionDate || isAddingQuestion}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAddingQuestion ? 'Ajout...' : '+ Ajouter cette question'}
              </button>
            </div>

            {/* Ready to start when at least one question */}
            {addedQuestions.length > 0 && (
              <div className="border-t pt-6">
                <p className="text-sm text-gray-600 mb-3">
                  {addedQuestions.length} question{addedQuestions.length > 1 ? 's' : ''} ajoutée{addedQuestions.length > 1 ? 's' : ''}.
                  Vous pouvez commencer la partie ou ajouter plus de questions.
                </p>
                <button
                  onClick={() => {
                    setIsInSetupMode(false)
                    loadGame()
                  }}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors text-lg"
                >
                  Passer à l'étape suivante
                </button>
              </div>
            )}
          </div>
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
        <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-4">En attente des joueurs</h1>
            <div className="bg-blue-50 border-2 border-blue-500 rounded-xl p-6 mb-6">
              <p className="text-gray-600 mb-2">Code de la partie:</p>
              <p className="font-mono text-6xl font-bold text-blue-600">{gameCode}</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
              Joueurs connectés ({players.length})
            </h2>
            <div className="space-y-2">
              {players.map((player) => (
                <div key={player.id} className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
                  <span className="font-medium text-gray-900">{player.pseudo}</span>
                  <span className={`px-3 py-1 rounded-full text-sm ${player.connected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {player.connected ? 'Connecté' : 'Déconnecté'}
                  </span>
                </div>
              ))}
              {players.length === 0 && (
                <p className="text-gray-500 text-center py-8">Aucun joueur pour le moment...</p>
              )}
            </div>
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

            {currentQuestionStatus === 'revealed' && (
              <>
                <div className="flex-1 bg-gray-50 border-2 border-gray-300 rounded-lg p-4 text-center">
                  <p className="text-gray-600 text-sm mb-1">Bonne réponse:</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {new Date(currentQuestion.correct_date).toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                </div>
                <button
                  onClick={handleNextQuestion}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-4 px-6 rounded-lg transition-colors text-lg"
                >
                  {currentQuestionIndex + 1 >= questions.length ? 'Terminer la partie' : 'Question suivante'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Leaderboard */}
        {currentQuestionStatus === 'revealed' && (
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
