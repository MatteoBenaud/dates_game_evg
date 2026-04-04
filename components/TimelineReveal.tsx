'use client'

import { useEffect, useState } from 'react'

interface Player {
  id: string
  pseudo: string
  avatar_url?: string | null
}

interface Answer {
  id: string
  player_id: string
  submitted_date: string
  score: number | null
}

interface TimelineRevealProps {
  correctDate: string
  answers: Answer[]
  players: Player[]
  onComplete: () => void
}

type AnimationPhase = 'shake' | 'explode' | 'reveal-timeline' | 'reveal-answers' | 'complete'

export default function TimelineReveal({ correctDate, answers, players, onComplete }: TimelineRevealProps) {
  const [phase, setPhase] = useState<AnimationPhase>('shake')
  const [visibleAnswers, setVisibleAnswers] = useState<string[]>([])
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    // Reset state
    setPhase('shake')
    setVisibleAnswers([])
    setIsComplete(false)

    const timeouts: NodeJS.Timeout[] = []

    // Phase 1: Shake (1.5s)
    timeouts.push(setTimeout(() => setPhase('explode'), 1500))

    // Phase 2: Explode (0.5s)
    timeouts.push(setTimeout(() => setPhase('reveal-timeline'), 2000))

    // Phase 3: Reveal timeline (0.8s)
    timeouts.push(setTimeout(() => setPhase('reveal-answers'), 2800))

    // Phase 4: Reveal answers progressively
    timeouts.push(setTimeout(() => {
      // Sort answers by score (best first)
      const sortedAnswers = [...answers].sort((a, b) => (b.score || 0) - (a.score || 0))

      // Reveal answers one by one
      sortedAnswers.forEach((answer, index) => {
        const timeout = setTimeout(() => {
          setVisibleAnswers(prev => [...prev, answer.id])

          // Mark as complete after last answer
          if (index === sortedAnswers.length - 1) {
            const completeTimeout = setTimeout(() => {
              setPhase('complete')
              setIsComplete(true)
            }, 1000)
            timeouts.push(completeTimeout)
          }
        }, index * 400)
        timeouts.push(timeout)
      })
    }, 2800))

    // Cleanup function
    return () => {
      timeouts.forEach(timeout => clearTimeout(timeout))
    }
  }, []) // Empty dependency array - only run once on mount

  // Calculate timeline range with margins
  const maxScore = Math.max(...answers.map(a => a.score || 0), 1)
  const timelineWidth = maxScore * 2
  const MARGIN_PERCENT = 10 // 10% margin on each side

  // Convert date to position on timeline (with margins to prevent overflow)
  const getPosition = (dateString: string) => {
    const date = new Date(dateString)
    const correct = new Date(correctDate)
    const diffTime = date.getTime() - correct.getTime()
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24))

    // Map to percentage with margins: -maxScore to +maxScore becomes MARGIN% to (100-MARGIN)%
    const normalizedPosition = (diffDays + maxScore) / timelineWidth
    const position = MARGIN_PERCENT + (normalizedPosition * (100 - 2 * MARGIN_PERCENT))
    return Math.max(MARGIN_PERCENT, Math.min(100 - MARGIN_PERCENT, position))
  }

  // Smart vertical positioning - all answers stacked vertically
  const getSmartPositions = () => {
    const positions: Array<{ id: string; x: number; y: number; isPerfect: boolean }> = []
    const rows: number[][] = [] // Track occupied x positions per row
    const minDistance = 15 // Minimum distance in % to avoid overlap (increased for safety)

    // Process all answers - stack vertically when needed
    answers.forEach(answer => {
      const x = getPosition(answer.submitted_date)
      const isPerfect = (answer.score || 0) === 0
      let rowIndex = 0
      let placed = false

      while (!placed) {
        if (!rows[rowIndex]) rows[rowIndex] = []

        // Check if this x position conflicts with any existing card in this row
        const conflicts = rows[rowIndex].some(occupiedX => Math.abs(occupiedX - x) < minDistance)

        if (!conflicts) {
          rows[rowIndex].push(x)
          positions.push({ id: answer.id, x, y: rowIndex, isPerfect })
          placed = true
        } else {
          rowIndex++ // Try next row up
        }
      }
    })

    return { positions, totalRows: rows.length }
  }

  const { positions: smartPositions, totalRows } = getSmartPositions()

  const getPlayerByAnswerId = (answerId: string) => {
    const answer = answers.find(a => a.id === answerId)
    return players.find(p => p.id === answer?.player_id)
  }

  const getAnswerById = (answerId: string) => {
    return answers.find(a => a.id === answerId)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 p-8">
      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0) scale(1); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-10px) scale(1.1); }
          20%, 40%, 60%, 80% { transform: translateX(10px) scale(1.1); }
        }

        @keyframes explode {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.8; }
          100% { transform: scale(3); opacity: 0; }
        }

        @keyframes bubble-pop {
          0% { transform: scale(0); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }

        @keyframes slide-in {
          from { transform: scaleX(0); opacity: 0; }
          to { transform: scaleX(1); opacity: 1; }
        }

        .shake {
          animation: shake 1.5s ease-in-out;
        }

        .explode {
          animation: explode 0.5s ease-out forwards;
        }

        .bubble-pop {
          animation: bubble-pop 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }

        .slide-in {
          animation: slide-in 0.8s ease-out;
          transform-origin: center;
        }
      `}</style>

      {/* Phase 1 & 2: Shake and Explode Bubble */}
      {(phase === 'shake' || phase === 'explode') && (
        <div className="flex flex-col items-center justify-center">
          <div className={`${phase === 'shake' ? 'shake' : 'explode'}`}>
            <div className="w-64 h-64 rounded-full bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 shadow-2xl flex items-center justify-center relative overflow-hidden">
              {/* Particles effect */}
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent"></div>
              <div className="text-center z-10">
                <p className="text-white text-2xl font-bold mb-2">La bonne réponse est...</p>
                <p className="text-white text-5xl font-extrabold">
                  {new Date(correctDate).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  })}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Phase 3+: Timeline and Answers */}
      {phase !== 'shake' && phase !== 'explode' && (
        <div className="w-full max-w-6xl">
          <div className="bg-white rounded-2xl shadow-2xl p-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
              Révélation des réponses
            </h2>

            {/* Chart-style timeline */}
            <div className="relative px-4" style={{
              height: `${totalRows * 55 + 120}px`
            }}>
              {/* All answer cards - positioned on Y axis */}
              {smartPositions.map((pos) => {
                const answer = answers.find(a => a.id === pos.id)!
                const player = players.find(p => p.id === answer.player_id)
                const isVisible = visibleAnswers.includes(answer.id)

                // Y position: bottom to top (row 0 = bottom)
                const yPosition = 80 + (pos.y * 55)

                return (
                  <div
                    key={answer.id}
                    className={`absolute transition-all duration-700 ${
                      isVisible ? 'opacity-100 scale-100 bubble-pop' : 'opacity-0 scale-0'
                    }`}
                    style={{
                      left: `${pos.x}%`,
                      bottom: `${yPosition}px`,
                      transform: 'translateX(-50%)',
                    }}
                  >
                    <div className={`px-4 py-2 rounded-lg shadow-lg border-2 hover:scale-105 transition-transform ${
                      pos.isPerfect
                        ? 'bg-green-50 border-green-500'
                        : 'bg-white border-purple-400'
                    }`}>
                      <p className={`font-bold text-sm whitespace-nowrap ${
                        pos.isPerfect ? 'text-green-900' : 'text-gray-900'
                      }`}>
                        {player?.pseudo} - {new Date(answer.submitted_date).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                )
              })}

              {/* X-axis timeline at bottom */}
              <div className="absolute bottom-0 left-0 right-0 px-4">
                <div
                  className={`h-2 rounded-full shadow-md transition-all duration-800 ${
                    phase === 'reveal-timeline' || phase === 'reveal-answers' || phase === 'complete' ? 'slide-in' : 'opacity-0'
                  }`}
                  style={{
                    background: 'linear-gradient(to right, #fca5a5, #fde047, #86efac, #fde047, #fca5a5)'
                  }}
                >
                  {/* Correct date marker at center (50%) */}
                  <div
                    className="absolute w-1 bg-blue-600 shadow-lg"
                    style={{
                      left: '50%',
                      top: '-8px',
                      bottom: '-8px',
                      transform: 'translateX(-50%)'
                    }}
                  >
                    <div className="absolute -bottom-12 left-1/2 transform -translate-x-1/2 text-center whitespace-nowrap">
                      <div className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-3 py-1 rounded-lg shadow-xl text-xs font-bold">
                        {new Date(correctDate).toLocaleDateString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit'
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Axis labels */}
                <div className={`flex justify-between mt-8 text-xs text-gray-500 font-medium transition-opacity duration-500 ${
                  phase === 'reveal-timeline' || phase === 'reveal-answers' || phase === 'complete' ? 'opacity-100' : 'opacity-0'
                }`}>
                  <span>← {maxScore} jours</span>
                  <span>{maxScore} jours →</span>
                </div>
              </div>
            </div>

            {/* Continue button */}
            {isComplete && (
              <div className="text-center mt-8 bubble-pop">
                <button
                  onClick={onComplete}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold py-4 px-10 rounded-xl transition-all text-lg shadow-xl hover:shadow-2xl hover:scale-105"
                >
                  Voir le classement →
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
