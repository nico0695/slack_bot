import UsersServices from '../users.services'

jest.mock('../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
}))

const existEmailMock = jest.fn()
const createUserMock = jest.fn()
const getUserByEmailMock = jest.fn()
const getUserByIdMock = jest.fn()
const getUserBySlackIdMock = jest.fn()
const getUsersBySlackTeamIdMock = jest.fn()
const updateUserByIdMock = jest.fn()
const getAllUsersMock = jest.fn()

const getTeamMembersMock = jest.fn()
const getUserInfoMock = jest.fn()

const addOrUpdateUserSubscriptionMock = jest.fn()

jest.mock('../../repositories/database/users.dataSource', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      existEmail: existEmailMock,
      createUser: createUserMock,
      getUserByEmail: getUserByEmailMock,
      getUserById: getUserByIdMock,
      getUserBySlackId: getUserBySlackIdMock,
      getUsersBySlackTeamId: getUsersBySlackTeamIdMock,
      updateUserById: updateUserByIdMock,
      getAllUsers: getAllUsersMock,
    }),
  },
}))

jest.mock('../../repositories/slack/slack.repository', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({
      getTeamMembers: getTeamMembersMock,
      getUserInfo: getUserInfoMock,
    }),
  },
}))

jest.mock('../../repositories/redis/users.redis', () => ({
  UsersRedis: {
    getInstance: () => ({
      addOrUpdateUserSubscription: addOrUpdateUserSubscriptionMock,
    }),
  },
}))

