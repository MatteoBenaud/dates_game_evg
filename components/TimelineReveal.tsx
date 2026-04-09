'use client'

import NextImage from 'next/image'
import { useEffect, useState } from 'react'
import { formatScore } from '@/utils/score'
import { getPlayerAvatarUrl } from '@/utils/storage'

interface Player {
  id: string
  pseudo: string
  avatar_url?: string | null
  avatar_storage_path?: string | null
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

interface RevealEntry {
  id: string
  pseudo: string
  avatar_url?: string | null
  submitted_date: string
  score: number
  diffDays: number
  side: 'before' | 'after' | 'exact'
}

type RevealPhase = 'rumble' | 'answer-flash' | 'dropzone' | 'complete'

function formatDisplayDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function getDiffLabel(diffDays: number) {
  if (diffDays === 0) return 'Pile le bon jour'
  if (diffDays < 0) return `${Math.abs(diffDays)} j trop tot`
  return `${diffDays} j trop tard`
}

export default function TimelineReveal({ correctDate, answers, players, onComplete }: TimelineRevealProps) {
  const [entries] = useState<RevealEntry[]>(() =>
    answers
      .map((answer) => {
        const player = players.find((candidate) => candidate.id === answer.player_id)
        const diffMs = new Date(answer.submitted_date).getTime() - new Date(correctDate).getTime()
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
        const side: RevealEntry['side'] = diffDays === 0 ? 'exact' : diffDays < 0 ? 'before' : 'after'

        return {
          id: answer.id,
          pseudo: player?.pseudo || 'Joueur mystere',
          avatar_url: player ? getPlayerAvatarUrl(player) : null,
          submitted_date: answer.submitted_date,
          score: answer.score || 0,
          diffDays,
          side,
        }
      })
      .sort((a, b) => a.score - b.score)
  )

  const [phase, setPhase] = useState<RevealPhase>('rumble')
  const [visibleIds, setVisibleIds] = useState<string[]>([])
  const [readyForNext, setReadyForNext] = useState(false)
  const furthestDistance = Math.max(...entries.map((entry) => Math.abs(entry.diffDays)), 1)
  const baseTrackPadding = 10
  const laneCount = Math.min(6, Math.max(3, Math.ceil(entries.length / 2)))
  const cardWidth = entries.length >= 10 ? 148 : entries.length >= 7 ? 158 : 170
  const rowGap = entries.length >= 10 ? 62 : 72
  const trackHeight = Math.max(300, laneCount * rowGap + 84)
  const getTrackPosition = (entry: RevealEntry) => {
    const normalized = (entry.diffDays + furthestDistance) / (furthestDistance * 2 || 1)
    const span = 100 - baseTrackPadding * 2
    return baseTrackPadding + normalized * span
  }

  const getVerticalLane = (index: number) => {
    return index % laneCount
  }

  useEffect(() => {
    const timers: NodeJS.Timeout[] = []
    const rumbleDuration = 1700
    const answerFlashDuration = 1500
    const revealDelay = 620

    timers.push(setTimeout(() => setPhase('answer-flash'), rumbleDuration))
    timers.push(setTimeout(() => setPhase('dropzone'), rumbleDuration + answerFlashDuration))

    entries.forEach((entry, index) => {
      timers.push(
        setTimeout(() => {
          setVisibleIds((current) => [...current, entry.id])

          if (index === entries.length - 1) {
            timers.push(
              setTimeout(() => {
                setPhase('complete')
                setReadyForNext(true)
              }, 500)
            )
          }
        }, rumbleDuration + answerFlashDuration + 350 + index * revealDelay)
      )
    })

    if (entries.length === 0) {
      timers.push(
        setTimeout(() => {
          setPhase('complete')
          setReadyForNext(true)
        }, rumbleDuration + answerFlashDuration + 600)
      )
    }

    return () => {
      timers.forEach((timer) => clearTimeout(timer))
    }
  }, [entries])

  return (
    <div className="relative min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_top,_rgba(216,87,42,0.24),_transparent_22%),radial-gradient(circle_at_80%_20%,_rgba(14,116,144,0.24),_transparent_18%),linear-gradient(180deg,_#1c1830_0%,_#0d1324_48%,_#0a1020_100%)] px-4 py-8 text-white md:px-8">
      <style jsx>{`
        @keyframes float-in {
          0% { opacity: 0; transform: translateY(40px) scale(0.94) rotate(-3deg); }
          100% { opacity: 1; transform: translateY(0) scale(1) rotate(0deg); }
        }

        @keyframes pulse-ring {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.08); opacity: 1; }
        }

        @keyframes stage-rumble {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
          12% { transform: translate3d(-6px, 2px, 0) rotate(-0.5deg); }
          24% { transform: translate3d(6px, -2px, 0) rotate(0.5deg); }
          36% { transform: translate3d(-9px, 1px, 0) rotate(-0.7deg); }
          48% { transform: translate3d(9px, -1px, 0) rotate(0.7deg); }
          60% { transform: translate3d(-6px, 2px, 0) rotate(-0.4deg); }
          72% { transform: translate3d(6px, -2px, 0) rotate(0.4deg); }
          84% { transform: translate3d(-3px, 1px, 0) rotate(-0.2deg); }
        }

        @keyframes suspense-glow {
          0%, 100% { box-shadow: 0 0 0 rgba(255,255,255,0.05); opacity: 0.75; }
          50% { box-shadow: 0 0 40px rgba(255,255,255,0.22); opacity: 1; }
        }

        @keyframes answer-burst {
          0% { opacity: 0; transform: translateY(18px) scale(0.92); letter-spacing: 0.2em; }
          100% { opacity: 1; transform: translateY(0) scale(1); letter-spacing: 0.04em; }
        }

        @keyframes glow-up {
          0% { opacity: 0.3; transform: scaleX(0.92); }
          100% { opacity: 1; transform: scaleX(1); }
        }

        .card-float {
          animation: float-in 480ms cubic-bezier(0.2, 1, 0.22, 1) forwards;
        }

        .ring-pulse {
          animation: pulse-ring 1.9s ease-in-out infinite;
        }

        .stage-rumble {
          animation: stage-rumble 1000ms cubic-bezier(0.36, 0.07, 0.19, 0.97) infinite;
        }

        .suspense-glow {
          animation: suspense-glow 1.2s ease-in-out infinite;
        }

        .answer-burst {
          animation: answer-burst 420ms cubic-bezier(0.2, 1, 0.22, 1) forwards;
        }

        .track-glow {
          animation: glow-up 450ms ease-out forwards;
          transform-origin: center;
        }
      `}</style>

      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-[7%] top-16 h-44 w-44 rounded-full bg-[rgba(216,87,42,0.14)] blur-3xl" />
        <div className="absolute right-[10%] top-24 h-52 w-52 rounded-full bg-[rgba(45,212,191,0.12)] blur-3xl" />
        <div className="absolute bottom-8 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-[rgba(99,102,241,0.12)] blur-3xl" />
      </div>

      {(phase === 'rumble' || phase === 'answer-flash') && (
        <div className="relative mx-auto mb-8 flex min-h-[38vh] max-w-4xl items-center justify-center">
          <div className={`w-full max-w-3xl rounded-[36px] border border-white/12 bg-white/8 px-8 py-10 text-center shadow-2xl backdrop-blur-xl ${phase === 'rumble' ? 'stage-rumble suspense-glow' : ''}`}>
            <p className="mb-4 text-xs font-black uppercase tracking-[0.36em] text-white/45">Suspense</p>
            {phase === 'rumble' ? (
              <>
                <p className="section-title text-5xl font-black text-white md:text-6xl">
                  La vraie date arrive...
                </p>
                <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-white/70">
                  Plus personne ne peut changer sa réponse. On ouvre l’enveloppe.
                </p>
                <div className="mx-auto mt-8 flex h-24 w-24 items-center justify-center rounded-full bg-[var(--brand)]/85 text-5xl shadow-[0_0_60px_rgba(216,87,42,0.35)]">
                  ⏳
                </div>
              </>
            ) : (
              <div className="answer-burst">
                <p className="text-sm font-black uppercase tracking-[0.34em] text-white/55">Bonne réponse</p>
                <p className="section-title mt-5 text-6xl font-black text-white md:text-7xl">
                  {formatDisplayDate(correctDate)}
                </p>
                <p className="mx-auto mt-5 max-w-xl text-lg text-white/72">
                  Et maintenant, on regarde où chacun s’est posé sur la frise.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`relative mx-auto max-w-7xl transition-opacity duration-500 ${phase === 'dropzone' || phase === 'complete' ? 'opacity-100' : 'opacity-0'}`}>
        <div className="mb-8 text-center">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.34em] text-white/55">Reveal show</p>
          <h2 className="section-title text-5xl font-black tracking-tight text-white md:text-6xl">
            Le mur des reponses
          </h2>
          <p className="mx-auto mt-4 max-w-3xl text-base leading-7 text-white/70 md:text-lg">
            Chacun envoie sa date. Le plateau les place avant ou apres la vraie date, puis le classement prend le relais.
          </p>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
          <section className="rounded-[32px] border border-white/10 bg-white/8 p-5 shadow-2xl backdrop-blur-xl md:p-8">
            <div className="mb-6 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-white/45">Date exacte</p>
                <div className="mt-3 inline-flex items-center gap-4 rounded-[24px] border border-white/12 bg-white/10 px-5 py-4">
                  <div className={`relative flex h-16 w-16 items-center justify-center rounded-full bg-[var(--brand)] ${phase !== 'complete' ? 'ring-pulse' : ''}`}>
                    <span className="text-3xl">🎯</span>
                  </div>
                  <div>
                    <p className="text-sm text-white/55">La bonne réponse était</p>
                    <p className="text-3xl font-black text-white">{formatDisplayDate(correctDate)}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 md:w-[320px]">
                <div className="rounded-[22px] bg-white/10 px-4 py-3 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/45">Reponses</p>
                  <p className="mt-2 text-3xl font-black">{entries.length}</p>
                </div>
                <div className="rounded-[22px] bg-white/10 px-4 py-3 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/45">Meilleure</p>
                  <p className="mt-2 text-3xl font-black">{entries[0]?.score ?? 0}</p>
                </div>
                <div className="rounded-[22px] bg-white/10 px-4 py-3 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/45">Ecart max</p>
                  <p className="mt-2 text-3xl font-black">{furthestDistance}</p>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[28px] border border-white/12 bg-[linear-gradient(180deg,_rgba(255,255,255,0.08),_rgba(255,255,255,0.02))] px-4 py-10 md:px-8">
              <div className={`absolute left-6 right-6 top-1/2 h-3 -translate-y-1/2 rounded-full bg-gradient-to-r from-rose-400 via-amber-300 via-emerald-300 to-sky-400 shadow-[0_0_40px_rgba(255,255,255,0.18)] ${phase === 'dropzone' || phase === 'complete' ? 'track-glow' : 'opacity-40'}`} />

              <div className="pointer-events-none absolute inset-y-8 left-1/2 w-[2px] -translate-x-1/2 bg-white/80 shadow-[0_0_24px_rgba(255,255,255,0.5)]">
                <div className="absolute -top-2 left-1/2 h-5 w-5 -translate-x-1/2 rounded-full border-4 border-[#0d1324] bg-[var(--brand)]" />
                <div className="absolute -bottom-14 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-xs font-black uppercase tracking-[0.22em] text-[#0d1324] shadow-lg">
                  exact
                </div>
              </div>

              <div className="relative" style={{ height: `${trackHeight}px` }}>
                {entries.map((entry, index) => {
                  const visible = visibleIds.includes(entry.id)
                  const lane = getVerticalLane(index)
                  const topOffset = 18 + lane * rowGap
                  const left = getTrackPosition(entry)
                  const accent = entry.side === 'exact'
                    ? 'from-emerald-300 to-lime-400 text-emerald-950'
                    : entry.side === 'before'
                      ? 'from-sky-300 to-cyan-400 text-sky-950'
                      : 'from-orange-300 to-rose-400 text-rose-950'

                  return (
                    <div
                      key={entry.id}
                      className={`absolute w-[170px] -translate-x-1/2 transition-all duration-500 ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
                      style={{
                        width: `${cardWidth}px`,
                        left: `${left}%`,
                        top: `${topOffset}px`,
                      }}
                    >
                      <div className={`card-float rounded-[24px] border border-white/18 bg-white/92 p-3 text-[#172033] shadow-2xl ${visible ? '' : 'hidden'}`}>
                        <div className="mb-3 flex items-center gap-3">
                          <div className="h-12 w-12 overflow-hidden rounded-2xl bg-slate-200">
                            {entry.avatar_url ? (
                              <NextImage src={entry.avatar_url} alt={entry.pseudo} width={48} height={48} unoptimized className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--brand)] to-[var(--brand-strong)] text-lg font-black text-white">
                                {entry.pseudo.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black">{entry.pseudo}</p>
                            <p className="text-xs text-slate-500">{formatDisplayDate(entry.submitted_date)}</p>
                          </div>
                        </div>
                        <div className={`rounded-2xl bg-gradient-to-r px-3 py-2 text-center text-xs font-black uppercase tracking-[0.16em] ${accent}`}>
                          {getDiffLabel(entry.diffDays)}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {entries.length === 0 && (
                  <div className="absolute inset-0 flex items-center justify-center text-center">
                    <div>
                      <p className="text-6xl">🫥</p>
                      <p className="mt-4 text-xl font-black">Aucune réponse pour cette question</p>
                      <p className="mt-2 text-white/60">Le plateau est vide, mais le jeu continue.</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-8 flex items-center justify-between text-xs font-black uppercase tracking-[0.22em] text-white/45">
                <span>trop tot</span>
                <span>trop tard</span>
              </div>
            </div>
          </section>

          <aside className="rounded-[32px] border border-white/10 bg-white/8 p-5 shadow-2xl backdrop-blur-xl md:p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-white/45">Guess wall</p>
                <h3 className="section-title mt-2 text-3xl font-black">Ce que tout le monde a joué</h3>
              </div>
              <div className="rounded-full bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-white/70">
                {visibleIds.length}/{entries.length}
              </div>
            </div>

            <div className="max-h-[68vh] space-y-3 overflow-auto pr-1">
              {entries.map((entry, index) => {
                const visible = visibleIds.includes(entry.id)
                const rankTone = index === 0
                  ? 'border-emerald-300/40 bg-emerald-200/10'
                  : 'border-white/10 bg-white/6'

                return (
                  <div
                    key={entry.id}
                    className={`rounded-[24px] border px-4 py-3 transition-all duration-500 ${rankTone} ${visible ? 'translate-x-0 opacity-100' : 'translate-x-8 opacity-25'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 overflow-hidden rounded-2xl bg-white/15">
                        {entry.avatar_url ? (
                          <NextImage src={entry.avatar_url} alt={entry.pseudo} width={64} height={64} unoptimized className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--brand)] to-[var(--brand-strong)] text-lg font-black text-white">
                            {entry.pseudo.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-black text-white">{entry.pseudo}</p>
                          <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/75">
                            #{index + 1}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-white/70">{formatDisplayDate(entry.submitted_date)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <span className="font-semibold text-white/75">{getDiffLabel(entry.diffDays)}</span>
                      <span className="text-sm font-black text-white">{formatScore(entry.score)}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {readyForNext && (
              <div className="mt-6 rounded-[26px] bg-white/10 p-4 text-center">
                <p className="mb-3 text-sm font-semibold text-white/70">
                  Tout le monde est placé. On passe au classement ?
                </p>
                <button
                  onClick={onComplete}
                  className="w-full rounded-[20px] bg-gradient-to-r from-[var(--brand)] to-[var(--brand-strong)] px-6 py-4 text-sm font-black uppercase tracking-[0.22em] text-white shadow-xl transition-transform hover:-translate-y-0.5"
                >
                  Voir le classement
                </button>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  )
}
