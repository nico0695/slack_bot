import { isIP } from 'net'

import {
  BRIDGE_BLOCKED_HOSTNAMES,
  BRIDGE_BLOCKED_HOSTNAME_SUFFIXES,
} from '../constants/bridge.constants'

// IPv4 ranges that must never be reached from the server: [network, prefix length]
const BLOCKED_IPV4_RANGES: Array<[string, number]> = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]

const ipv4ToNumber = (ip: string): number =>
  ip.split('.').reduce((acc, octet) => acc * 256 + parseInt(octet, 10), 0)

const isBlockedIpv4 = (ip: string): boolean => {
  const value = ipv4ToNumber(ip)

  return BLOCKED_IPV4_RANGES.some(([network, prefix]) => {
    const size = 2 ** (32 - prefix)
    const start = ipv4ToNumber(network)
    return value >= start && value < start + size
  })
}

const isBlockedIpv6 = (ip: string): boolean => {
  const normalized = ip.toLowerCase()

  if (normalized === '::' || normalized === '::1') return true

  // IPv4-mapped addresses, dotted (::ffff:127.0.0.1) or hex (::ffff:7f00:1)
  const mapped = normalized.match(/^::ffff:(.+)$/)
  if (mapped) {
    const rest = mapped[1]
    if (isIP(rest) === 4) return isBlockedIpv4(rest)

    const hex = rest.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
    if (hex) {
      const high = parseInt(hex[1], 16)
      const low = parseInt(hex[2], 16)
      return isBlockedIpv4([high >> 8, high & 255, low >> 8, low & 255].join('.'))
    }

    return true
  }

  const firstHextet = parseInt(normalized.split(':')[0] || '0', 16)

  return (
    (firstHextet & 0xfe00) === 0xfc00 || // fc00::/7 unique local
    (firstHextet & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (firstHextet & 0xff00) === 0xff00 // ff00::/8 multicast
  )
}

/**
 * Whether an IP address belongs to a loopback, private, link-local or reserved range
 */
export const isBlockedIp = (ip: string): boolean => {
  const version = isIP(ip)

  if (version === 4) return isBlockedIpv4(ip)
  if (version === 6) return isBlockedIpv6(ip)

  return true
}

export const isPrivateNetworkAllowed = (): boolean =>
  process.env.BRIDGE_WEBHOOK_ALLOW_PRIVATE === 'true'

/**
 * Validate a bridge base URL. Returns an error message, or null when it is valid
 */
export const getBridgeBaseUrlError = (value: string): string | null => {
  let url: URL

  try {
    url = new URL(value)
  } catch {
    return 'La URL no es válida'
  }

  if (url.protocol !== 'https:') return 'La URL debe usar HTTPS'
  if (url.username || url.password) return 'La URL no debe incluir credenciales'
  if (url.search || url.hash) return 'La URL base no debe incluir query ni fragmento'

  if (isPrivateNetworkAllowed()) return null

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')

  if (
    BRIDGE_BLOCKED_HOSTNAMES.includes(hostname) ||
    BRIDGE_BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    return 'La URL no puede apuntar a un host local o interno'
  }

  if (isIP(hostname) && isBlockedIp(hostname)) {
    return 'La URL no puede apuntar a una IP privada o reservada'
  }

  return null
}

/**
 * Normalize a valid bridge base URL removing trailing slashes
 */
export const normalizeBridgeBaseUrl = (value: string): string => {
  const url = new URL(value)
  url.pathname = url.pathname.replace(/\/+$/, '')

  return url.toString().replace(/\/+$/, '')
}
