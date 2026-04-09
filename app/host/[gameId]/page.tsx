'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import NextImage from 'next/image'
import { flushSync } from 'react-dom'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { GameStatus, QuestionStatus } from '@/types/game.types'
import { getAvatarUrl, getQuestionImageUrl } from '@/utils/storage'
import AnimatedLeaderboard from '@/components/AnimatedLeaderboard'
import BubbleLobby from '@/components/BubbleLobby'
import TimelineReveal from '@/components/TimelineReveal'

interface Player {
  id: string
  pseudo: string
  total_score: number | null
  connected: boolean | null
  joined_at?: string | null
  avatar_url?: string | null // Deprecated
  avatar_storage_path?: string | null // New: Storage path
  last_seen?: string
}

interface Question {
  id: string
  question_number: number
  text: string
  image_data_url: string | null
  image_storage_path: string | null
  correct_date: string
  status: QuestionStatus
}

interface Answer {
  id: string
  player_id: string
  submitted_date: string
  score: number | null
}

function sortPlayersByJoinedAt(items: Player[]) {
  return [...items].sort((a, b) => {
    const left = a.joined_at ? new Date(a.joined_at).getTime() : 0
    const right = b.joined_at ? new Date(b.joined_at).getTime() : 0
    return left - right
  })
}

