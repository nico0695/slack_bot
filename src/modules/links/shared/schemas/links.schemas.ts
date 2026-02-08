import { z } from 'zod'

import { LinkStatus } from '../constants/links.constants'

export const createLinkSchema = z.object({
  url: z.string().url(),
  title: z.string().optional().default(''),
  description: z.string().optional().default(''),
  tag: z.string().optional(),
})

export const updateLinkSchema = z.object({
  url: z.string().url().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  tag: z.string().optional(),
  status: z.nativeEnum(LinkStatus).optional(),
})

export const getLinkQuerySchema = z.object({
  tag: z.string().optional(),
  status: z.nativeEnum(LinkStatus).optional(),
})
