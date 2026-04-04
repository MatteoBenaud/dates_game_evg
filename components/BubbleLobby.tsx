'use client'

import { useEffect, useRef, useState } from 'react'

interface Player {
  id: string
  pseudo: string
  avatar_url?: string | null
  connected: boolean | null
}

interface Bubble {
  id: string
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  player: Player
}

interface BubbleLobbyProps {
  players: Player[]
}

export default function BubbleLobby({ players }: BubbleLobbyProps) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [bubbles, setBubbles] = useState<Bubble[]>([])
  const bubblesRef = useRef<Bubble[]>([])
  const animationRef = useRef<number | undefined>(undefined)

  // Initialize bubbles when players change
  useEffect(() => {
    if (!canvasRef.current) return

    const container = canvasRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    const newBubbles: Bubble[] = players.map((player, index) => {
      // Find existing bubble for this player
      const existing = bubblesRef.current.find(b => b.id === player.id)

      if (existing) {
        return { ...existing, player }
      }

      // Create new bubble with random position and velocity
      const radius = 60
      return {
        id: player.id,
        x: Math.random() * (width - radius * 2) + radius,
        y: Math.random() * (height - radius * 2) + radius,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        radius,
        player,
      }
    })

    bubblesRef.current = newBubbles
    setBubbles(newBubbles)
  }, [players])

  // Animation loop
  useEffect(() => {
    if (!canvasRef.current || bubbles.length === 0) return

    const animate = () => {
      const container = canvasRef.current
      if (!container) return

      const width = container.clientWidth
      const height = container.clientHeight

      const newBubbles = bubblesRef.current.map(bubble => {
        let { x, y, vx, vy, radius } = bubble

        // Update position
        x += vx
        y += vy

        // Bounce off walls
        if (x - radius < 0 || x + radius > width) {
          vx = -vx
          x = x - radius < 0 ? radius : width - radius
        }
        if (y - radius < 0 || y + radius > height) {
          vy = -vy
          y = y - radius < 0 ? radius : height - radius
        }

        return { ...bubble, x, y, vx, vy }
      })

      // Check collisions between bubbles
      for (let i = 0; i < newBubbles.length; i++) {
        for (let j = i + 1; j < newBubbles.length; j++) {
          const b1 = newBubbles[i]
          const b2 = newBubbles[j]

          const dx = b2.x - b1.x
          const dy = b2.y - b1.y
          const distance = Math.sqrt(dx * dx + dy * dy)
          const minDist = b1.radius + b2.radius

          if (distance < minDist) {
            // Simple elastic collision
            const angle = Math.atan2(dy, dx)
            const sin = Math.sin(angle)
            const cos = Math.cos(angle)

            // Swap velocities along collision axis
            const vx1 = b1.vx * cos + b1.vy * sin
            const vy1 = b1.vy * cos - b1.vx * sin
            const vx2 = b2.vx * cos + b2.vy * sin
            const vy2 = b2.vy * cos - b2.vx * sin

            // Update velocities
            b1.vx = vx2 * cos - vy1 * sin
            b1.vy = vy1 * cos + vx2 * sin
            b2.vx = vx1 * cos - vy2 * sin
            b2.vy = vy2 * cos + vx1 * sin

            // Separate overlapping bubbles
            const overlap = minDist - distance
            const moveX = (overlap / 2) * cos
            const moveY = (overlap / 2) * sin

            b1.x -= moveX
            b1.y -= moveY
            b2.x += moveX
            b2.y += moveY
          }
        }
      }

      bubblesRef.current = newBubbles
      setBubbles([...newBubbles])

      animationRef.current = requestAnimationFrame(animate)
    }

    animationRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [bubbles.length])

  return (
    <div
      ref={canvasRef}
      className="relative w-full h-[500px] bg-gradient-to-br from-purple-100 via-pink-100 to-blue-100 rounded-2xl overflow-hidden shadow-inner"
    >
      {bubbles.map((bubble) => (
        <div
          key={bubble.id}
          className="absolute transition-none"
          style={{
            left: `${bubble.x}px`,
            top: `${bubble.y}px`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className="relative">
            {/* Bubble glow effect */}
            <div className="absolute inset-0 rounded-full bg-white opacity-30 blur-xl scale-150" />

            {/* Main bubble */}
            <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-white to-purple-200 border-4 border-white shadow-2xl overflow-hidden flex items-center justify-center">
              {bubble.player.avatar_url ? (
                <img
                  src={bubble.player.avatar_url}
                  alt={bubble.player.pseudo}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-purple-400 to-pink-400 flex items-center justify-center">
                  <span className="text-4xl font-bold text-white">
                    {bubble.player.pseudo.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              {/* Shine effect */}
              <div className="absolute top-4 left-4 w-8 h-8 rounded-full bg-white opacity-40 blur-sm" />
            </div>

            {/* Player name tag */}
            <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
              <div className="bg-white px-4 py-2 rounded-full shadow-lg border-2 border-purple-300">
                <span className="font-bold text-gray-800">{bubble.player.pseudo}</span>
              </div>
            </div>

            {/* Connection status indicator */}
            <div className="absolute top-0 right-0 w-6 h-6">
              <div className={`w-full h-full rounded-full border-2 border-white ${
                bubble.player.connected ? 'bg-green-500' : 'bg-red-500'
              }`} />
            </div>
          </div>
        </div>
      ))}

      {/* Empty state */}
      {bubbles.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-6xl mb-4">👥</div>
            <p className="text-xl font-semibold text-gray-600">En attente des joueurs...</p>
          </div>
        </div>
      )}
    </div>
  )
}
