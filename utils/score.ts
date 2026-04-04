/**
 * Calculate the score (difference in days) between submitted date and correct date
 * Lower score is better
 */
export function calculateScore(submittedDate: string, correctDate: string): number {
  const submitted = new Date(submittedDate)
  const correct = new Date(correctDate)

  const diffTime = Math.abs(submitted.getTime() - correct.getTime())
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

  return diffDays
}

/**
 * Penalty for a missing answer:
 * - same score as the farthest answer
 * - but if every submitted answer is perfect (or nobody answered), use 30 days
 */
export function calculateMissingAnswerScore(answeredScores: number[]): number {
  if (answeredScores.length === 0) return 30

  const maxAnsweredScore = Math.max(...answeredScores, 0)
  return maxAnsweredScore === 0 ? 30 : maxAnsweredScore
}

/**
 * Display a score as years + days, except when below one year.
 */
export function formatScore(scoreInDays: number | null | undefined): string {
  const totalDays = Math.max(0, Math.round(scoreInDays || 0))

  if (totalDays < 365) {
    return `${totalDays} jours`
  }

  const years = Math.floor(totalDays / 365)
  const days = totalDays % 365

  if (days === 0) {
    return `${years} ${years > 1 ? 'ans' : 'an'}`
  }

  return `${years} ${years > 1 ? 'ans' : 'an'} ${days} jours`
}

/**
 * Format a date for display
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

/**
 * Generate a random 6-digit code
 */
export function generateGameCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}
