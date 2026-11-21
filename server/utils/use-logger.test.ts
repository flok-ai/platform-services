import type { LoggerOptions } from 'pino'
import { beforeEach, expect, test, vi } from 'vitest'

const { config, write } = vi.hoisted(() => ({
  config: { logLevel: 'info' },
  write: vi.fn<(line: string) => void>(),
}))

vi.mock('nitropack/runtime', () => ({ useRuntimeConfig: () => config }))
vi.mock('pino', async (importOriginal) => {
  const { default: pino } = await importOriginal<typeof import('pino')>()
  return { default: Object.assign((options: LoggerOptions) => pino(options, { write }), pino) }
})

beforeEach(() => {
  vi.resetModules()
  write.mockClear()
  config.logLevel = 'info'
})

test('tags log entries and reuses the logger for each domain', async () => {
  config.logLevel = 'debug'
  const { useLogger } = await import('./use-logger.ts')
  const http = useLogger('http')

  expect(useLogger('http')).toBe(http)
  expect(useLogger('db')).not.toBe(http)
  http.debug('Request received')
  expect(JSON.parse(write.mock.calls[0]![0])).toMatchObject({
    domain: 'http',
    level: 20,
    msg: 'Request received',
  })
})

test('warns and falls back to info when the configured level is invalid', async () => {
  config.logLevel = 'invalid'
  const { useLogger } = await import('./use-logger.ts')

  expect(useLogger('db').level).toBe('info')
  expect(JSON.parse(write.mock.calls[0]![0])).toMatchObject({
    domain: 'logger',
    configuredLevel: 'invalid',
    level: 40,
  })
  expect(write).toHaveBeenCalledTimes(1)
})
