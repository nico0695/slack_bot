import { Links } from '../../../entities/links'
import { GenericResponse } from '../../../shared/interfaces/services'

import LinksDataSource from '../repositories/database/links.dataSource'

import { ILink } from '../shared/interfaces/links.interfaces'
import { createModuleLogger } from '../../../config/logger'

const log = createModuleLogger('links.service')

export default class LinksServices {
  static #instance: LinksServices

  #linksDataSource: LinksDataSource

  private constructor() {
    this.#linksDataSource = LinksDataSource.getInstance()
  }

  static getInstance(): LinksServices {
    if (this.#instance) {
      return this.#instance
    }

    this.#instance = new LinksServices()
    return this.#instance
  }

  /**
   * Create link with user assistant data
   * @param userId
   * @param url
   * @param options
   * @returns
   */
  public async createAssistantLink(
    userId: number,
    url: string,
    options?: {
      title?: string
      description?: string
      tag?: string
      channelId?: string
    }
  ): Promise<GenericResponse<Links>> {
    try {
      const sanitizedTag = options?.tag?.trim()
      const payload: ILink = {
        userId,
        url,
        title: options?.title ?? '',
        description: options?.description ?? '',
      }

      if (sanitizedTag && sanitizedTag.length > 0) {
        payload.tag = sanitizedTag
      }

      if (options?.channelId) {
        payload.channelId = options.channelId
      }

      const response = await this.#linksDataSource.createLink(payload)

      log.info({ userId, linkId: response.id }, 'Link created')

      return {
        data: response,
      }
    } catch (error) {
      log.error({ err: error, userId }, 'createAssistantLink failed')
      return {
        error: 'Error al crear el link',
      }
    }
  }

  /**
   * Save link in database
   * @param data ILink
   * @returns
   */
  public async createLink(data: ILink): Promise<GenericResponse<Links>> {
    try {
      const response = await this.#linksDataSource.createLink(data)

      log.info({ userId: data.userId, linkId: response.id }, 'Link created')

      return {
        data: response,
      }
    } catch (error) {
      log.error({ err: error, userId: data.userId }, 'createLink failed')
      return {
        error: 'Error al crear el link',
      }
    }
  }

  /**
   * Get links by user id
   * @param userId number - User id
   * @returns
   */
  public async getLinksByUserId(
    userId: number,
    options?: {
      tag?: string
      status?: string
      channelId?: string | null
    }
  ): Promise<GenericResponse<Links[]>> {
    try {
      const response = await this.#linksDataSource.getLinksByUserId(userId, options)

      return {
        data: response,
      }
    } catch (error) {
      log.error({ err: error, userId }, 'getLinksByUserId failed')
      return {
        error: 'Error al obtener los links',
      }
    }
  }

  public async updateLink(
    linkId: number,
    dataUpdate: Partial<ILink>,
    userId?: number
  ): Promise<GenericResponse<boolean>> {
    try {
      await this.#linksDataSource.updateLink(linkId, dataUpdate, userId)

      return {
        data: true,
      }
    } catch (error) {
      log.error({ err: error, linkId }, 'updateLink failed')
      return {
        error: 'Error al actualizar el link',
      }
    }
  }

  public async deleteLink(linkId: number, userId: number): Promise<GenericResponse<boolean>> {
    try {
      const res = await this.#linksDataSource.deleteLink(linkId, userId)

      log.info({ linkId, userId }, 'Link deleted')

      return {
        data: res > 0,
      }
    } catch (error) {
      log.error({ err: error, linkId, userId }, 'deleteLink failed')
      return {
        error: 'Error al eliminar el link',
      }
    }
  }
}
