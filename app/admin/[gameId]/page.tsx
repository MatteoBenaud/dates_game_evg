'use client'

import { ChangeEvent, useState, useEffect, useCallback } from 'react'
import NextImage from 'next/image'
import { useParams, useRouter } from 'next/navigation'
import { logoutAdmin } from '@/app/admin/actions'
import { supabase } from '@/lib/supabase'
import { GameStatus, QuestionStatus } from '@/types/game.types'
import { formatScore } from '@/utils/score'
import { dataUrlToBlob, getQuestionImageUrl, uploadQuestionImage } from '@/utils/storage'

const MAX_QUESTION_IMAGE_BYTES = 1_500_000
const MAX_QUESTION_IMAGE_DIMENSION = 1600

async function compressQuestionImage(file: File): Promise<string> {
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

  const scale = Math.min(1, MAX_QUESTION_IMAGE_DIMENSION / Math.max(image.width, image.height))
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

  while (compressed.length > MAX_QUESTION_IMAGE_BYTES * 1.37 && quality > 0.4) {
    quality -= 0.1
    compressed = canvas.toDataURL('image/jpeg', quality)
  }

  return compressed
}

interface Game {
  id: string
  code: string
  status: GameStatus
  created_at: string | null
  current_question_index: number
  host_ready: boolean | null
}

interface Player {
  id: string
  pseudo: string
  total_score: number | null
  connected: boolean | null
  joined_at: string | null
  avatar_url?: string | null
  avatar_storage_path?: string | null
  last_seen?: string
  game_id?: string
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

function sortPlayersByScore(items: Player[]) {
  return [...items].sort((a, b) => (a.total_score || 0) - (b.total_score || 0))
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

export default function AdminGamePage() {
  const params = useParams()
  const router = useRouter()
  const gameId = params.gameId as string

  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)

  // Edition states
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null)
  const [editedText, setEditedText] = useState('')
  const [editedDate, setEditedDate] = useState('')
  const [editedImageDataUrl, setEditedImageDataUrl] = useState('')
  const [editedImageStoragePath, setEditedImageStoragePath] = useState<string | null>(null)
  const [editedImageChanged, setEditedImageChanged] = useState(false)
  const [editUploadKey, setEditUploadKey] = useState(0)

  // Add question states
  const [showAddForm, setShowAddForm] = useState(false)
  const [newQuestionText, setNewQuestionText] = useState('')
  const [newQuestionDate, setNewQuestionDate] = useState('')
  const [newQuestionImageDataUrl, setNewQuestionImageDataUrl] = useState('')
  const [newQuestionImageStoragePath, setNewQuestionImageStoragePath] = useState<string | null>(null)
  const [newUploadKey, setNewUploadKey] = useState(0)
  const [isAdding, setIsAdding] = useState(false)
  const [uploadingImageTarget, setUploadingImageTarget] = useState<'new' | 'edit' | null>(null)

  const loadGameMeta = useCallback(async () => {
    const { data: gameData, error } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single()

    if (error) throw error

    setGame(gameData ? { ...gameData, status: gameData.status as GameStatus } : null)
  }, [gameId])

  const loadPlayers = useCallback(async () => {
    const { data: playersData, error } = await supabase
      .from('players')
      .select('*')
      .eq('game_id', gameId)
      .order('total_score', { ascending: true })

    if (error) throw error

    setPlayers(sortPlayersByScore(playersData || []))
  }, [gameId])

  const loadQuestions = useCallback(async () => {
    const { data: questionsData, error } = await supabase
      .from('questions')
      .select('*')
      .eq('game_id', gameId)
      .order('question_number', { ascending: true })

    if (error) throw error

    setQuestions(sortQuestionsByNumber((questionsData || []).map(q => ({ ...q, status: q.status as QuestionStatus }))))
  }, [gameId])

  const loadGame = useCallback(async () => {
    try {
      await Promise.all([loadGameMeta(), loadPlayers(), loadQuestions()])
    } catch (error) {
      console.error('Error loading game:', error)
    } finally {
      setLoading(false)
    }
  }, [loadGameMeta, loadPlayers, loadQuestions])

