'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { ChangeEvent } from 'react'
import NextImage from 'next/image'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { GameStatus, QuestionStatus } from '@/types/game.types'
import { formatScore } from '@/utils/score'
import { dataUrlToBlob } from '@/utils/storage'

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
  connected?: boolean | null
  last_seen?: string | null
}

interface Answer {
  id: string
  submitted_date: string
  score: number | null
}

interface RealtimeGameChange {
  status?: GameStatus
  current_question_index?: number
}

const PRESENCE_HEARTBEAT_MS = 15_000

function sortPlayersByScore(items: Player[]) {
  return [...items].sort((a, b) => (a.total_score || 0) - (b.total_score || 0))
}

function upsertById<T extends { id: string }>(items: T[], nextItem: T) {
  const index = items.findIndex((item) => item.id === nextItem.id)
  if (index === -1) return [...items, nextItem]

  const nextItems = [...items]
  nextItems[index] = nextItem
  return nextItems
}

const MAX_AVATAR_BYTES = 2 * 1024 * 1024
const MAX_AVATAR_DIMENSION = 1200

async function compressAvatar(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Impossible de lire le fichier'))
    reader.readAsDataURL(file)
  })

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Impossible de charger l’image'))
    img.src = dataUrl
  })

  const scale = Math.min(1, MAX_AVATAR_DIMENSION / Math.max(image.width, image.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas indisponible')
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height)

  let quality = 0.9
  let compressed = canvas.toDataURL('image/jpeg', quality)

  while (compressed.length > MAX_AVATAR_BYTES * 1.37 && quality > 0.4) {
    quality -= 0.1
    compressed = canvas.toDataURL('image/jpeg', quality)
  }

  return compressed
}

