import { Request, Response, NextFunction } from 'express'

import { createClient } from '@supabase/supabase-js'
import UsersServices from '../../modules/users/services/users.services'
import { Profiles } from '../constants/auth.constants'

// Create a single supabase client for interacting with your database
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_TOKEN)

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
    const [req, res] = args

    try {
      const token = req.headers.authorization

      if (!token) {
        return res.status(401).json({ message: 'Invalid token' })
      }

      const supabaseResponse = await supabase.auth.getUser(token.replace('Bearer ', ''))

      const supabaseUser = supabaseResponse.data?.user

      if (supabaseResponse.error || !supabaseUser) {
        return res.status(401).json({ message: 'Invalid token' })
      }

      const userServices = UsersServices.getInstance()

      const user = await userServices.getOrCreateUserSupabase({
        email: supabaseUser.email,
        supabaseId: supabaseUser.id,
      })

      this.userData = user.data

      return originalMethod.apply(this, args)
    } catch (error) {
      return res.status(401).json({ message: 'Server Error' })
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
          return res.status(403).json({ message: 'Unauthorized' })
        }

        return originalMethod.apply(this, args)
      } catch (error) {
        return res.status(403).json({ message: 'Unauthorized' })
      }
    }
  }
}