  useEffect(() => {
    loadGame()

    const channel = supabase
      .channel(`admin:${gameId}`)
      // Monitor connection status
      .on('system', { event: 'connected' }, () => {
        console.log('✅ [Admin] Real-time connection established')
      })
      .on('system', { event: 'disconnected' }, () => {
        console.warn('⚠️ [Admin] Real-time connection lost')
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'games', filter: `id=eq.${gameId}` },
        async () => {
          await loadGameMeta()
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `game_id=eq.${gameId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setPlayers((current) => current.filter((player) => player.id !== payload.old.id))
            return
          }

          setPlayers((current) => sortPlayersByScore(upsertById(current, payload.new as Player)))
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
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [gameId, loadGame, loadGameMeta, loadPlayers, loadQuestions])


  const handleEditQuestion = (question: Question) => {
    setEditingQuestion(question.id)
    setEditedText(question.text)
    setEditedDate(question.correct_date)
    setEditedImageDataUrl(getQuestionImageUrl(question.image_storage_path) || question.image_data_url || '')
    setEditedImageStoragePath(question.image_storage_path)
    setEditedImageChanged(false)
    setEditUploadKey((key) => key + 1)
  }

  const handleQuestionImageChange = async (
    event: ChangeEvent<HTMLInputElement>,
    target: 'new' | 'edit'
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('Sélectionne un fichier image')
      return
    }

    setUploadingImageTarget(target)

    try {
      const compressedImage = await compressQuestionImage(file)

      if (target === 'new') {
        setNewQuestionImageDataUrl(compressedImage)
        setNewQuestionImageStoragePath(null)
      } else {
        setEditedImageDataUrl(compressedImage)
        setEditedImageStoragePath(null)
        setEditedImageChanged(true)
      }
    } catch (error) {
      console.error('Error processing question image:', error)
      alert('Impossible de préparer cette image')
    } finally {
      setUploadingImageTarget(null)
    }
  }

  const handleSaveQuestion = async (questionId: string) => {
    try {
      const question = questions.find((item) => item.id === questionId)
      if (!question) return

      let nextImageStoragePath = editedImageStoragePath
      if (editedImageChanged) {
        if (editedImageDataUrl) {
          const blob = await dataUrlToBlob(editedImageDataUrl)
          nextImageStoragePath = await uploadQuestionImage(gameId, question.question_number, blob)
        } else {
          nextImageStoragePath = null
        }
      }

      await supabase
        .from('questions')
        .update({
          text: editedText,
          correct_date: editedDate,
          image_data_url: null,
          image_storage_path: nextImageStoragePath,
        })
        .eq('id', questionId)

      setEditingQuestion(null)
      setEditedImageDataUrl('')
      setEditedImageStoragePath(null)
      setEditedImageChanged(false)
    } catch (error) {
      console.error('Error saving question:', error)
    }
  }

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('Supprimer cette question ?')) return

    try {
      await supabase.from('questions').delete().eq('id', questionId)
      loadGame()
    } catch (error) {
      console.error('Error deleting question:', error)
    }
  }

  const handleAddQuestion = async () => {
    if (!newQuestionText.trim() || !newQuestionDate) return

    setIsAdding(true)

    try {
      const newQuestionNumber = questions.length + 1
      let imageStoragePath = newQuestionImageStoragePath

      if (newQuestionImageDataUrl) {
        const blob = await dataUrlToBlob(newQuestionImageDataUrl)
        imageStoragePath = await uploadQuestionImage(gameId, newQuestionNumber, blob)
      }

      await supabase.from('questions').insert([{
        game_id: gameId,
        question_number: newQuestionNumber,
        text: newQuestionText,
        image_data_url: null,
        image_storage_path: imageStoragePath,
        correct_date: newQuestionDate,
        status: 'locked',
      }])

      setNewQuestionText('')
      setNewQuestionDate('')
      setNewQuestionImageDataUrl('')
      setNewQuestionImageStoragePath(null)
      setNewUploadKey((key) => key + 1)
      setShowAddForm(false)
    } catch (error) {
      console.error('Error adding question:', error)
      alert('Erreur lors de l\'ajout de la question')
    } finally {
      setIsAdding(false)
    }
  }

  const handleStopGame = async () => {
    if (!confirm('Arrêter la partie en cours ? Cela déconnectera tous les joueurs.')) return

    try {
      // Set host_ready to false and reset game status
      await supabase
        .from('games')
        .update({
          host_ready: false,
          status: 'waiting',
          current_question_index: 0
        })
        .eq('id', gameId)

      await supabase
        .from('answers')
        .delete()
        .eq('game_id', gameId)

      // Delete all players
      await supabase
        .from('players')
        .delete()
        .eq('game_id', gameId)

      // Reset all questions to locked
      await supabase
        .from('questions')
        .update({ status: 'locked' })
        .eq('game_id', gameId)

      loadGame()
      alert('Partie arrêtée avec succès')
    } catch (error) {
      console.error('Error stopping game:', error)
      alert('Erreur lors de l\'arrêt de la partie')
    }
  }

  const handleExportResults = () => {
    const csv = [
      ['Pseudo', 'Score Total', 'Date de participation'].join(','),
      ...players.map(p =>
        [p.pseudo, formatScore(p.total_score), p.joined_at ? new Date(p.joined_at).toLocaleDateString('fr-FR') : 'N/A'].join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `partie-${game?.code}-resultats.csv`
    a.click()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-2xl font-semibold text-gray-600">Chargement...</div>
      </div>
    )
  }

  if (!game) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-2xl font-semibold text-red-600">Partie introuvable</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push('/admin')}
            className="text-blue-600 hover:text-blue-700 font-medium mb-4 flex items-center gap-2"
          >
            ← Retour au dashboard
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">Partie {game.code}</h1>
              <p className="text-gray-600">
                Créée le {game.created_at ? new Date(game.created_at).toLocaleDateString('fr-FR', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }) : 'N/A'}
              </p>
            </div>
            <div className="flex gap-3">
              <form action={logoutAdmin}>
                <button
                  type="submit"
                  className="rounded-lg border border-[var(--line-soft)] bg-white px-6 py-3 font-semibold text-[var(--ink-1)] transition-colors hover:bg-gray-50"
                >
                  Déconnexion
                </button>
              </form>
              <button
                onClick={handleExportResults}
                className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                📥 Exporter résultats
              </button>
              {(game.host_ready || players.length > 0) && (
                <button
                  onClick={handleStopGame}
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
                >
                  ⏹️ Arrêter la partie
                </button>
              )}
              <button
                onClick={async () => {
                  const { error } = await supabase
                    .from('games')
                    .update({ host_ready: true })
                    .eq('id', gameId)

                  if (error) {
                    console.error('Error setting host_ready:', error)
                    alert('Erreur lors du lancement de la partie')
                    return
                  }

                  console.log('host_ready set to true for game:', gameId)
                  router.push(`/host/${gameId}`)
                }}
                className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                🎮 Lancer la partie
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-lg p-6">
            <p className="text-gray-500 text-sm mb-1">Questions configurées</p>
            <p className="text-4xl font-bold text-green-600">{questions.length}</p>
          </div>
          <div className="bg-white rounded-xl shadow-lg p-6">
            <p className="text-gray-500 text-sm mb-1">Statut</p>
            <p className="text-2xl font-bold text-gray-900 capitalize">{game.status}</p>
          </div>
        </div>

        {/* Questions */}
        <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900">Questions</h2>
              <button
                onClick={() => setShowAddForm(!showAddForm)}
                className="bg-green-600 hover:bg-green-700 text-white font-medium px-4 py-2 rounded-lg transition-colors"
              >
                {showAddForm ? '✕ Annuler' : '+ Ajouter'}
              </button>
            </div>

            {/* Add question form */}
            {showAddForm && (
              <div className="mb-4 p-4 bg-green-50 border-2 border-green-300 rounded-lg space-y-3">
                <input
                  type="text"
                  placeholder="Texte de la question"
                  value={newQuestionText}
                  onChange={(e) => setNewQuestionText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <div className="space-y-3 rounded-lg border border-dashed border-green-400 bg-white p-3">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Photo optionnelle</p>
                    <p className="text-xs text-gray-500">La question sera affichée au-dessus de l’image côté host.</p>
                  </div>
                  <input
                    key={newUploadKey}
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleQuestionImageChange(e, 'new')}
                    className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-lg file:border-0 file:bg-green-600 file:px-4 file:py-2 file:font-semibold file:text-white"
                  />
                  {uploadingImageTarget === 'new' && <p className="text-sm text-gray-500">Préparation de l’image...</p>}
                  {newQuestionImageDataUrl && (
                    <div className="space-y-3">
                      <NextImage
                        src={newQuestionImageDataUrl}
                        alt="Aperçu de la question"
                        width={1600}
                        height={900}
                        unoptimized
                        className="max-h-56 w-full rounded-lg object-contain"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setNewQuestionImageDataUrl('')
                          setNewQuestionImageStoragePath(null)
                          setNewUploadKey((key) => key + 1)
                        }}
                        className="text-sm font-medium text-red-600 hover:text-red-700"
                      >
                        Retirer la photo
                      </button>
                    </div>
                  )}
                </div>
                <input
                  type="date"
                  value={newQuestionDate}
                  onChange={(e) => setNewQuestionDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
                <button
                  onClick={handleAddQuestion}
                  disabled={!newQuestionText.trim() || !newQuestionDate || isAdding}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
                >
                  {isAdding ? 'Ajout...' : 'Ajouter la question'}
                </button>
              </div>
            )}

            <div className="space-y-3">
              {questions.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Aucune question</p>
              ) : (
                questions.map((question) => (
                  <div key={question.id} className="border border-gray-200 rounded-lg p-4">
                    {editingQuestion === question.id ? (
                      <div className="space-y-3">
                        <input
                          type="text"
                          value={editedText}
                          onChange={(e) => setEditedText(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                        <div className="space-y-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
                          <div>
                            <p className="text-sm font-medium text-gray-700">Photo de la question</p>
                            <p className="text-xs text-gray-500">Optionnelle, affichée sous la question sur l’écran host.</p>
                          </div>
                          <input
                            key={`${question.id}-${editUploadKey}`}
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleQuestionImageChange(e, 'edit')}
                            className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:font-semibold file:text-white"
                          />
                          {uploadingImageTarget === 'edit' && <p className="text-sm text-gray-500">Préparation de l’image...</p>}
                          {editedImageDataUrl && (
                            <div className="space-y-3">
                              <NextImage
                                src={editedImageDataUrl}
                                alt="Aperçu de la question"
                                width={1600}
                                height={900}
                                unoptimized
                                className="max-h-56 w-full rounded-lg object-contain"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  setEditedImageDataUrl('')
                                  setEditedImageStoragePath(null)
                                  setEditedImageChanged(true)
                                  setEditUploadKey((key) => key + 1)
                                }}
                                className="text-sm font-medium text-red-600 hover:text-red-700"
                              >
                                Retirer la photo
                              </button>
                            </div>
                          )}
                        </div>
                        <input
                          type="date"
                          value={editedDate}
                          onChange={(e) => setEditedDate(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveQuestion(question.id)}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm"
                          >
                            Sauvegarder
                          </button>
                          <button
                            onClick={() => setEditingQuestion(null)}
                            className="bg-gray-300 hover:bg-gray-400 text-gray-700 px-4 py-2 rounded-lg text-sm"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <span className="font-bold text-gray-700">Q{question.question_number}.</span>
                            <p className="text-gray-900 mt-1">{question.text}</p>
                            {(getQuestionImageUrl(question.image_storage_path) || question.image_data_url) && (
                              <NextImage
                                src={getQuestionImageUrl(question.image_storage_path) || question.image_data_url || ''}
                                alt={`Illustration pour la question ${question.question_number}`}
                                width={1600}
                                height={900}
                                unoptimized
                                className="mt-3 max-h-44 w-full rounded-lg border border-gray-200 object-contain"
                              />
                            )}
                            <p className="text-sm text-gray-500 mt-1">
                              Réponse: {new Date(question.correct_date).toLocaleDateString('fr-FR')}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleEditQuestion(question)}
                              className="text-blue-600 hover:text-blue-700 text-sm"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDeleteQuestion(question.id)}
                              className="text-red-600 hover:text-red-700 text-sm"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
      </div>
    </div>
  )
}
