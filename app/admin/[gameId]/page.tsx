'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { GameStatus, QuestionStatus } from '@/types/game.types'

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
  game_id?: string
}

interface Question {
  id: string
  question_number: number
  text: string
  correct_date: string
  status: QuestionStatus
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

  // Add question states
  const [showAddForm, setShowAddForm] = useState(false)
  const [newQuestionText, setNewQuestionText] = useState('')
  const [newQuestionDate, setNewQuestionDate] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  useEffect(() => {
    loadGame()
  }, [gameId])

  const loadGame = async () => {
    try {
      const { data: gameData } = await supabase
        .from('games')
        .select('*')
        .eq('id', gameId)
        .single()

      const { data: playersData } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', gameId)
        .order('total_score', { ascending: true })

      const { data: questionsData } = await supabase
        .from('questions')
        .select('*')
        .eq('game_id', gameId)
        .order('question_number', { ascending: true })

      setGame(gameData ? { ...gameData, status: gameData.status as GameStatus } : null)
      setPlayers(playersData || [])
      setQuestions((questionsData || []).map(q => ({ ...q, status: q.status as QuestionStatus })))
      setLoading(false)
    } catch (error) {
      console.error('Error loading game:', error)
      setLoading(false)
    }
  }


  const handleEditQuestion = (question: Question) => {
    setEditingQuestion(question.id)
    setEditedText(question.text)
    setEditedDate(question.correct_date)
  }

  const handleSaveQuestion = async (questionId: string) => {
    try {
      await supabase
        .from('questions')
        .update({ text: editedText, correct_date: editedDate })
        .eq('id', questionId)

      setEditingQuestion(null)
      loadGame()
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

      await supabase.from('questions').insert([{
        game_id: gameId,
        question_number: newQuestionNumber,
        text: newQuestionText,
        correct_date: newQuestionDate,
        status: 'locked',
      }])

      setNewQuestionText('')
      setNewQuestionDate('')
      setShowAddForm(false)
      loadGame()
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
        [p.pseudo, p.total_score || 0, p.joined_at ? new Date(p.joined_at).toLocaleDateString('fr-FR') : 'N/A'].join(',')
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
