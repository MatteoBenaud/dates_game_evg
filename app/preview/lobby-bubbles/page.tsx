import BubbleLobby from '@/components/BubbleLobby'

function createAvatarDataUrl(label: string, background: string): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${background}" />
          <stop offset="100%" stop-color="#172033" />
        </linearGradient>
      </defs>
      <rect width="240" height="240" rx="120" fill="url(#grad)" />
      <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
        font-family="Arial, sans-serif" font-size="88" font-weight="700" fill="white">
        ${label}
      </text>
    </svg>
  `

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const previewPlayers = [
  { id: '1', pseudo: 'Matteo', avatar_url: createAvatarDataUrl('M', '#d8572a'), connected: true },
  { id: '2', pseudo: 'Chloe', avatar_url: createAvatarDataUrl('C', '#0f766e'), connected: true },
  { id: '3', pseudo: 'Lucas', avatar_url: createAvatarDataUrl('L', '#123c75'), connected: true },
  { id: '4', pseudo: 'Sarah', avatar_url: createAvatarDataUrl('S', '#af421c'), connected: true },
  { id: '5', pseudo: 'Nassim', avatar_url: createAvatarDataUrl('N', '#7c3aed'), connected: true },
  { id: '6', pseudo: 'Emma', avatar_url: createAvatarDataUrl('E', '#be123c'), connected: true },
  { id: '7', pseudo: 'Theo', avatar_url: createAvatarDataUrl('T', '#1d4ed8'), connected: true },
  { id: '8', pseudo: 'Camille', avatar_url: createAvatarDataUrl('C', '#059669'), connected: true },
  { id: '9', pseudo: 'Jules', avatar_url: createAvatarDataUrl('J', '#ea580c'), connected: true },
  { id: '10', pseudo: 'Ines', avatar_url: createAvatarDataUrl('I', '#475569'), connected: true },
]

export default function LobbyBubblesPreviewPage() {
  return (
    <div className="app-shell px-4 py-6 md:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="glass-panel rounded-[32px] p-8">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-[var(--ink-3)]">Preview</p>
              <h1 className="section-title mt-3 text-4xl font-black text-[var(--ink-1)] md:text-5xl">
                Lobby anime avec 10 joueurs
              </h1>
              <p className="mt-3 max-w-2xl text-[var(--ink-2)]">
                Apercu du salon avant lancement de la partie, avec les bulles mobiles et les avatars.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="metric-card rounded-[20px] px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--ink-3)]">Code</p>
                <p className="mt-2 font-mono text-3xl font-black text-[var(--brand)]">482931</p>
              </div>
              <div className="metric-card rounded-[20px] px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[var(--ink-3)]">Joueurs</p>
                <p className="mt-2 text-3xl font-black text-[var(--accent)]">{previewPlayers.length}</p>
              </div>
            </div>
          </div>

          <BubbleLobby players={previewPlayers} />

          <div className="mt-6 flex justify-center">
            <button className="action-primary rounded-[22px] px-8 py-4 text-lg font-black uppercase tracking-[0.16em]">
              Lancer la partie
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
