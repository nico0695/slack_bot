/**
 * Format text to date
 * @param dateText string - YYYY-MM-DD HH:mm:ss | 9w9d9h9m (optionals)
 * @returns Date
 */
export function formatTextToDate(dateText: string): Date {
  const date = new Date(dateText)

  if (date.toString() !== 'Invalid Date') {
    return date
  }

  // Format w d h m to date

  const newDate = new Date()

  if (dateText.includes('w')) {
    const weeks = parseInt(dateText.split('w')[0], 10)
    newDate.setDate(newDate.getDate() + weeks * 7)
  }

  if (dateText.includes('d')) {
    const days = parseInt(dateText.split('d')[0], 10)
    newDate.setDate(newDate.getDate() + days)
  }

  if (dateText.includes('h')) {
    const hours = parseInt(dateText.split('h')[0], 10)
    newDate.setHours(newDate.getHours() + hours)
  }

  if (dateText.includes('m')) {
    const minutes = parseInt(dateText.split('m')[0], 10)
    newDate.setMinutes(newDate.getMinutes() + minutes)
  }

  return newDate
}

export const formatDateToText = (date: Date, local: 'es' | 'en' = 'es', options?: any): string => {
  return new Intl.DateTimeFormat(
    local,
    options ?? {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    }
  ).format(date)
}
