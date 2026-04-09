'use client'

import NextImage from 'next/image'
import { formatScore } from '@/utils/score'
import { getPlayerAvatarUrl } from '@/utils/storage'

interface Player {
  id: string
  pseudo: string
  total_score: number | null
  avatar_url?: string | null
  avatar_storage_path?: string | null
}

interface AnimatedLeaderboardProps {
  players: Player[]
}

export default function AnimatedLeaderboard({ players }: AnimatedLeaderboardProps) {
  const sortedPlayers = [...players]
    .map((player) => ({ ...player, total_score: player.total_score || 0 }))
    .sort((a, b) => a.total_score - b.total_score)

  if (sortedPlayers.length === 0) {
    return <p className="text-gray-500 text-center py-8">Aucun joueur</p>
  }

  const maxScoreValue = Math.max(...sortedPlayers.map((player) => player.total_score), 1)
  const getRankLabel = (index: number) => {
    if (index === 0) return 'Tête du classement'
    if (index === 1) return 'Très proche'
    if (index === 2) return 'Podium'
    return 'En chasse'
  }

  return (
    <div className="space-y-4">
      {sortedPlayers.map((player, index) => {
        const score = player.total_score
        const progress = maxScoreValue === 0 ? 0 : Math.max(12, (score / maxScoreValue) * 100)
        const avatarUrl = getPlayerAvatarUrl(player)
        const rankTones = [
          'from-amber-300 via-amber-400 to-orange-500',
          'from-slate-200 via-slate-300 to-slate-400',
          'from-orange-300 via-amber-500 to-orange-600',
        ]
        const rankGradient = rankTones[index] || 'from-sky-300 via-cyan-400 to-teal-500'
        const cardHighlight = index === 0
          ? 'border-amber-300/80 bg-gradient-to-r from-amber-50 to-orange-50'
          : 'border-[var(--line-soft)] bg-white/75'

        const badge = () => {
          if (index === 0) return '01'
          if (index === 1) return '02'
          if (index === 2) return '03'
          return `${index + 1}`.padStart(2, '0')
        }

        return (
          <div
            key={player.id}
            className={`soft-panel rounded-[28px] border p-4 transition-all duration-500 ${cardHighlight}`}
          >
            <div className="flex items-center gap-4">
              <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-lg font-black text-white shadow-lg ${rankGradient}`}>
                {badge()}
              </div>
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-white/80 bg-white shadow-md">
                {avatarUrl ? (
                  <NextImage
                    src={avatarUrl}
                    alt={player.pseudo}
                    width={56}
                    height={56}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--brand)] to-[var(--brand-strong)] text-lg font-black text-white">
                    {player.pseudo.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-lg font-bold text-[var(--ink-1)]">{player.pseudo}</p>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[var(--ink-3)]">
                      {getRankLabel(index)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-[var(--surface-0)] px-4 py-2 text-right">
                    <p className="text-[10px] font-bold uppercase tracking-[0.28em] text-[var(--ink-3)]">Score</p>
                    <p className="text-sm font-black tabular-nums text-[var(--ink-1)]">{formatScore(score)}</p>
                  </div>
                </div>
                <div className="h-4 overflow-hidden rounded-full bg-[rgba(23,32,51,0.08)]">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${rankGradient} transition-all duration-700 ease-out`}
                    style={{
                      width: `${progress}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
