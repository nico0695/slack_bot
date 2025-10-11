import { Request, Response, NextFunction } from 'express'
import UnauthorizedError from '../utils/errors/UnauthorizedError'

import { createClient } from '@supabase/supabase-js'
import UsersServices from '../../modules/users/services/users.services'
import { Profiles } from '../constants/auth.constants'

// Create a single supabase client for interacting with your database
const supabase = (() => {
  try {
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_TOKEN)
  } catch (error) {
    console.log(
      `Supabase error: ${String(error)} - ${process.env.SUPABASE_URL} - ${
        process.env.SUPABASE_TOKEN
      }`
    )
  }
})()

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

    const userServices = UsersServices.getInstance()

    await userServices.getOrCreateUserSupabase({
      email: supabaseUser.email,
      supabaseId: supabaseUser.id,
    })

    next()
  } catch (error) {
    return res.status(401).json({ message: 'No estas autorizado' })
  }
}

// Auth decorator
export function HttpAuth(target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
  const originalMethod = descriptor.value

  descriptor.value = async function (...args: any[]) {
    const [req] = args

    const token = req.headers.authorization

    if (!token) {
      throw new UnauthorizedError({ message: 'Unauthorized' })
    }

    const supabaseResponse = await supabase.auth.getUser(token.replace('Bearer ', ''))

    const supabaseUser = supabaseResponse.data?.user

    if (supabaseResponse.error || !supabaseUser) {
      throw new UnauthorizedError({ message: 'Unauthorized' })
    }

    const userServices = UsersServices.getInstance()

    const { data: user } = await userServices.getOrCreateUserSupabase({
      email: supabaseUser.email,
      supabaseId: supabaseUser.id,
    })

    if (!user.enabled) {
      throw new UnauthorizedError({ message: 'Unauthorized' })
    }

    this.userData = user

    return originalMethod.apply(this, args)
  }
}

export function SlackAuth(target: any, propertyKey: string, descriptor: PropertyDescriptor): void {
  const originalMethod = descriptor.value

  descriptor.value = async function (...args: any[]) {
    const [{ payload, say }] = args

    try {
      const userServices = UsersServices.getInstance()

      const meChannelId = payload.channel_type === 'im' ? payload.channel : undefined

      const { data: user } = await userServices.getOrCreateUserBySlackId(payload.user, meChannelId)

      if (!user.enabled) {
        return say('Ups! No tienes permisos para usar el bot 🤷‍♂️')
      }

      this.userData = user

      return originalMethod.apply(this, args)
    } catch (error) {
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
      const userServices = UsersServices.getInstance()

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
        return res.status(403).json({ message: 'You dont have permissions' })
      }
    }
  }
}
