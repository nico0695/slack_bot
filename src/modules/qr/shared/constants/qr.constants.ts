import { IQrShortcut, IQrVisualOptions } from '../interfaces/qr.interfaces'

export const QR_DEFAULTS: IQrVisualOptions = {
  foregroundColor: '#000000',
  backgroundColor: '#FFFFFF',
  errorCorrectionLevel: 'M',
}

export const QR_SHORTCUTS: Record<string, IQrShortcut> = {
  wa: {
    flag: '-wa',
    description: 'WhatsApp link: -wa <number> <message>',
    format: (args: string): string | null => {
      const match = args.match(/^(\S+)\s+(.+)$/)
      if (!match) return null
      const [, number, message] = match
      return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
    },
  },
  tl: {
    flag: '-tl',
    description: 'Telegram link: -tl <username>',
    format: (args: string): string | null => {
      const username = args.trim()
      if (!username) return null
      return `https://t.me/${username}`
    },
  },
  ig: {
    flag: '-ig',
    description: 'Instagram link: -ig <username>',
    format: (args: string): string | null => {
      const username = args.trim()
      if (!username) return null
      return `https://instagram.com/${username}`
    },
  },
  wifi: {
    flag: '-wifi',
    description: 'WiFi config: -wifi <ssid> <password>',
    format: (args: string): string | null => {
      const match = args.match(/^(\S+)\s+(\S+)$/)
      if (!match) return null
      const [, ssid, password] = match
      return `WIFI:T:WPA;S:${ssid};P:${password};;`
    },
  },
  mail: {
    flag: '-mail',
    description: 'Email link: -mail <address> <subject>',
    format: (args: string): string | null => {
      const match = args.match(/^(\S+)\s+(.+)$/)
      if (!match) return null
      const [, address, subject] = match
      return `mailto:${address}?subject=${encodeURIComponent(subject)}`
    },
  },
}
