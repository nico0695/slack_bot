const countMock = jest.fn()
const saveMock = jest.fn()
const updateMock = jest.fn()
const findOneMock = jest.fn()
const findMock = jest.fn()
const findAndCountMock = jest.fn()

jest.mock('../../../../../entities/users', () => {
  class UsersMock {
    username?: string
    name?: string
    lastName?: string
    email?: string
    phone?: string
    slackId?: string
    slackTeamId?: string
    supabaseId?: string
    profile?: number
    enabled?: boolean

    static count = (...args: any[]): any => countMock(...args)
    static update = (...args: any[]): any => updateMock(...args)
    static findOne = (...args: any[]): any => findOneMock(...args)
    static find = (...args: any[]): any => findMock(...args)
    static findAndCount = (...args: any[]): any => findAndCountMock(...args)

    async save(): Promise<any> {
      return saveMock(this)
    }
  }

  return { Users: UsersMock }
})

describe('UsersDataSources', () => {
  let UsersDataSources: any
  let dataSource: any

  const loadModule = async (): Promise<void> => {
    jest.resetModules()
    const module = await import('../users.dataSource')
    UsersDataSources = module.default
    dataSource = UsersDataSources.getInstance()
  }

  beforeEach(async () => {
    process.env.ADMIN_MAIL = 'admin@example.com'
    countMock.mockReset()
    saveMock.mockReset()
    updateMock.mockReset()
    findOneMock.mockReset()
    findMock.mockReset()
    findAndCountMock.mockReset()
    saveMock.mockImplementation(async (instance: any) => instance)
    await loadModule()
  })

  describe('existEmail', () => {
    it('returns true when email exists', async () => {
      countMock.mockResolvedValue(1)

      const result = await dataSource.existEmail('user@example.com')

      expect(result).toBe(true)
    })

    it('returns false when no user found', async () => {
      countMock.mockResolvedValue(0)

      const result = await dataSource.existEmail('absent@example.com')

      expect(result).toBe(false)
    })

    it('returns error when count fails', async () => {
      const error = new Error('db error')
      countMock.mockRejectedValue(error)

      const result = await dataSource.existEmail('fail@example.com')

      expect(result).toBe(error)
    })
  })

  describe('createUser', () => {
    it('saves user and marks admin mail enabled', async () => {
      const result = await dataSource.createUser({
        username: 'admin',
        name: 'Admin',
        lastName: 'User',
        email: 'admin@example.com',
        phone: '123',
      } as any)

      expect(saveMock).toHaveBeenCalled()
      expect(result.enabled).toBe(true)
      expect(result.profile).toBe(1)
    })

    it('returns error when save fails', async () => {
      const error = new Error('fail')
      saveMock.mockRejectedValue(error)

      const result = await dataSource.createUser({
        username: 'nick',
        name: 'Nick',
        lastName: 'Doe',
        email: 'nick@example.com',
        phone: '555',
      } as any)

      expect(result).toBe(error)
    })
  })

  describe('updateUserById', () => {
    it('updates user and returns refreshed entity', async () => {
      const user = { id: 2, name: 'Nick' }
      updateMock.mockResolvedValue(undefined)
      findOneMock.mockResolvedValue(user)

      const result = await dataSource.updateUserById(2, { id: 2, name: 'Nick' })

      expect(updateMock).toHaveBeenCalledWith(2, { id: 2, name: 'Nick' })
      expect(findOneMock).toHaveBeenCalled()
      expect(result).toBe(user)
    })

    it('returns error when update fails', async () => {
      const error = new Error('fail')
      updateMock.mockRejectedValue(error)

      const result = await dataSource.updateUserById(2, { name: 'Nick' })

      expect(result).toBe(error)
    })
  })

  describe('getUserBySlackId', () => {
    it('returns user when found', async () => {
      const user = { id: 1 }
      findOneMock.mockResolvedValueOnce(user)

      const result = await dataSource.getUserBySlackId('slack-1')

      expect(result).toBe(user)
    })

    it('returns undefined when not found', async () => {
      findOneMock.mockResolvedValueOnce(undefined)

      const result = await dataSource.getUserBySlackId('slack-1')

      expect(result).toBeUndefined()
    })

    it('returns error when query fails', async () => {
      const error = new Error('fail')
      findOneMock.mockRejectedValueOnce(error)

      const result = await dataSource.getUserBySlackId('slack-1')

      expect(result).toBe(error)
    })
  })

  it('getUsersBySlackTeamId returns list when present', async () => {
    const users = [{ id: 1 }]
    findMock.mockResolvedValueOnce(users)

    const result = await dataSource.getUsersBySlackTeamId('team-1')

    expect(result).toBe(users)
  })

  it('getUsersBySlackTeamId returns error when query fails', async () => {
    const error = new Error('fail')
    findMock.mockRejectedValueOnce(error)

    const result = await dataSource.getUsersBySlackTeamId('team-1')

    expect(result).toBe(error)
  })

  describe('getUserByEmail', () => {
    it('returns user when found', async () => {
      const user = { id: 3 }
      findOneMock.mockResolvedValueOnce(user)

      const result = await dataSource.getUserByEmail('user@example.com')

      expect(result).toBe(user)
    })

    it('returns undefined when not found', async () => {
      findOneMock.mockResolvedValueOnce(undefined)

      const result = await dataSource.getUserByEmail('user@example.com')

      expect(result).toBeUndefined()
    })

    it('returns error when query fails', async () => {
      const error = new Error('fail')
      findOneMock.mockRejectedValueOnce(error)

      const result = await dataSource.getUserByEmail('user@example.com')

      expect(result).toBe(error)
    })
  })

  describe('getUserById', () => {
    it('returns user when found', async () => {
      const user = { id: 5 }
      findOneMock.mockResolvedValueOnce(user)

      const result = await dataSource.getUserById(5)

      expect(result).toBe(user)
    })

    it('returns undefined when not found', async () => {
      findOneMock.mockResolvedValueOnce(undefined)

      const result = await dataSource.getUserById(5)

      expect(result).toBeUndefined()
    })

    it('returns error when query fails', async () => {
      const error = new Error('fail')
      findOneMock.mockRejectedValueOnce(error)

      const result = await dataSource.getUserById(5)

      expect(result).toBe(error)
    })
  })

  describe('getAllUsers', () => {
    it('returns pagination response with data', async () => {
      findAndCountMock.mockResolvedValueOnce([[{ id: 1 }], 1])

      const result = await dataSource.getAllUsers({ page: 1, pageSize: 10 })

      expect(findAndCountMock).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
      })
      expect(result.data).toEqual([{ id: 1 }])
      expect(result.count).toBe(1)
    })

    it('returns error when query fails', async () => {
      const error = new Error('fail')
      findAndCountMock.mockRejectedValueOnce(error)

      const result = await dataSource.getAllUsers({ page: 1, pageSize: 10 })

      expect(result).toBe(error)
    })
  })
})
