import SlackRepository from '../slack.repository'

const usersListMock = jest.fn()
const usersInfoMock = jest.fn()

jest.mock('../../../../../config/slackConfig', () => ({
  connectionSlackApp: {
    client: {
      users: {
        list: (...args: any[]) => usersListMock(...args),
        info: (...args: any[]) => usersInfoMock(...args),
      },
    },
  },
}))

jest.mock('../../../../../config/logger', () => ({
  createModuleLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  }),
}))

describe('SlackRepository', () => {
  let slackRepository: SlackRepository

  beforeEach(() => {
    jest.clearAllMocks()
    slackRepository = SlackRepository.getInstance()
  })

  it('fetches team members', async () => {
    usersListMock.mockResolvedValueOnce({ members: [{ id: '1' }] })

    const result = await slackRepository.getTeamMembers('team-1')

    expect(usersListMock).toHaveBeenCalledWith({ team_id: 'team-1' })
    expect(result).toEqual([{ id: '1' }])
  })

  it('returns null when list fails', async () => {
    usersListMock.mockRejectedValueOnce(new Error('fail'))

    const result = await slackRepository.getTeamMembers('team-1')

    expect(result).toBeNull()
  })

  it('fetches user info', async () => {
    usersInfoMock.mockResolvedValueOnce({ user: { id: '1' } })

    const result = await slackRepository.getUserInfo('user-1')

    expect(usersInfoMock).toHaveBeenCalledWith({ user: 'user-1' })
    expect(result).toEqual({ id: '1' })
  })

  it('returns null when info fails', async () => {
    usersInfoMock.mockRejectedValueOnce(new Error('fail'))

    const result = await slackRepository.getUserInfo('user-1')

    expect(result).toBeNull()
  })
})
