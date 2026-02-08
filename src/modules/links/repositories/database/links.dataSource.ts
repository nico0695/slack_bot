import { FindOptionsWhere, IsNull } from 'typeorm'

import { Links } from '../../../../entities/links'
import { Users } from '../../../../entities/users'

import { ILink } from '../../shared/interfaces/links.interfaces'

export default class LinksDataSource {
  static #instance: LinksDataSource

  private constructor() {}

  static getInstance(): LinksDataSource {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new LinksDataSource()
    return this.#instance
  }

  /**
   * Save link in database
   * @param data ILink
   * @returns
   */
  async createLink(data: ILink): Promise<Links> {
    try {
      const user = new Users()
      user.id = data.userId

      const newLink = new Links()

      newLink.url = data.url
      newLink.title = data.title ?? ''
      newLink.description = data.description ?? ''
      newLink.tag = data.tag?.trim() ?? ''
      newLink.status = data.status ?? 'unread'
      newLink.user = user
      if (data.channelId) {
        newLink.channelId = data.channelId
      }

      await newLink.save()

      return newLink
    } catch (error) {
      return error
    }
  }

  /**
   * Get links by user id
   * @param userId number - User id
   * @returns
   */
  async getLinksByUserId(
    userId: number,
    options?: {
      tag?: string
      status?: string
      channelId?: string | null
    }
  ): Promise<Links[]> {
    try {
      const where: FindOptionsWhere<Links> = {}
      const rawChannelId = options?.channelId

      if (typeof rawChannelId === 'string' && rawChannelId.trim().length > 0) {
        where.channelId = rawChannelId.trim()
      } else {
        where.user = { id: userId }
        if (rawChannelId === null) {
          where.channelId = IsNull()
        }
      }

      if (options?.tag) {
        where.tag = options.tag
      }

      if (options?.status) {
        where.status = options.status
      }

      const links = await Links.find({
        where,
        order: { createdAt: 'DESC' },
      })

      return links
    } catch (error) {
      return error
    }
  }

  async updateLink(linkId: number, dataUpdate: Partial<ILink>): Promise<void> {
    try {
      const data = { ...dataUpdate }
      delete data.userId
      delete data.id

      await Links.update(linkId, data)
    } catch (error) {
      throw new Error('Error al actualizar el link')
    }
  }

  async deleteLink(linkId: number, userId: number): Promise<number> {
    try {
      const result = await Links.getRepository().softDelete({
        id: linkId,
        user: { id: userId },
      })
      return result.affected ?? 0
    } catch (error) {
      throw new Error(error)
    }
  }
}
