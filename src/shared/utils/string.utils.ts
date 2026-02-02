export const truncateText = (text: string, maxLength: number): string => {
  if (!text) return ''
  const cleaned = text.trim().replace(/\s+/g, ' ')
  if (cleaned.length <= maxLength) return cleaned
  return cleaned.slice(0, maxLength - 2) + '..'
}
