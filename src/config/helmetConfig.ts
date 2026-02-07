import helmet from 'helmet'

const isProduction = process.env.NODE_ENV === 'production'

export const helmetMiddleware = helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hsts: isProduction ? { maxAge: 15552000, includeSubDomains: true } : false,
  noSniff: true,
  originAgentCluster: false,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  referrerPolicy: { policy: 'no-referrer' },
})
