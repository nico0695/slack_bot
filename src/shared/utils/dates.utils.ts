/**
 * Format text to date
 * @param dateText string - YYYY-MM-DD HH:mm[:ss] interpreted as Argentina local time OR relative 9w9d9h9m (optionals)
 * @returns Date
 */
export function formatTextToDate(dateText: string): Date {
  const raw = (dateText || '').trim()
  const absolutePattern = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/

  const date = new Date(raw)

  if (date.toString() !== 'Invalid Date' && absolutePattern.test(raw)) {
    // Interpret the naive date/time as Argentina local time (UTC-3, offset minutes = 180)
    const ARG_OFFSET_MINUTES = 180 // Argentina (UTC-3) timezoneOffset
    const serverOffsetMinutes = new Date().getTimezoneOffset() // minutes between UTC and server local
    const diffMinutes = ARG_OFFSET_MINUTES - serverOffsetMinutes
    return new Date(date.getTime() + diffMinutes * 60000)
  }

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

export const formatDateToText = (
  date: Date,
  local: 'es' | 'en' = 'es',
  options?: {
    weekday?: 'long' | 'short' | 'narrow'
    era?: 'long' | 'short' | 'narrow'
    year?: 'numeric' | '2-digit'
    month?: 'numeric' | '2-digit' | 'long' | 'short' | 'narrow'
    day?: 'numeric' | '2-digit'
    hour?: 'numeric' | '2-digit'
    minute?: 'numeric' | '2-digit'
    timeZone?: string // Argentina timezone by default
  }
): string => {
  const baseOptions: Intl.DateTimeFormatOptions = options ?? {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  }

  if (!baseOptions.timeZone) {
    baseOptions.timeZone = 'America/Argentina/Buenos_Aires'
  }

  return new Intl.DateTimeFormat(local, baseOptions).format(date)
}

/**
 * Formats the time difference between a target date and the current time.
 * @param {Date} targetDate The date of the alert.
 * @returns {string} The formatted time string (e.g., "en 1 día", "en 3 horas").
 */
export const formatTimeLeft = (targetDate: Date): string => {
  const now = new Date()
  const diffInMilliseconds = targetDate.getTime() - now.getTime()

  // If the alert is in the past, return a simple message
  if (diffInMilliseconds < 0) {
    return 'Alerta vencida'
  }

  // Calculate the time components
  const seconds = Math.floor(diffInMilliseconds / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  // Determine the largest unit and format the string
  if (days > 0) {
    const remainingHours = hours % 24
    return `${days} día${days > 1 ? 's' : ''}${
      remainingHours > 0 ? ` y ${remainingHours} hora${remainingHours > 1 ? 's' : ''}` : ''
    }`
  } else if (hours > 0) {
    const remainingMinutes = minutes % 60
    return `${hours} hora${hours > 1 ? 's' : ''}${
      remainingMinutes > 0 ? ` y ${remainingMinutes} minuto${remainingMinutes > 1 ? 's' : ''}` : ''
    }`
  } else if (minutes > 0) {
    const remainingSeconds = seconds % 60
    return `${minutes} minuto${minutes > 1 ? 's' : ''}${
      remainingSeconds > 0 ? ` y ${remainingSeconds} segundo${remainingSeconds > 1 ? 's' : ''}` : ''
    }`
  } else {
    return `${seconds} segundo${seconds > 1 ? 's' : ''}`
  }
}
