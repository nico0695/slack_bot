import { z } from 'zod'

import { TaskStatus } from '../constants/tasks.constants'

export const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(''),
  status: z.nativeEnum(TaskStatus).optional(),
  alertDate: z.coerce.date().nullable().optional(),
  tag: z.string().optional(),
})

export const updateTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().default(''),
  status: z.nativeEnum(TaskStatus).optional(),
  alertDate: z.coerce.date().nullable().optional(),
  tag: z.string().optional(),
})
