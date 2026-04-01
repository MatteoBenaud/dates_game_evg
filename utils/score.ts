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
