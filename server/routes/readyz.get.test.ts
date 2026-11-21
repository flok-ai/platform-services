import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent } from 'h3'
import { beforeEach, expect, test, vi } from 'vitest'
import readyz from './readyz.get.ts'

const {
  execute, requireMigrations, logError,
} = vi.hoisted(() => ({
  execute: vi.fn<() => Promise<void>>(),
  requireMigrations: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('nitropack/runtime', () => ({
  useRuntimeConfig: () => ({
    artifactStorageAccountUrl: 'https://example.blob.core.windows.net',
    artifactStorageContainer: 'artifacts',
  }),
}))
vi.mock('../db/use-db.ts', () => ({ useDB: () => ({ execute }) }))
vi.mock('../db/migrate.ts', () => ({ requireMigrations }))
vi.mock('../utils/use-logger.ts', () => ({ useLogger: () => ({ error: logError }) }))

function createReadinessEvent() {
  const request = new IncomingMessage(new Socket())
  request.method = 'GET'
  request.url = '/readyz'
  return createEvent(request, new ServerResponse(request))
}

beforeEach(() => {
  vi.clearAllMocks()
  execute.mockResolvedValue(undefined)
})

test('reports readiness when the database, storage configuration and migrations are ready', async () => {
  const event = createReadinessEvent()
  const body = await readyz(event)

  expect(event.node.res.statusCode).toBe(200)
  expect(event.node.res.getHeader('Content-Type')).toBe('application/health+json')
  expect(event.node.res.getHeader('Cache-Control')).toBe('no-store')
  expect(body).toMatchObject({
    status: 'pass',
    checks: {
      'postgres:connection': [{ status: 'pass' }],
      'azure-storage:configuration': [{ status: 'pass' }],
      'postgres:migrations': [{ status: 'pass' }],
    },
  })
  expect(execute).toHaveBeenCalledOnce()
  expect(requireMigrations).toHaveBeenCalledOnce()
  expect(logError).not.toHaveBeenCalled()
})

test('reports database failure and keeps driver details in the server log', async () => {
  const event = createReadinessEvent()
  const error = new Error('private driver details', { cause: { code: 'ECONNREFUSED' } })
  execute.mockRejectedValueOnce(error)

  const body = await readyz(event)

  expect(event.node.res.statusCode).toBe(503)
  expect(body).toMatchObject({
    status: 'fail',
    checks: {
      'postgres:connection': [{ status: 'fail' }],
      'azure-storage:configuration': [{ status: 'pass' }],
    },
  })
  expect(JSON.stringify(body)).not.toContain('private driver details')
  expect(JSON.stringify(body)).not.toContain('ECONNREFUSED')
  expect(logError).toHaveBeenCalledExactlyOnceWith({
    check: 'postgres:connection',
    code: 'ECONNREFUSED',
    err: error,
  }, 'Readiness check failed')
})

test('reports unready while startup migrations are pending', async () => {
  const event = createReadinessEvent()
  requireMigrations.mockImplementationOnce(() => {
    throw new Error('Migrations pending')
  })

  const body = await readyz(event)

  expect(event.node.res.statusCode).toBe(503)
  expect(body).toMatchObject({
    status: 'fail',
    checks: {
      'postgres:connection': [{ status: 'pass' }],
      'postgres:migrations': [{ status: 'fail' }],
    },
  })
})
