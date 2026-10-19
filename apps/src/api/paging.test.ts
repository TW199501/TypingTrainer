import { beforeEach, describe, expect, it, vi } from 'vitest'

const get = vi.hoisted(() => vi.fn())
vi.mock('./http', () => ({ http: { get } }))

import { fetchAllPages } from './paging'

describe('fetchAllPages', () => {
  beforeEach(() => {
    get.mockReset()
  })

  it('fetches every page until x-total-count is reached', async () => {
    get.mockImplementation((_path: string, cfg: { params: { page: number } }) => {
      const { params } = cfg
      const n = params.page < 3 ? 500 : 200
      return Promise.resolve({
        data: Array.from({ length: n }, (_, i) => ({ id: params.page * 1000 + i })),
        headers: { 'x-total-count': '1200' },
      })
    })

    const all = await fetchAllPages<{ id: number }>('/texts', { category: 'basic' })

    expect(all).toHaveLength(1200)
    expect(get).toHaveBeenCalledTimes(3)
    expect(get.mock.calls.map((c) => c[1].params)).toEqual([
      { category: 'basic', page: 1, size: 500 },
      { category: 'basic', page: 2, size: 500 },
      { category: 'basic', page: 3, size: 500 },
    ])
  })

  it('stops after a short page when the header is missing', async () => {
    get.mockResolvedValue({ data: [{ id: 1 }], headers: {} })
    expect(await fetchAllPages('/texts')).toHaveLength(1)
    expect(get).toHaveBeenCalledTimes(1)
  })
})
