export interface IPaginationOptions {
  page: number
  pageSize: number
}

export class IPaginationResponse<T> {
  data: T[]
  page: number
  pageSize: number
  count: number

  constructor(options: IPaginationOptions) {
    this.page = !isNaN(Number(options.page)) ? Number(options.page) : 0
    this.pageSize = !isNaN(Number(options.pageSize)) ? Number(options.pageSize) : 0
    this.data = []
    this.count = 0
  }

  setData(data: T[], count: number): void {
    this.data = data
    this.count = count
  }
}
