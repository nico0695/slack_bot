import { Request, Response, NextFunction } from 'express'
import { container } from 'tsyringe'
import UnauthorizedError from '../utils/errors/UnauthorizedError'

import { createClient } from '@supabase/supabase-js'
import UsersServices from '../../modules/users/services/users.services'
import { Profiles } from '../constants/auth.constants'
import { createModuleLogger } from '../../config/logger'
import { IUsers } from '../../modules/users/interfaces/users.interfaces'

const log = createModuleLogger('middleware.auth')

const userServices = container.resolve(UsersServices)

const supabase = (() => {
  try {
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_TOKEN)
  } catch (error) {
    log.error({ err: error }, 'Supabase client initialization failed')
  }
})()

/** Resolve one authenticated identity without storing it on a shared controller. */
export async function getAuthenticatedUser(token: unknown): Promise<IUsers & { id: number }> {
  if (typeof token !== 'string' || !token.trim()) {
    throw new UnauthorizedError({ message: 'Unauthorized' })
  }

  const response = await supabase.auth.getUser(token.replace(/^Bearer\s+/i, '').trim())
  const identity = response.data?.user
  if (response.error || !identity) {
    throw new UnauthorizedError({ message: 'Unauthorized' })
  }

  const { data: user } = await userServices.getOrCreateUserSupabase({
    email: identity.email,
    supabaseId: identity.id,
  })
  if (
    !user?.enabled ||
    typeof user.id !== 'number' ||
    !Number.isSafeInteger(user.id) ||
    user.id < 1
  ) {
    throw new UnauthorizedError({ message: 'Unauthorized' })
  }
  return { ...user, id: user.id }
}

export const verifyToken = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const token = req.headers.authorization

    if (!token) return res.status(401).json({ message: 'Token invalido' })

    const supabaseResponse = await supabase.auth.getUser(token.replace('Bearer ', ''))

    const supabaseUser = supabaseResponse.data?.user

    if (supabaseResponse.error || !supabaseUser) {
      return res.status(401).json({ message: 'Token invalido' })
    }

    await userServices.getOrCreateUserSupabase({
      email: supabaseUser.email,
      supabaseId: supabaseUser.id,
    })

    next()
  } catch (error) {
    log.error({ err: error }, 'verifyToken failed')
    return res.status(401).json({ message: 'No estas autorizado' })
  }
}

export function HttpAuth(target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
  const originalMethod = descriptor.value

  descriptor.value = async function (...args: any[]) {
    const [req] = args

    this.userData = await getAuthenticatedUser(req.headers.authorization)

    return originalMethod.apply(this, args)
  }
}

export function SlackAuth(target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
  const originalMethod = descriptor.value

  descriptor.value = async function (...args: any[]) {
    const [{ payload, say }] = args

    try {
      const meChannelId = payload.channel_type === 'im' ? payload.channel : undefined

      const { data: user } = await userServices.getOrCreateUserBySlackId(payload.user, meChannelId)

      if (!user.enabled) {
        return say('Ups! No tienes permisos para usar el bot 🤷‍♂️')
      }

      this.userData = user

      return originalMethod.apply(this, args)
    } catch (error) {
      log.error({ err: error, slackUserId: payload?.user }, 'SlackAuth failed')
      return say('Ups! No se pudo obtener tu información 🤷‍♂️')
    }
  }
}

export function SlackAuthActions(
  target: any,
  propertyKey: string,
  descriptor: PropertyDescriptor
): void {
  const originalMethod = descriptor.value

  descriptor.value = async function (...args: any[]) {
    const [{ body, payload, ack, say }]: any = args

    try {
      const meChannelId =
        body.channel?.id ?? (payload.channel_type === 'im' ? payload.channel : undefined)

      const { data: user } = await userServices.getOrCreateUserBySlackId(body.user?.id, meChannelId)

      if (!user.enabled) {
        await ack()
        return say('Ups! No tienes permisos para usar el bot 🤷‍♂️')
      }

      this.userData = user

      return originalMethod.apply(this, args)
    } catch (error) {
      log.error({ err: error, slackUserId: body?.user?.id }, 'SlackAuthActions failed')
      await ack()
      return say('Ups! No se pudo obtener tu información 🤷‍♂️')
    }
  }
}

export function Permission(profile: Profiles[] = []): any {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      const [, res] = args

      try {
        if (profile.length > 0 && !profile.includes(this.userData.profile)) {
          return res.status(403).json({ message: 'You dont have permissions' })
        }

        return originalMethod.apply(this, args)
      } catch (error) {
        log.error({ err: error }, 'Permission check failed')
        return res.status(403).json({ message: 'You dont have permissions' })
      }
    }
  }
}
