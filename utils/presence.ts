export const PLAYER_STALE_AFTER_MS = 45_000

export function isPlayerConsideredConnected(player: {
  connected?: boolean | null
  last_seen?: string | null
}) {
  if (!player.connected) return false
  if (!player.last_seen) return false

  return Date.now() - new Date(player.last_seen).getTime() <= PLAYER_STALE_AFTER_MS
}
