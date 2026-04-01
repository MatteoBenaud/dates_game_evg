export type GameStatus = 'waiting' | 'started' | 'finished'

export type QuestionStatus = 'locked' | 'open' | 'closed' | 'revealed'

export interface PlayerWithScore {
  id: string
  pseudo: string
  total_score: number
  connected: boolean
}

export interface QuestionWithAnswers {
  id: string
  question_number: number
  text: string
  status: QuestionStatus
  correct_date?: string // Only available when revealed
  answers?: Array<{
    player_id: string
    pseudo: string
    submitted_date: string
    score: number | null
  }>
}

export interface GameState {
  id: string
  code: string
  status: GameStatus
  current_question_index: number
  players: PlayerWithScore[]
  questions: QuestionWithAnswers[]
}

export interface LeaderboardEntry {
  rank: number
  pseudo: string
  total_score: number
  player_id: string
}
