import { TaskStatus } from '../tasks.constants'

describe('TaskStatus', () => {
  it('exposes canonical status values', () => {
    expect(TaskStatus).toMatchObject({
      PENDING: 'pending',
      IN_PROGRESS: 'in_progress',
      COMPLETED: 'completed',
      CANCELED: 'canceled',
    })
  })
})