function sortQuestionsByNumber(items: Question[]) {
  return [...items].sort((a, b) => a.question_number - b.question_number)
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T) {
  const index = items.findIndex((item) => item.id === nextItem.id)
  if (index === -1) return [...items, nextItem]

  const nextItems = [...items]
  nextItems[index] = nextItem
  return nextItems
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
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
  const [isPreparingReveal, setIsPreparingReveal] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected')

  // KAHOOT PATTERN: Use refs to avoid dependency loops
  const currentQuestionIdRef = useRef<string | null>(null)
  const previousQuestionStatusRef = useRef<QuestionStatus | null>(null)

  useEffect(() => {
    currentQuestionIdRef.current = questions[currentQuestionIndex]?.id ?? null
  }, [questions, currentQuestionIndex])

  useEffect(() => {
    const status = questions[currentQuestionIndex]?.status
    const previousStatus = previousQuestionStatusRef.current

    if (status === 'revealed') {
      const didTransitionToReveal = previousStatus !== null && previousStatus !== 'revealed'

      if (!didTransitionToReveal && !showTimeline && !isPreparingReveal) {
        setShowLeaderboard(true)
      }

      previousQuestionStatusRef.current = status
      return
    }

    if (status) {
      previousQuestionStatusRef.current = status
    }

    setShowLeaderboard(false)
  }, [questions, currentQuestionIndex, showTimeline, isPreparingReveal])

  const loadAnswers = useCallback(async (questionId: string) => {
    if (!questionId) return

    const { data, error } = await supabase
      .from('answers')
      .select('*')
      .eq('question_id', questionId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error loading answers:', error)
      return
    }

    setAnswers(data || [])
  }, [])

  const loadGame = useCallback(async () => {
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

      setPlayers(sortPlayersByJoinedAt(playersData || []))

      // Load questions
      const { data: questionsData } = await supabase
        .from('questions')
        .select('*')
        .eq('game_id', gameId)
        .order('question_number', { ascending: true })

      setQuestions(sortQuestionsByNumber((questionsData || []).map(q => ({
        ...q,
        status: q.status as QuestionStatus
      }))))

      // Load answers for current question
      if (questionsData && questionsData.length > 0) {
        loadAnswers(questionsData[game.current_question_index]?.id)
      }

      setLoading(false)
    } catch (error) {
      console.error('Error loading game:', error)
      setLoading(false)
    }
  }, [gameId, loadAnswers])

  // KAHOOT PATTERN: Single subscription setup, no callbacks, dependencies in refs
  useEffect(() => {
    // Load initial game data
    loadGame()

    // Setup real-time listeners
    const channel = supabase
      .channel(`game:${gameId}`)
      .on('system', { event: 'connected' }, () => {
        setConnectionStatus('connected')
        console.log('✅ [Host] Real-time connected')
      })
      .on('system', { event: 'disconnected' }, () => {
        setConnectionStatus('disconnected')
        console.warn('⚠️ [Host] Real-time disconnected (may reconnect automatically)')
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
        (payload) => {
          console.log('🔔 Player change detected:', payload.eventType)

          if (payload.eventType === 'DELETE') {
            setPlayers((current) => current.filter((player) => player.id !== payload.old.id))
            return
          }

          const nextPlayer = payload.new as Player
          setPlayers((current) => sortPlayersByJoinedAt(upsertById(current, nextPlayer)))
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'answers', filter: `game_id=eq.${gameId}` },
        (payload) => {
          const currentQuestionId = currentQuestionIdRef.current
          if (payload.new?.question_id === currentQuestionId) {
            console.log('🔔 Answer received')
            setAnswers((current) => upsertById(current, payload.new as Answer))
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload) => {
          if (payload.new.status) {
            setGameStatus(payload.new.status as GameStatus)
          }
          if (payload.new.current_question_index !== undefined) {
            setCurrentQuestionIndex(payload.new.current_question_index)
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'questions', filter: `game_id=eq.${gameId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setQuestions((current) => current.filter((question) => question.id !== payload.old.id))
            return
          }

          const nextQuestion = {
            ...(payload.new as Question),
            status: (payload.new.status as QuestionStatus) || 'locked',
          }

          setQuestions((current) => sortQuestionsByNumber(upsertById(current, nextQuestion)))
        }
      )
      .subscribe((status) => {
        console.log('📡 [Host] Subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('✅ [Host] Successfully subscribed to channel')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ [Host] Channel error')
        } else if (status === 'TIMED_OUT') {
          console.error('⏱️ [Host] Subscription timed out')
        } else if (status === 'CLOSED') {
          console.warn('🚪 [Host] Channel closed')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId, loadGame])

  useEffect(() => {
    const currentQuestionId = questions[currentQuestionIndex]?.id

    if (!currentQuestionId) {
      setAnswers([])
      return
    }

    loadAnswers(currentQuestionId)
  }, [questions, currentQuestionIndex, loadAnswers])


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
      // Show preparing state
      flushSync(() => {
        setShowLeaderboard(false)
        setIsPreparingReveal(true)
      })

      await waitForNextPaint()

      // OPTIMIZED: Use single RPC call instead of 40+ UPDATE queries
      const { error: rpcError } = await supabase.rpc('reveal_question', {
        p_question_id: currentQuestion.id,
        p_correct_date: currentQuestion.correct_date
      })

      if (rpcError) {
        console.error('RPC error:', rpcError)
        throw rpcError
      }

      // Reload answers and players after reveal (scores are now calculated)
      const [answersResult, playersResult] = await Promise.all([
        supabase.from('answers').select('*').eq('question_id', currentQuestion.id),
        supabase.from('players').select('*').eq('game_id', gameId).order('joined_at', { ascending: true })
      ])

      const scoredAnswers = answersResult.data || []
      const updatedPlayers = playersResult.data || []

      // Update UI with database results
      flushSync(() => {
        setAnswers(scoredAnswers)
        setPlayers(updatedPlayers)
        setShowTimeline(true)
        setIsPreparingReveal(false)
      })

      await waitForNextPaint()
    } catch (error) {
      console.error('Error revealing question:', error)
      setIsPreparingReveal(false)
    }
  }

  const handleNextQuestion = async () => {
    const nextIndex = currentQuestionIndex + 1

    setShowTimeline(false)
    setShowLeaderboard(false)

    if (nextIndex >= questions.length) {
      // Finish game
      await supabase
        .from('games')
        .update({ status: 'finished' })
        .eq('id', gameId)

      setGameStatus('finished')
      await loadGame()
    } else {
      const nextQuestion = questions[nextIndex]

      // Optimistically switch the UI to the next question before the realtime round-trip completes.
      setCurrentQuestionIndex(nextIndex)
      setAnswers([])
      setQuestions((currentQuestions) =>
        currentQuestions.map((question, index) => {
          if (index === nextIndex) {
            return { ...question, status: 'open' }
          }

          return question
        })
      )

      // Update game index
      const [gameUpdate, questionUpdate] = await Promise.all([
        supabase
          .from('games')
          .update({ current_question_index: nextIndex })
          .eq('id', gameId),
        supabase
          .from('questions')
          .update({ status: 'open' })
          .eq('id', nextQuestion.id),
      ])

      if (gameUpdate.error) throw gameUpdate.error
      if (questionUpdate.error) throw questionUpdate.error

      loadAnswers(nextQuestion.id)
    }
  }

  const handleNextQuestionSafe = async () => {
    try {
      await handleNextQuestion()
    } catch (error) {
      console.error('Error moving to next question:', error)
      await loadGame()
    }
  }

  const handleTimelineComplete = () => {
    setShowTimeline(false)
    setShowLeaderboard(true)
  }

  if (loading) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center px-6">
        <div className="glass-panel rounded-[30px] px-10 py-8 text-center">
          <p className="section-title text-3xl font-black text-[var(--ink-1)]">Installation de la salle</p>
          <p className="mt-3 text-[var(--ink-2)]">Connexion au salon et récupération des joueurs.</p>
        </div>
      </div>
    )
  }

  // Redirect to admin if no questions configured
  if (questions.length === 0 && gameStatus === 'waiting') {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center p-8">
        <div className="glass-panel max-w-md rounded-[30px] p-8 text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Partie non configurée</h1>
          <p className="text-gray-600 mb-6">
            Cette partie n&apos;a pas encore de questions. Configurez-la depuis l&apos;interface admin.
          </p>
          <button onClick={() => router.push(`/admin/${gameId}`)} className="action-secondary w-full rounded-[18px] px-6 py-3 text-sm font-black uppercase tracking-[0.2em]">
            → Aller à l&apos;admin
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
      <div className="app-shell px-4 py-6 md:px-8">
        <div className="max-w-4xl mx-auto">
          <button
            onClick={() => router.push(`/admin/${gameId}`)}
            className="action-ghost mb-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black uppercase tracking-[0.18em]"
          >
            ⚙️ Admin
          </button>
          <div className="glass-panel rounded-[32px] p-8">
            <div className="text-center mb-8">
              <h1 className="section-title mb-4 text-5xl font-black text-[var(--ink-1)]">Salon prêt à accueillir</h1>
            <div className="metric-card mx-auto mb-6 max-w-xl rounded-[28px] p-6">
              <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[var(--ink-3)]">Code de la partie</p>
              <p className="mt-3 font-mono text-6xl font-black tracking-[0.2em] text-[var(--brand)]">{gameCode}</p>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="section-title mb-4 text-center text-3xl font-black text-[var(--ink-1)]">
              {players.length} {players.length > 1 ? 'joueurs connectés' : 'joueur connecté'}
            </h2>
            <BubbleLobby players={players} />
          </div>

          <button
            onClick={handleStartGame}
            disabled={players.length === 0}
            className="action-primary w-full rounded-[22px] px-6 py-4 text-lg font-black uppercase tracking-[0.16em] disabled:opacity-50"
          >
            Lancer la partie
          </button>
          </div>
        </div>
      </div>
    )
  }

  // Game phase
  const answeredPlayerIds = new Set(answers.map((answer) => answer.player_id))
  const answeredCount = answeredPlayerIds.size
  const totalPlayers = players.length

  if (currentQuestionStatus === 'revealed' && showLeaderboard && !showTimeline) {
    return (
      <div className="app-shell px-4 py-6 md:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="glass-panel rounded-[32px] p-8">
            <div className="mb-6">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--ink-3)]">Après la révélation</p>
              <h2 className="section-title mt-2 text-4xl font-black text-[var(--ink-1)]">Classement de la partie</h2>
            </div>

            <AnimatedLeaderboard players={players} />

            <div className="mt-8 border-t border-[var(--line-soft)] pt-6">
              <button
                onClick={handleNextQuestionSafe}
                className="action-secondary w-full rounded-[22px] px-6 py-4 text-lg font-black uppercase tracking-[0.16em]"
              >
                {currentQuestionIndex + 1 >= questions.length ? 'Terminer la partie' : 'Question suivante'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell px-4 py-6 md:px-8">
      <div className="max-w-6xl mx-auto">
        {/* Connection status warning */}
        {connectionStatus === 'disconnected' && (
          <div className="mb-4 rounded-[22px] bg-red-500 px-6 py-3 text-center text-white shadow-lg">
            <p className="font-bold">⚠️ Connexion temps réel perdue</p>
            <p className="text-sm">Reconnexion en cours...</p>
          </div>
        )}

        <div className="glass-panel mb-6 rounded-[32px] p-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="section-title text-4xl font-black text-[var(--ink-1)]">
              Question {currentQuestionIndex + 1} / {questions.length}
            </h1>
            <div className="text-right">
              <p className="text-[var(--ink-2)]">Code: <span className="font-mono font-bold text-[var(--brand)]">{gameCode}</span></p>
              <p className="text-[var(--ink-2)]">Joueurs: {totalPlayers}</p>
            </div>
          </div>

          <div className="metric-card mb-6 rounded-[28px] p-6">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[var(--ink-3)]">Question en cours</p>
            <p className="mt-3 text-3xl font-black text-[var(--ink-1)]">{currentQuestion?.text}</p>
            {(getQuestionImageUrl(currentQuestion?.image_storage_path || null) || currentQuestion?.image_data_url) && (
              <div className="mt-6 overflow-hidden rounded-[24px] border border-[var(--line-soft)] bg-white/80 p-4">
                <NextImage
                  src={getQuestionImageUrl(currentQuestion.image_storage_path) || currentQuestion.image_data_url || ''}
                  alt={`Illustration de la question ${currentQuestionIndex + 1}`}
                  width={1600}
                  height={900}
                  unoptimized
                  className="mx-auto max-h-[28rem] w-full rounded-[18px] object-contain"
                />
              </div>
            )}
          </div>

          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium text-[var(--ink-2)]">Réponses reçues</p>
              <p className="text-2xl font-black text-[var(--accent)]">{answeredCount} / {totalPlayers}</p>
            </div>
            <div className="h-4 w-full rounded-full bg-[rgba(23,32,51,0.08)]">
              <div
                className="h-4 rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--brand)] transition-all duration-300"
                style={{ width: `${totalPlayers > 0 ? (answeredCount / totalPlayers) * 100 : 0}%` }}
              />
            </div>
          </div>

          <div className="metric-card mb-6 rounded-[28px] p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[var(--ink-3)]">Statut des joueurs</p>
                <p className="mt-1 text-sm text-[var(--ink-2)]">Vert = réponse envoyée. Gris = en attente.</p>
              </div>
              <div className="rounded-full bg-white/80 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--ink-2)]">
                {answeredCount} / {totalPlayers}
              </div>
            </div>

            <div className="grid max-h-56 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4">
              {players.map((player) => {
                const hasAnswered = answeredPlayerIds.has(player.id)

                return (
                  <div
                    key={player.id}
                    className={`flex items-center gap-3 rounded-[20px] border px-3 py-2.5 transition-colors ${
                      hasAnswered
                        ? 'border-emerald-200 bg-emerald-50/80'
                        : 'border-[var(--line-soft)] bg-white/80'
                    }`}
                  >
                    <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-white/80 bg-[rgba(23,32,51,0.08)]">
                      {(() => {
                        // OPTIMIZED: Get URL from Storage (uploaded once, reused everywhere)
                        const avatarUrl = getAvatarUrl(player.avatar_storage_path || null) || player.avatar_url
                        return avatarUrl ? (
                          <NextImage
                            src={avatarUrl}
                            alt={player.pseudo}
                            fill
                            unoptimized
                            sizes="44px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--brand)] to-[var(--brand-strong)] text-sm font-black text-white">
                            {player.pseudo.charAt(0).toUpperCase()}
                          </div>
                        )
                      })()}

                      <span
                        className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${
                          hasAnswered ? 'bg-emerald-500' : 'bg-slate-300'
                        }`}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--ink-1)]">{player.pseudo}</p>
                      <p className={`text-xs font-medium ${hasAnswered ? 'text-emerald-700' : 'text-[var(--ink-3)]'}`}>
                        {hasAnswered ? 'A repondu' : 'En attente'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex gap-4">
            {currentQuestionStatus === 'open' && (
              <button
                onClick={handleRevealQuestion}
                className="action-primary flex-1 rounded-[22px] px-6 py-4 text-lg font-black uppercase tracking-[0.16em]"
              >
                Révéler les réponses
              </button>
            )}

            {currentQuestionStatus === 'revealed' && showLeaderboard && (
              <button
                onClick={handleNextQuestionSafe}
                className="action-secondary flex-1 rounded-[22px] px-6 py-4 text-lg font-black uppercase tracking-[0.16em]"
              >
                {currentQuestionIndex + 1 >= questions.length ? 'Terminer la partie' : 'Question suivante'}
              </button>
            )}
          </div>
        </div>

        {isPreparingReveal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(10,16,32,0.92)] px-6 text-center">
            <div className="max-w-lg">
              <p className="text-xs font-black uppercase tracking-[0.3em] text-white/45">Reveal</p>
              <h2 className="section-title mt-4 text-4xl font-black text-white md:text-5xl">Preparation du reveal</h2>
              <div className="mx-auto mt-8 h-16 w-16 rounded-full border-4 border-white/20 border-t-[var(--brand)] animate-spin" />
            </div>
          </div>
        )}

        {/* Timeline reveal - Full screen overlay */}
        {currentQuestionStatus === 'revealed' && showTimeline && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <TimelineReveal
              correctDate={currentQuestion.correct_date}
              answers={answers}
              players={players}
              onComplete={handleTimelineComplete}
            />
          </div>
        )}

        {/* Final leaderboard */}
        {gameStatus === 'finished' && (
          <div className="glass-panel rounded-[32px] p-8">
            <h2 className="section-title mb-8 text-center text-5xl font-black text-[var(--ink-1)]">Classement final</h2>
            <AnimatedLeaderboard players={players} />
          </div>
        )}
      </div>
    </div>
  )
}
