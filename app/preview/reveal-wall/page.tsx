'use client'

import { useState } from 'react'
import TimelineReveal from '@/components/TimelineReveal'

function createAvatarDataUrl(label: string, background: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="28" fill="${background}" />
      <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="white">
        ${label}
      </text>
    </svg>
  `

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const players = [
  { id: 'p1', pseudo: 'Matteo', avatar_url: createAvatarDataUrl('M', '#d8572a') },
  { id: 'p2', pseudo: 'Chloe', avatar_url: createAvatarDataUrl('C', '#0f766e') },
  { id: 'p3', pseudo: 'Lucas', avatar_url: createAvatarDataUrl('L', '#123c75') },
  { id: 'p4', pseudo: 'Sarah', avatar_url: createAvatarDataUrl('S', '#af421c') },
  { id: 'p5', pseudo: 'Nassim', avatar_url: createAvatarDataUrl('N', '#7c3aed') },
  { id: 'p6', pseudo: 'Emma', avatar_url: createAvatarDataUrl('E', '#be123c') },
  { id: 'p7', pseudo: 'Theo', avatar_url: createAvatarDataUrl('T', '#1d4ed8') },
  { id: 'p8', pseudo: 'Camille', avatar_url: createAvatarDataUrl('C', '#059669') },
  { id: 'p9', pseudo: 'Jules', avatar_url: createAvatarDataUrl('J', '#ea580c') },
  { id: 'p10', pseudo: 'Ines', avatar_url: createAvatarDataUrl('I', '#475569') },
]

const answers = [
  { id: 'a1', player_id: 'p1', submitted_date: '1993-11-15', score: 11 },
  { id: 'a2', player_id: 'p2', submitted_date: '1994-12-03', score: 1 },
  { id: 'a3', player_id: 'p3', submitted_date: '1995-01-18', score: 46 },
  { id: 'a4', player_id: 'p4', submitted_date: '1994-11-30', score: 2 },
  { id: 'a5', player_id: 'p5', submitted_date: '1997-06-20', score: 930 },
  { id: 'a6', player_id: 'p6', submitted_date: '1990-04-05', score: 1704 },
  { id: 'a7', player_id: 'p7', submitted_date: '1994-12-01', score: 0 },
  { id: 'a8', player_id: 'p8', submitted_date: '1994-10-11', score: 51 },
  { id: 'a9', player_id: 'p9', submitted_date: '1996-09-09', score: 648 },
  { id: 'a10', player_id: 'p10', submitted_date: '1994-12-25', score: 24 },
]

export default function RevealWallPreviewPage() {
  const [completed, setCompleted] = useState(false)

  if (completed) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center px-6">
        <div className="glass-panel max-w-xl rounded-[32px] p-8 text-center">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--ink-3)]">Preview</p>
          <h1 className="section-title mt-3 text-4xl font-black text-[var(--ink-1)]">Fin de l’animation</h1>
          <p className="mt-4 text-[var(--ink-2)]">
            La preview a appelé `onComplete`, comme sur la vraie page host.
          </p>
          <button
            onClick={() => setCompleted(false)}
            className="action-primary mt-6 rounded-[20px] px-6 py-4 text-sm font-black uppercase tracking-[0.18em]"
          >
            Rejouer la sequence
          </button>
        </div>
      </div>
    )
  }

  return (
    <TimelineReveal
      correctDate="1994-12-01"
      answers={answers}
      players={players}
      onComplete={() => setCompleted(true)}
    />
  )
}
