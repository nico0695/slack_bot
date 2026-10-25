export interface IBridgeConfig {
  baseUrl: string | null
  enabled: boolean
  secret: string | null
}

export interface IBridgeConfigUpdate {
  baseUrl?: string | null
  secret?: string | null
  enabled?: boolean
}

// Public shape: the secret is never returned, only whether it is set
export interface IBridgeConfigResponse {
  baseUrl: string | null
  enabled: boolean
  secretConfigured: boolean
}
