export const generateRandomFileName = (): string => {
  const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let fileName = ''
  for (let i = 0; i < 10; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length)
    fileName += characters[randomIndex]
  }
  return fileName
}
