import NextImage from 'next/image'

interface PreviewPlayer {
  id: string
  pseudo: string
  avatar_url: string
  hasAnswered: boolean
}

function createAvatarDataUrl(label: string, background: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <rect width="96" height="96" rx="48" fill="${background}" />
      <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="white">
        ${label}
      </text>
    </svg>
  `

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const previewPlayers: PreviewPlayer[] = [
  { id: '1', pseudo: 'Matteo', avatar_url: createAvatarDataUrl('M', '#d8572a'), hasAnswered: true },
  { id: '2', pseudo: 'Chloe', avatar_url: createAvatarDataUrl('C', '#0f766e'), hasAnswered: true },
  { id: '3', pseudo: 'Lucas', avatar_url: createAvatarDataUrl('L', '#123c75'), hasAnswered: false },
  { id: '4', pseudo: 'Sarah', avatar_url: createAvatarDataUrl('S', '#af421c'), hasAnswered: true },
  { id: '5', pseudo: 'Nassim', avatar_url: createAvatarDataUrl('N', '#7c3aed'), hasAnswered: true },
  { id: '6', pseudo: 'Emma', avatar_url: createAvatarDataUrl('E', '#be123c'), hasAnswered: false },
  { id: '7', pseudo: 'Theo', avatar_url: createAvatarDataUrl('T', '#1d4ed8'), hasAnswered: true },
  { id: '8', pseudo: 'Camille', avatar_url: createAvatarDataUrl('C', '#059669'), hasAnswered: false },
  { id: '9', pseudo: 'Jules', avatar_url: createAvatarDataUrl('J', '#ea580c'), hasAnswered: true },
  { id: '10', pseudo: 'Ines', avatar_url: createAvatarDataUrl('I', '#475569'), hasAnswered: true },
]

export default function HostWallPreviewPage() {
  const answeredCount = previewPlayers.filter((player) => player.hasAnswered).length

  return (
    <div className="app-shell px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="glass-panel mb-6 rounded-[32px] p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-[var(--ink-3)]">Preview</p>
              <h1 className="section-title mt-2 text-4xl font-black text-[var(--ink-1)]">Mur des reponses avec 10 joueurs</h1>
            </div>
            <div className="text-right">
              <p className="text-[var(--ink-2)]">Question 4 / 10</p>
              <p className="text-[var(--ink-2)]">Code: <span className="font-mono font-bold text-[var(--brand)]">482931</span></p>
            </div>
          </div>

          <div className="metric-card mb-6 rounded-[28px] p-6">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[var(--ink-3)]">Question en cours</p>
            <p className="mt-3 text-3xl font-black text-[var(--ink-1)]">
              En quelle annee est sortie la premiere console PlayStation ?
            </p>
          </div>

          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-medium text-[var(--ink-2)]">Reponses recues</p>
              <p className="text-2xl font-black text-[var(--accent)]">{answeredCount} / {previewPlayers.length}</p>
            </div>
            <div className="h-4 w-full rounded-full bg-[rgba(23,32,51,0.08)]">
              <div
                className="h-4 rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--brand)]"
                style={{ width: `${(answeredCount / previewPlayers.length) * 100}%` }}
              />
            </div>
          </div>

          <div className="metric-card mb-6 rounded-[28px] p-5">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.28em] text-[var(--ink-3)]">Statut des joueurs</p>
                <p className="mt-1 text-sm text-[var(--ink-2)]">Vert = reponse envoyee. Gris = en attente.</p>
              </div>
              <div className="rounded-full bg-white/80 px-3 py-2 text-xs font-black uppercase tracking-[0.16em] text-[var(--ink-2)]">
                {answeredCount} / {previewPlayers.length}
              </div>
            </div>

            <div className="grid max-h-56 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4">
              {previewPlayers.map((player) => (
                <div
                  key={player.id}
                  className={`flex items-center gap-3 rounded-[20px] border px-3 py-2.5 ${
                    player.hasAnswered
                      ? 'border-emerald-200 bg-emerald-50/80'
                      : 'border-[var(--line-soft)] bg-white/80'
                  }`}
                >
                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-white/80 bg-[rgba(23,32,51,0.08)]">
                    <NextImage
                      src={player.avatar_url}
                      alt={player.pseudo}
                      fill
                      unoptimized
                      sizes="44px"
                      className="object-cover"
                    />

                    <span
                      className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${
                        player.hasAnswered ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[var(--ink-1)]">{player.pseudo}</p>
                    <p className={`text-xs font-medium ${player.hasAnswered ? 'text-emerald-700' : 'text-[var(--ink-3)]'}`}>
                      {player.hasAnswered ? 'A repondu' : 'En attente'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button className="action-primary w-full rounded-[22px] px-6 py-4 text-lg font-black uppercase tracking-[0.16em]">
            Reveler les reponses
          </button>
        </div>
      </div>
    </div>
  )
}
