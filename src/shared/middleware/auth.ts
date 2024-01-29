import { Request, Response, NextFunction } from 'express'

import { createClient } from '@supabase/supabase-js'
import UsersServices from '../../modules/users/services/users.services'

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