function formatAnswerDate(day: string, month: string, year: string): string | null {
  if (day.length !== 2 || month.length !== 2 || year.length !== 4) {
    return null
  }

  const dayNumber = Number(day)
  const monthNumber = Number(month)
  const yearNumber = Number(year)

  if (
    Number.isNaN(dayNumber) ||
    Number.isNaN(monthNumber) ||
    Number.isNaN(yearNumber) ||
    dayNumber < 1 ||
    dayNumber > 31 ||
    monthNumber < 1 ||
    monthNumber > 12 ||
    yearNumber < 1
  ) {
    return null
  }

  const candidate = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber))

  if (
    candidate.getUTCFullYear() !== yearNumber ||
    candidate.getUTCMonth() !== monthNumber - 1 ||
    candidate.getUTCDate() !== dayNumber
  ) {
    return null
  }

  return `${year}-${month}-${day}`
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
  const [questionCount, setQuestionCount] = useState(0)
  const [myAnswer, setMyAnswer] = useState<Answer | null>(null)
  const [selectedDay, setSelectedDay] = useState('')
  const [selectedMonth, setSelectedMonth] = useState('')
  const [selectedYear, setSelectedYear] = useState('')
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')

  // KAHOOT PATTERN: Use refs to avoid dependency loops
  const playerIdRef = useRef<string | null>(null)
  const currentQuestionIndexRef = useRef(0)

  useEffect(() => {
    playerIdRef.current = playerId
  }, [playerId])

  useEffect(() => {
    currentQuestionIndexRef.current = currentQuestionIndex
  }, [currentQuestionIndex])

  const loadPlayers = useCallback(async () => {
    const { data } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameId)
      .order('total_score', { ascending: true })

    setAllPlayers(sortPlayersByScore(data || []))
  }, [gameId])

  const loadGame = useCallback(async () => {
    try {
      const { data: gameData, error: gameError } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()

      if (gameError) throw gameError

      setGame(gameData as Game)
      setGameStatus(gameData.status as GameStatus)
      setCurrentQuestionIndex(gameData.current_question_index)
      await loadPlayers()
    } catch (error) {
      console.error('Error loading game:', error)
    }
  }, [gameId, loadPlayers])

  const loadCurrentQuestion = useCallback(async () => {
    try {
      const { data: questions } = await supabase
        .from('questions')
        .select('*')
        .eq('game_id', gameId)
        .order('question_number', { ascending: true })

      setQuestionCount(questions?.length || 0)
      const nextQuestion = questions?.[currentQuestionIndexRef.current]

      if (nextQuestion) {
        const question = nextQuestion

        // Only include correct_date if revealed
        setCurrentQuestion({
          id: question.id,
          question_number: question.question_number,
          text: question.text,
          status: question.status as QuestionStatus,
          correct_date: question.status === 'revealed' ? question.correct_date : undefined,
        })

        // Load my answer if exists
        if (playerIdRef.current) {
          const { data: answerData, error: answerError } = await supabase
            .from('answers')
            .select('*')
            .eq('question_id', question.id)
            .eq('player_id', playerIdRef.current)
            .maybeSingle()

          if (answerError) throw answerError

          setMyAnswer(answerData || null)
        }
      } else {
        setCurrentQuestion(null)
        setMyAnswer(null)
      }
    } catch (error) {
      console.error('Error loading question:', error)
    }
  }, [gameId])

  const resyncGameState = useCallback(async () => {
    await loadGame()
    await loadCurrentQuestion()
  }, [loadCurrentQuestion, loadGame])

  const clearPlayerSession = useCallback(() => {
    localStorage.removeItem(`player_${gameId}`)
    setHasJoined(false)
    setPlayerId(null)
    setGame(null)
    setCurrentQuestion(null)
    setQuestionCount(0)
    setMyAnswer(null)
    setAllPlayers([])
    setError('')
  }, [gameId])

  const markPlayerPresence = useCallback(async (playerIdToUpdate: string, connected: boolean) => {
    const { error: updateError } = await supabase
      .from('players')
      .update({
        connected,
        last_seen: new Date().toISOString(),
      })
      .eq('id', playerIdToUpdate)
      .eq('game_id', gameId)

    if (updateError) {
      console.error('Error updating player presence:', updateError)
    }
  }, [gameId])

  const restorePlayerSession = useCallback(async (savedPlayerId: string) => {
    const { data: existingPlayer, error: playerError } = await supabase
      .from('players')
      .select('id')
      .eq('id', savedPlayerId)
      .eq('game_id', gameId)
      .maybeSingle()

    if (playerError) {
      console.error('Error restoring player session:', playerError)
      clearPlayerSession()
      return
    }

    if (!existingPlayer) {
      clearPlayerSession()
      return
    }

    await markPlayerPresence(savedPlayerId, true)
    setPlayerId(savedPlayerId)
    setHasJoined(true)
  }, [clearPlayerSession, gameId, markPlayerPresence])

  // KAHOOT PATTERN: Check localStorage on mount only
  useEffect(() => {
    const savedPlayerId = localStorage.getItem(`player_${gameId}`)
    if (savedPlayerId) {
      restorePlayerSession(savedPlayerId)
    }
  }, [gameId, restorePlayerSession])

  // KAHOOT PATTERN: Single subscription setup when player has joined
  useEffect(() => {
    if (!hasJoined) return

    setConnectionStatus('connecting')

    // Load initial data
    loadGame()

    // Setup real-time listeners
    const channel = supabase
      .channel(`player:${gameId}`)
      .on('system', { event: 'connected' }, () => {
        setConnectionStatus('connected')
        console.log('✅ [Player] Real-time connected')
      })
      .on('system', { event: 'disconnected' }, () => {
        setConnectionStatus('disconnected')
        console.warn('⚠️ [Player] Real-time disconnected (may reconnect automatically)')
      })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        (payload: { new: RealtimeGameChange }) => {
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
        () => {
          loadCurrentQuestion()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const deletedPlayerId = payload.old.id as string
            setAllPlayers((current) => current.filter((player) => player.id !== deletedPlayerId))

            if (deletedPlayerId === playerIdRef.current) {
              clearPlayerSession()
            }

            return
          }

          setAllPlayers((current) => sortPlayersByScore(upsertById(current, payload.new as Player)))
        }
      )
      .subscribe((status) => {
        console.log('📡 [Player] Subscription status:', status)
        if (status === 'SUBSCRIBED') {
          setConnectionStatus('connected')
          console.log('✅ [Player] Successfully subscribed to channel')
        } else if (status === 'CHANNEL_ERROR') {
          setConnectionStatus('disconnected')
          console.error('❌ [Player] Channel error')
        } else if (status === 'TIMED_OUT') {
          setConnectionStatus('disconnected')
          console.error('⏱️ [Player] Subscription timed out')
        } else if (status === 'CLOSED') {
          setConnectionStatus('disconnected')
          console.warn('🚪 [Player] Channel closed')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [clearPlayerSession, hasJoined, gameId, loadCurrentQuestion, loadGame, loadPlayers])

  useEffect(() => {
    if (!hasJoined || !playerId) return

    markPlayerPresence(playerId, true)

    const interval = window.setInterval(() => {
      markPlayerPresence(playerId, true)
    }, PRESENCE_HEARTBEAT_MS)

    return () => {
      window.clearInterval(interval)
      markPlayerPresence(playerId, false)
    }
  }, [hasJoined, playerId, markPlayerPresence])

  useEffect(() => {
    if (!hasJoined) return

    const handleForegroundResume = () => {
      if (document.visibilityState !== 'visible') return

      setConnectionStatus('connecting')
      resyncGameState()

      if (playerIdRef.current) {
        markPlayerPresence(playerIdRef.current, true)
      }
    }

    window.addEventListener('focus', handleForegroundResume)
    document.addEventListener('visibilitychange', handleForegroundResume)

    return () => {
      window.removeEventListener('focus', handleForegroundResume)
      document.removeEventListener('visibilitychange', handleForegroundResume)
    }
  }, [hasJoined, markPlayerPresence, resyncGameState])

  useEffect(() => {
    if (game && currentQuestionIndex >= 0) {
      loadCurrentQuestion()
    }
  }, [currentQuestionIndex, game, loadCurrentQuestion])

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
      const { data: existingPlayer, error: existingPlayerError } = await supabase
        .from('players')
        .select('id')
        .eq('game_id', gameId)
        .eq('pseudo', pseudo)
        .maybeSingle()

      if (existingPlayerError) throw existingPlayerError

      if (existingPlayer) {
        setError('Ce pseudo est déjà pris')
        setLoading(false)
        return
      }

      // Upload avatar to Storage if provided (OPTIMIZED: Upload once, reuse URL)
      let avatarStoragePath = null
      if (avatarUrl) {
        try {
          const blob = await dataUrlToBlob(avatarUrl)

          // Create unique filename
          const timestamp = Date.now()
          const fileName = `${gameId}/${pseudo}_${timestamp}.jpg`

          // Upload to Supabase Storage
          const { error: uploadError } = await supabase.storage
            .from('avatars')
            .upload(fileName, blob, {
              contentType: 'image/jpeg',
              upsert: true
            })

          if (uploadError) {
            console.error('Storage upload error:', uploadError)
            // Continue without avatar if upload fails
          } else {
            avatarStoragePath = fileName
            console.log('✅ Avatar uploaded to Storage:', fileName)
          }
        } catch (uploadError) {
          console.error('Error uploading avatar:', uploadError)
          // Continue without avatar if upload fails
        }
      }

      // Create player with storage path (file uploaded once, URL reused everywhere)
      const { data: player, error: playerError } = await supabase
        .from('players')
        .insert([
          {
            game_id: gameId,
            pseudo: pseudo,
            avatar_storage_path: avatarStoragePath,
            avatar_url: null, // Deprecated field
            total_score: 0,
            connected: true,
            last_seen: new Date().toISOString(),
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
      if (typeof error === 'object' && error && 'code' in error && error.code === '23505') {
        setError('Ce pseudo est déjà pris')
      } else {
        setError('Erreur lors de la connexion')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError('')

    compressAvatar(file)
      .then((compressed) => {
        setAvatarUrl(compressed)
      })
      .catch((error) => {
        console.error('Error compressing avatar:', error)
        setError('Impossible de traiter cette photo')
      })
  }

  const handleDatePartChange = (
    event: ChangeEvent<HTMLInputElement>,
    setter: (value: string) => void,
    maxLength: number
  ) => {
    setter(event.target.value.replace(/\D/g, '').slice(0, maxLength))
  }

  const handleSubmitAnswer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!playerId || !currentQuestion) return

    const formattedDate = formatAnswerDate(selectedDay, selectedMonth, selectedYear)

    if (!formattedDate) {
      alert('Entre une date valide au format jj / mm / yyyy')
      return
    }

    setLoading(true)

    try {
      const { data: latestQuestion, error: latestQuestionError } = await supabase
        .from('questions')
        .select('id, status')
        .eq('id', currentQuestion.id)
        .maybeSingle()

      if (latestQuestionError) throw latestQuestionError

      if (!latestQuestion || latestQuestion.status !== 'open') {
        await resyncGameState()
        alert('La question a changé. Recharge de l’état en cours.')
        return
      }

      const { error } = await supabase
        .from('answers')
        .insert([
          {
            game_id: gameId,  // CRITICAL: Required for real-time filtering
            question_id: currentQuestion.id,
            player_id: playerId,
            submitted_date: formattedDate,
          },
        ])

      if (error) throw error

      setSelectedDay('')
      setSelectedMonth('')
      setSelectedYear('')
      await loadCurrentQuestion()
    } catch (error) {
      console.error('Error submitting answer:', error)
      if (typeof error === 'object' && error && 'code' in error && error.code === '23505') {
        await loadCurrentQuestion()
        alert('Réponse déjà envoyée')
      } else {
        alert('Erreur lors de la soumission de la réponse')
      }
    } finally {
      setLoading(false)
    }
  }

  // Join screen
  if (!hasJoined) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center p-4">
        <div className="glass-panel w-full max-w-md rounded-[32px] p-8">
          <p className="mb-3 text-center text-xs font-black uppercase tracking-[0.3em] text-[var(--ink-3)]">Player access</p>
          <h1 className="section-title mb-6 text-center text-4xl font-black text-[var(--ink-1)]">
            Rejoindre la partie
          </h1>

          {error && (
            <div className="mb-4 rounded-[20px] border border-red-200 bg-[var(--danger-soft)] px-4 py-3 text-red-800">
              {error}
            </div>
          )}

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-black uppercase tracking-[0.2em] text-[var(--ink-3)]">
                Entre ton pseudo
              </label>
              <input
                type="text"
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                placeholder="Ton pseudo"
                maxLength={20}
                className="w-full rounded-[20px] border border-[var(--line-soft)] bg-white/85 px-4 py-4 text-lg text-[var(--ink-1)] outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black uppercase tracking-[0.2em] text-[var(--ink-3)]">
                Ajoute une photo (optionnel)
              </label>
              <div className="flex items-center gap-4">
                {avatarUrl && (
                  <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-full border-4 border-[var(--brand)]">
                    <NextImage src={avatarUrl} alt="Avatar" width={80} height={80} unoptimized className="w-full h-full object-cover" />
                  </div>
                )}
                <label className="flex-1 cursor-pointer">
                  <div className="w-full rounded-[20px] border-2 border-dashed border-[var(--line-strong)] bg-white/75 px-4 py-4 text-center transition-colors hover:border-[var(--brand)]">
                    <span className="text-[var(--ink-2)]">
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
              className="action-primary w-full rounded-[20px] px-6 py-4 text-lg font-black uppercase tracking-[0.14em] disabled:opacity-50"
            >
              {loading ? 'Connexion...' : 'Rejoindre'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Waiting for game to start
  if (gameStatus === 'waiting') {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center p-4">
        <div className="glass-panel w-full max-w-md rounded-[32px] p-8 text-center">
          <div className="mb-6">
            <div className="mx-auto mb-4 h-20 w-20 rounded-full border-4 border-[var(--brand)] border-t-transparent animate-spin"></div>
            <h1 className="section-title mb-2 text-3xl font-black text-[var(--ink-1)]">
              En attente du démarrage...
            </h1>
            <p className="text-[var(--ink-2)]">
              La partie commencera bientôt
            </p>
          </div>

          <div className="metric-card rounded-[24px] p-4">
            <p className="mb-3 text-sm font-black uppercase tracking-[0.22em] text-[var(--ink-3)]">
              Joueurs connectés ({allPlayers.length})
            </p>
            <div className="space-y-2">
              {allPlayers.map((player) => (
                <div key={player.id} className="rounded-full bg-white/75 px-4 py-2 font-bold text-[var(--ink-1)]">
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
  if (gameStatus === 'finished') {
    const myPlayerData = allPlayers.find(p => p.id === playerId)
    const myRank = allPlayers.findIndex(p => p.id === playerId) + 1

    return (
      <div className="app-shell flex min-h-screen items-center justify-center p-4">
        <div className="glass-panel w-full max-w-md rounded-[32px] p-8">
          <h1 className="section-title mb-6 text-center text-4xl font-black text-[var(--ink-1)]">
            Partie terminée !
          </h1>

          <div className="mb-6 rounded-[28px] bg-gradient-to-br from-[var(--brand)] to-[var(--brand-strong)] p-6 text-center text-white shadow-xl">
            <p className="text-sm font-black uppercase tracking-[0.28em] text-white/75">Ta position</p>
            <p className="mt-2 text-5xl font-black">#{myRank}</p>
            <p className="mt-2 text-xl">{formatScore(myPlayerData?.total_score)}</p>
          </div>

          <div className="space-y-3">
            <h2 className="section-title text-2xl font-black text-[var(--ink-1)]">Classement final</h2>
            {allPlayers.map((player, index) => (
              <div
                key={player.id}
                className={`flex items-center justify-between rounded-[18px] p-4 ${
                  player.id === playerId ? 'border-2 border-[var(--brand)] bg-[rgba(216,87,42,0.12)]' : 'bg-white/75'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl font-black text-[var(--ink-3)]">#{index + 1}</span>
                  <span className="font-bold text-[var(--ink-1)]">{player.pseudo}</span>
                </div>
                <span className="font-black text-[var(--ink-1)]">{formatScore(player.total_score)}</span>
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
      <div className="app-shell flex min-h-screen items-center justify-center p-4">
        <div className="glass-panel rounded-[28px] px-8 py-6 text-2xl font-bold text-[var(--ink-1)]">Chargement...</div>
      </div>
    )
  }

  const questionStatus = currentQuestion.status

  return (
    <div className="app-shell p-4">
      <div className="max-w-md mx-auto pt-8">
        {/* Connection status warning */}
        {connectionStatus === 'disconnected' && (
          <div className="mb-4 rounded-[22px] bg-red-500 px-6 py-3 text-center text-white shadow-lg">
            <p className="font-bold">⚠️ Connexion perdue</p>
            <p className="text-sm">Reconnexion...</p>
          </div>
        )}

        <div className="glass-panel mb-4 rounded-[32px] p-6">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm font-black uppercase tracking-[0.18em] text-[var(--ink-3)]">
              Question {currentQuestion.question_number} / {questionCount || '?'}
            </span>
            <span className="text-sm font-black uppercase tracking-[0.18em] text-[var(--ink-3)]">
              Score: {formatScore(allPlayers.find(p => p.id === playerId)?.total_score)}
            </span>
          </div>

          <div className="metric-card mb-6 rounded-[24px] p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[var(--ink-3)]">Question</p>
            <p className="mt-3 text-xl font-black text-[var(--ink-1)]">{currentQuestion.text}</p>
          </div>

          {/* Question locked */}
          {questionStatus === 'locked' && (
            <div className="text-center py-8">
              <div className="mx-auto mb-4 h-16 w-16 rounded-full border-4 border-[var(--brand)] border-t-transparent animate-spin"></div>
              <p className="text-[var(--ink-2)]">En attente de la question...</p>
            </div>
          )}

          {/* Question open - answer form */}
          {questionStatus === 'open' && !myAnswer && (
            <form onSubmit={handleSubmitAnswer} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-black uppercase tracking-[0.2em] text-[var(--ink-3)]">
                  Entre une date
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="JJ"
                    value={selectedDay}
                    onChange={(e) => handleDatePartChange(e, setSelectedDay, 2)}
                    className="w-full rounded-[20px] border border-[var(--line-soft)] bg-white/85 px-4 py-4 text-center text-lg font-black uppercase text-[var(--ink-1)] outline-none"
                    aria-label="Jour"
                    required
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="MM"
                    value={selectedMonth}
                    onChange={(e) => handleDatePartChange(e, setSelectedMonth, 2)}
                    className="w-full rounded-[20px] border border-[var(--line-soft)] bg-white/85 px-4 py-4 text-center text-lg font-black uppercase text-[var(--ink-1)] outline-none"
                    aria-label="Mois"
                    required
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="YYYY"
                    value={selectedYear}
                    onChange={(e) => handleDatePartChange(e, setSelectedYear, 4)}
                    className="w-full rounded-[20px] border border-[var(--line-soft)] bg-white/85 px-4 py-4 text-center text-lg font-black uppercase text-[var(--ink-1)] outline-none"
                    aria-label="Année"
                    required
                  />
                </div>
                <p className="mt-2 text-xs text-[var(--ink-3)]">Champs numériques uniquement. Exemple: 07 / 04 / 1998.</p>
              </div>

              <button
                type="submit"
                disabled={loading || !selectedDay || !selectedMonth || !selectedYear}
                className="action-primary w-full rounded-[20px] px-6 py-4 text-lg font-black uppercase tracking-[0.14em] disabled:opacity-50"
              >
                {loading ? 'Envoi...' : 'Valider ma réponse'}
              </button>
            </form>
          )}

          {/* Answer submitted, waiting for reveal */}
          {questionStatus === 'open' && myAnswer && (
            <div className="text-center py-8">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
                <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="mb-2 text-lg font-black text-[var(--ink-1)]">Réponse enregistrée !</p>
              <p className="mb-4 text-[var(--ink-2)]">
                Ta réponse: {new Date(myAnswer.submitted_date).toLocaleDateString('fr-FR')}
              </p>
              <p className="text-sm text-[var(--ink-3)]">En attente du reveal...</p>
            </div>
          )}

          {/* Revealed */}
          {questionStatus === 'revealed' && (
            <div className="space-y-4">
              <div className="metric-card rounded-[24px] p-4">
                <p className="mb-1 text-sm font-black uppercase tracking-[0.2em] text-[var(--ink-3)]">Bonne réponse</p>
                <p className="text-xl font-black text-[var(--ink-1)]">
                  {currentQuestion.correct_date &&
                    new Date(currentQuestion.correct_date).toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                </p>
              </div>

              {myAnswer && (
                <div className="rounded-[24px] border border-[var(--line-soft)] bg-[rgba(216,87,42,0.1)] p-4">
                  <p className="mb-1 text-sm font-black uppercase tracking-[0.2em] text-[var(--ink-3)]">Ta réponse</p>
                  <p className="mb-2 text-xl font-black text-[var(--ink-1)]">
                    {new Date(myAnswer.submitted_date).toLocaleDateString('fr-FR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                  <p className="text-2xl font-black text-[var(--brand)]">
                    Écart: {formatScore(myAnswer.score)}
                  </p>
                </div>
              )}

              <div className="metric-card rounded-[24px] p-4">
                <p className="mb-2 text-sm font-black uppercase tracking-[0.2em] text-[var(--ink-3)]">Classement actuel</p>
                <div className="space-y-2">
                  {allPlayers.slice(0, 5).map((player, index) => (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between rounded-full px-3 py-2 ${
                        player.id === playerId ? 'bg-[rgba(216,87,42,0.14)] font-black text-[var(--brand)]' : 'bg-white/70 text-[var(--ink-2)]'
                      }`}
                    >
                      <span>#{index + 1} {player.pseudo}</span>
                      <span>{formatScore(player.total_score)}</span>
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
