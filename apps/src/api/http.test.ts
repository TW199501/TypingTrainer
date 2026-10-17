import { afterEach, describe, expect, it } from 'vitest'
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { ApiError, http } from './http'

const original = http.defaults.adapter

/** Answers every request with a ProblemDetails body and the given status. */
const problem =
  (status: number, data: unknown): AxiosAdapter =>
  async (config: InternalAxiosRequestConfig) => {
    throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, {
      status,
      statusText: '',
      data,
      headers: {},
      config,
    })
  }

describe('http errors', () => {
  afterEach(() => {
    http.defaults.adapter = original
  })

  it('carries the rejected records and their total from a ProblemDetails body', async () => {
    http.defaults.adapter = problem(400, {
      title: 'Some rows have no word.',
      failed: ['3', '5'],
      failedCount: 12,
    })

    const error = await http.post('/words/import/file').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, failed: ['3', '5'], failedCount: 12 })
    expect((error as ApiError).message).toBe('Some rows have no word.')
  })

  it('leaves the total out when the server sends none', async () => {
    http.defaults.adapter = problem(400, { title: 'Bad', failed: ['a.txt'] })

    const error = (await http.post('/texts/import').catch((e: unknown) => e)) as ApiError

    expect(error.failed).toEqual(['a.txt'])
    expect(error.failedCount).toBeUndefined()
  })
})