describe('UsersServices', () => {
  const services = UsersServices.getInstance()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('createUser', () => {
    it('returns error when email already exists', async () => {
      existEmailMock.mockResolvedValue(true)

      const result = await services.createUser({
        email: 'existing@example.com',
      } as any)

      expect(result.error).toBe('El email ingresado ya esta en uso')
    })

    it('creates user when email available', async () => {
      existEmailMock.mockResolvedValue(false)
      createUserMock.mockResolvedValue({ id: 1 })

      const result = await services.createUser({
        email: 'new@example.com',
      } as any)

      expect(createUserMock).toHaveBeenCalled()
      expect(result).toEqual({ data: { id: 1 } })
    })

    it('returns error when datasource throws', async () => {
      existEmailMock.mockRejectedValue(new Error('fail'))

      const result = await services.createUser({ email: 'fail@example.com' } as any)

      expect(result.error).toBe('Error al crear el usuario')
    })
  })

  describe('getUserByEmail', () => {
    it('returns user when found', async () => {
      getUserByEmailMock.mockResolvedValue({ id: 1 })

      const result = await services.getUserByEmail('user@example.com')

      expect(result).toEqual({ data: { id: 1 } })
    })

    it('returns error when not found', async () => {
      getUserByEmailMock.mockResolvedValue(undefined)

      const result = await services.getUserByEmail('user@example.com')

      expect(result.error).toBe('Usuario no encontrado')
    })

    it('returns error when datasource throws', async () => {
      getUserByEmailMock.mockRejectedValue(new Error('fail'))

      const result = await services.getUserByEmail('user@example.com')

      expect(result.error).toBe('Error al recuperar el usuario')
    })
  })

  describe('getUserById', () => {
    it('returns user when found', async () => {
      getUserByIdMock.mockResolvedValue({ id: 1 })

      const result = await services.getUserById(1)

      expect(result).toEqual({ data: { id: 1 } })
    })

    it('returns error when not found', async () => {
      getUserByIdMock.mockResolvedValue(undefined)

      const result = await services.getUserById(1)

      expect(result.error).toBe('Usuario no encontrado')
    })

    it('returns error when datasource throws', async () => {
      getUserByIdMock.mockRejectedValue(new Error('fail'))

      const result = await services.getUserById(1)

      expect(result.error).toBe('Error al recuperar el usuario')
    })
  })

  describe('getOrCreateUserSupabase', () => {
    it('updates user when supabase id differs', async () => {
      getUserByEmailMock.mockResolvedValue({ id: 1, supabaseId: null })
      updateUserByIdMock.mockResolvedValue({ id: 1, supabaseId: 'new-id' })

      const result = await services.getOrCreateUserSupabase({
        email: 'user@example.com',
        supabaseId: 'new-id',
      })

      expect(updateUserByIdMock).toHaveBeenCalledWith(1, { supabaseId: 'new-id' })
      expect(result).toEqual({ data: { id: 1, supabaseId: 'new-id' } })
    })

    it('creates new user when not found', async () => {
      getUserByEmailMock.mockResolvedValueOnce(undefined).mockResolvedValue(undefined)
      existEmailMock.mockResolvedValue(false)
      createUserMock.mockResolvedValue({ id: 5 })

      const result = await services.getOrCreateUserSupabase({
        email: 'new@example.com',
        supabaseId: 'supabase-id',
      })

      expect(createUserMock).toHaveBeenCalled()
      expect(result).toEqual({ data: { id: 5 } })
    })

    it('returns error when datasource throws', async () => {
      getUserByEmailMock.mockRejectedValue(new Error('fail'))

      const result = await services.getOrCreateUserSupabase({
        email: 'user@example.com',
        supabaseId: 'supabase-id',
      })

      expect(result.error).toBe('Error al crear el usuario')
    })
  })

  describe('updateUserById', () => {
    it('returns error when user not found', async () => {
      getUserByIdMock.mockResolvedValue(undefined)

      const result = await services.updateUserById(1, { name: 'Nick' })

      expect(result.error).toBe('Usuario no encontrado')
      expect(updateUserByIdMock).not.toHaveBeenCalled()
    })

    it('updates user when found', async () => {
      getUserByIdMock.mockResolvedValue({ id: 1 })
      updateUserByIdMock.mockResolvedValue({ id: 1, name: 'Nick' })

      const result = await services.updateUserById(1, { name: 'Nick' })

      expect(updateUserByIdMock).toHaveBeenCalledWith(1, { name: 'Nick' })
      expect(result).toEqual({ data: { id: 1, name: 'Nick' } })
    })

    it('returns error when datasource throws', async () => {
      getUserByIdMock.mockRejectedValue(new Error('fail'))

      const result = await services.updateUserById(1, { name: 'Nick' })

      expect(result.error).toBe('Error al actualizar el usuario')
    })
  })

  describe('getUsersByTeamId', () => {
    it('returns users from database when present', async () => {
      getUsersBySlackTeamIdMock.mockResolvedValue([{ id: 1 }])

      const result = await services.getUsersByTeamId('team-1')

      expect(result).toEqual({ data: [{ id: 1 }] })
      expect(getTeamMembersMock).not.toHaveBeenCalled()
    })

    it('fetches from Slack when database empty', async () => {
      getUsersBySlackTeamIdMock.mockResolvedValue([])
      getUserBySlackIdMock.mockResolvedValue(undefined)
      getTeamMembersMock.mockResolvedValue([
        {
          id: 'slack-1',
          name: 'Nick',
          team_id: 'team-1',
          profile: {
            first_name: 'Nick',
            last_name: 'Doe',
            email: 'nick@example.com',
          },
        },
      ])
      const createUserSpy = jest
        .spyOn(services, 'createUser')
        .mockResolvedValue({ data: { id: 10 } } as any)

      const result = await services.getUsersByTeamId('team-1')

      expect(getTeamMembersMock).toHaveBeenCalledWith('team-1')
      expect(createUserSpy).toHaveBeenCalled()
      expect(result).toEqual({ data: [{ id: 10 }] })

      createUserSpy.mockRestore()
    })

    it('returns error when slack repository fails', async () => {
      getUsersBySlackTeamIdMock.mockResolvedValue([])
      getTeamMembersMock.mockRejectedValue(new Error('fail'))

      const result = await services.getUsersByTeamId('team-1')

      expect(result.error).toBe('Error al recuperar los usuarios del equipo')
    })
  })

  describe('subscribeNotifications', () => {
    it('returns error when user not found', async () => {
      getUserByIdMock.mockResolvedValue(undefined)

      const result = await services.subscribeNotifications(1, {})

      expect(result.error).toBe('Usuario no encontrado')
    })

    it('subscribes user when redis succeeds', async () => {
      getUserByIdMock.mockResolvedValue({ id: 1 })
      addOrUpdateUserSubscriptionMock.mockResolvedValue(true)

      const result = await services.subscribeNotifications(1, {})

      expect(addOrUpdateUserSubscriptionMock).toHaveBeenCalledWith(1, {})
      expect(result).toEqual({ data: true })
    })

    it('returns error when redis fails', async () => {
      getUserByIdMock.mockResolvedValue({ id: 1 })
      addOrUpdateUserSubscriptionMock.mockResolvedValue(false)

      const result = await services.subscribeNotifications(1, {})

      expect(result.error).toBe('Error al suscribir al usuario')
    })
  })

  describe('getUsers', () => {
    it('returns paginated users', async () => {
      getAllUsersMock.mockResolvedValue({ data: [], count: 0 })

      const result = await services.getUsers(1, 10)

      expect(getAllUsersMock).toHaveBeenCalledWith({ page: 1, pageSize: 10 })
      expect(result).toEqual({ data: { data: [], count: 0 } })
    })

    it('returns error when datasource throws', async () => {
      getAllUsersMock.mockRejectedValue(new Error('fail'))

      const result = await services.getUsers(1, 10)

      expect(result.error).toBe('Error al recuperar los usuarios')
    })
  })

  describe('getOrCreateUserBySlackId', () => {
    it('updates channel id when different', async () => {
      getUserBySlackIdMock.mockResolvedValue({ id: 1, slackChannelId: 'old' })
      updateUserByIdMock.mockResolvedValue({ id: 1, slackChannelId: 'new' })

      const result = await services.getOrCreateUserBySlackId('slack-1', 'new')

      expect(updateUserByIdMock).toHaveBeenCalledWith(1, { slackChannelId: 'new' })
      expect(result).toEqual({ data: { id: 1, slackChannelId: 'new' } })
    })

    it('returns existing user when channel matches', async () => {
      getUserBySlackIdMock.mockResolvedValue({ id: 1, slackChannelId: 'same' })

      const result = await services.getOrCreateUserBySlackId('slack-1', 'same')

      expect(result).toEqual({ data: { id: 1, slackChannelId: 'same' } })
    })

    it('returns error when slack user not found', async () => {
      getUserBySlackIdMock.mockResolvedValue(undefined)
      getUserInfoMock.mockResolvedValue(null)

      const result = await services.getOrCreateUserBySlackId('slack-1')

      expect(result.error).toBe('Error al crear el usuario')
    })

    it('updates existing user when matched by email', async () => {
      getUserBySlackIdMock.mockResolvedValue(undefined)
      getUserInfoMock.mockResolvedValue({
        id: 'slack-1',
        name: 'Nick',
        team_id: 'team-1',
        profile: {
          first_name: 'Nick',
          last_name: 'Doe',
          email: 'nick@example.com',
          image_original: 'url',
        },
      })
      getUserByEmailMock.mockResolvedValue({ id: 2 })
      updateUserByIdMock.mockResolvedValue({ id: 2, slackId: 'slack-1' })

      const result = await services.getOrCreateUserBySlackId('slack-1')

      expect(updateUserByIdMock).toHaveBeenCalledWith(2, {
        slackId: 'slack-1',
        slackTeamId: 'team-1',
        image: 'url',
      })
      expect(result).toEqual({ data: { id: 2, slackId: 'slack-1' } })
    })

    it('creates user when not found in database', async () => {
      getUserBySlackIdMock.mockResolvedValue(undefined)
      getUserInfoMock.mockResolvedValue({
        id: 'slack-1',
        name: 'Nick',
        team_id: 'team-1',
        profile: {
          first_name: 'Nick',
          last_name: 'Doe',
          email: 'nick@example.com',
          image_original: 'url',
        },
      })
      getUserByEmailMock.mockResolvedValue(undefined)
      const createUserSpy = jest
        .spyOn(services, 'createUser')
        .mockResolvedValue({ data: { id: 3 } } as any)

      const result = await services.getOrCreateUserBySlackId('slack-1', 'channel-1')

      expect(createUserSpy).toHaveBeenCalled()
      expect(result).toEqual({ data: { id: 3 } })

      createUserSpy.mockRestore()
    })

    it('returns error when datasource throws during lookup', async () => {
      getUserBySlackIdMock.mockRejectedValue(new Error('fail'))

      const result = await services.getOrCreateUserBySlackId('slack-1')

      expect(result.error).toBe('Error al recuperar el usuario')
    })
  })
})
