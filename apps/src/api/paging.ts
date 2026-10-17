import { http } from './http'

const PAGE_SIZE = 500

/** Reads every page of a list endpoint; `x-total-count` says where to stop. */
export async function fetchAllPages<T>(path: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const all: T[] = []
  for (let page = 1; ; page++) {
    const res = await http.get<T[]>(path, { params: { ...params, page, size: PAGE_SIZE } })
    all.push(...res.data)
    const total = Number(res.headers?.['x-total-count'])
    const done = Number.isFinite(total) ? all.length >= total : res.data.length < PAGE_SIZE
    if (done || res.data.length === 0) return all
  }
}
