'use client'

import { useEffect, useState } from 'react'

interface Player {
  id: string
  pseudo: string
  total_score: number | null
}

interface AnimatedLeaderboardProps {
  players: Player[]
  maxScore?: number
}

interface PlayerPosition {
  id: string
  pseudo: string
  score: number
  rank: number
  prevRank: number
}

export default function AnimatedLeaderboard({ players, maxScore }: AnimatedLeaderboardProps) {
  const [playerPositions, setPlayerPositions] = useState<PlayerPosition[]>([])
  const [isFirstRender, setIsFirstRender] = useState(true)
  const [animatedScores, setAnimatedScores] = useState<Record<string, number>>({})

  useEffect(() => {
    // Sort players by score (ascending = better)
    const sortedPlayers = [...players]
      .map(p => ({ ...p, total_score: p.total_score || 0 }))
      .sort((a, b) => a.total_score - b.total_score)

    // Calculate max score for bar sizing
    const calculatedMaxScore = maxScore || Math.max(...sortedPlayers.map(p => p.total_score), 1)

    // Create new positions
    const newPositions: PlayerPosition[] = sortedPlayers.map((player, index) => {
      const prevPlayer = playerPositions.find(p => p.id === player.id)
      return {
        id: player.id,
        pseudo: player.pseudo,
        score: player.total_score,
        rank: index,
        prevRank: prevPlayer?.rank ?? index,
      }
    })

    setPlayerPositions(newPositions)

    // Animate scores from previous value to new value
    newPositions.forEach((player) => {
      const prevScore = animatedScores[player.id] || 0
      if (prevScore !== player.score) {
        // Start from previous score
        setAnimatedScores(prev => ({ ...prev, [player.id]: prevScore }))

        // Animate to new score after a tiny delay
        setTimeout(() => {
          setAnimatedScores(prev => ({ ...prev, [player.id]: player.score }))
        }, 50)
      }
    })

    if (isFirstRender) {
      setIsFirstRender(false)
    }
  }, [players])

  if (playerPositions.length === 0) {
    return <p className="text-gray-500 text-center py-8">Aucun joueur</p>
  }

  const maxScoreValue = Math.max(...playerPositions.map(p => p.score), 1)

  return (
    <div className="space-y-3">
      {playerPositions.map((player, index) => {
        const currentAnimatedScore = animatedScores[player.id] ?? player.score
        const barWidth = (currentAnimatedScore / maxScoreValue) * 100
        const rankChange = player.prevRank - player.rank

        // Medal colors for top 3
        const getRankColor = (rank: number) => {
          if (rank === 0) return 'from-yellow-400 to-yellow-500' // Gold
          if (rank === 1) return 'from-gray-300 to-gray-400' // Silver
          if (rank === 2) return 'from-orange-400 to-orange-500' // Bronze
          return 'from-blue-400 to-blue-500'
        }

        const getRankBadge = (rank: number) => {
          if (rank === 0) return '🥇'
          if (rank === 1) return '🥈'
          if (rank === 2) return '🥉'
          return `#${rank + 1}`
        }

        return (
          <div
            key={player.id}
            className="relative"
            style={{
              transform: `translateY(${(player.rank - player.prevRank) * 0}px)`,
              transition: 'all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            <div className="flex items-center gap-3">
              {/* Rank badge */}
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 font-bold text-lg shrink-0">
                {getRankBadge(player.rank)}
              </div>

              {/* Player info and bar */}
              <div className="flex-1 relative">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{player.pseudo}</span>

                    {/* Rank change indicator */}
                    {!isFirstRender && rankChange !== 0 && (
                      <span
                        className={`text-sm font-medium animate-bounce ${
                          rankChange > 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {rankChange > 0 ? '↑' : '↓'} {Math.abs(rankChange)}
                      </span>
                    )}
                  </div>

                  <span className="font-bold text-gray-900 tabular-nums">{Math.round(currentAnimatedScore)} pts</span>
                </div>

                {/* Animated bar */}
                <div className="relative h-8 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-gradient-to-r ${getRankColor(player.rank)} rounded-full transition-all duration-[5000ms] ease-out flex items-center justify-end pr-3`}
                    style={{
                      width: `${barWidth}%`,
                      minWidth: currentAnimatedScore > 0 ? '10%' : '0%',
                    }}
                  >
                    {currentAnimatedScore > 0 && (
                      <span className="text-white font-bold text-sm drop-shadow-md tabular-nums">
                        {Math.round(currentAnimatedScore)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
