import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createError, createEvent } from 'h3'
import type { H3Event } from 'h3'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { contexts, planP1, planP2, uploadedRecord } from '#test-support/artifact-fixtures.ts'
import type { StepContext } from '#shared/types/artifact.ts'
import registerArtifact from '#server/api/artifacts/index.post.ts'
import reportUpload from '#server/api/artifacts/[id].put.ts'
import getDownloadSas from '#server/api/artifacts/[id]/sas.get.ts'
import { signDownload, signUpload } from './azure-sas.utils.ts'
import { findArtifactById, recordUploadReport, upsertArtifact } from './repository.utils.ts'
import type { ArtifactRecord } from './repository.utils.ts'
import { logSecurityEvent } from '../log-security-event.utils.ts'
import { requireStepContext } from '../guards/require-step-context.ts'

const { db, storage } = vi.hoisted(() => ({
  db: {},
  storage: {},
}))

vi.mock('nitropack/runtime', () => ({
  useRuntimeConfig: () => ({
    databaseUrl: 'postgres://localhost/test',
    artifactStorageAccountUrl: 'https://example.blob.core.windows.net',
    artifactStorageContainer: 'artifacts',
  }),
}))
vi.mock('#server/db/use-db.ts', () => ({ useDB: () => db }))
vi.mock('../guards/require-step-context.ts', () => ({ requireStepContext: vi.fn() }))
vi.mock('../log-security-event.utils.ts', () => ({ logSecurityEvent: vi.fn() }))
vi.mock('./repository.utils.ts', () => ({
  findArtifactById: vi.fn(),
  recordUploadReport: vi.fn(),
  upsertArtifact: vi.fn(),
}))
vi.mock('./azure-sas.utils.ts', () => ({
  signDownload: vi.fn(),
  signUpload: vi.fn(),
}))
vi.mock('./use-artifact-storage.ts', () => ({ useArtifactStorage: () => storage }))

const id = '40000000-0000-4000-8000-000000000001'
const uploaded = uploadedRecord(id, planP1)
const reserved: ArtifactRecord = {
  ...uploaded,
  state: 'reserved',
  sizeBytes: null,
  sha256: null,
}
const registration = {
  name: 'plan',
  contentType: 'text/markdown',
}
const report = {
  state: 'failed',
  details: 'Upload timed out',
} as const
const upload = {
  url: 'https://example.blob.core.windows.net/artifacts/plan?sig=first',
  method: 'PUT',
  expiresAt: '2026-11-21T13:00:00Z',
  headers: {
    'x-ms-blob-type': 'BlockBlob',
    'Content-Type': 'text/markdown',
  },
} as const
const download = {
  url: 'https://example.blob.core.windows.net/artifacts/plan?sig=download',
  method: 'GET',
  expiresAt: '2026-11-21T13:00:00Z',
} as const

function artifactEvent(method: 'GET' | 'POST' | 'PUT', path: string, body?: object) {
  const request = new IncomingMessage(new Socket())
  request.method = method
  request.url = '/api/artifacts' + path
  if (body !== undefined) {
    const json = Buffer.from(JSON.stringify(body))
    request.headers['content-type'] = 'application/json'
    request.headers['content-length'] = String(json.length)
    request.push(json)
    request.push(null)
  }
  const event = createEvent(request, new ServerResponse(request))
  if (method !== 'POST') {
    event.context.params = { id }
  }
  return event
}

function authenticateAs(step: StepContext) {
  vi.mocked(requireStepContext).mockImplementation(async (event: H3Event) => {
    event.context.step = step
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  authenticateAs(contexts['planner-p1'])
})

describe('POST /api/artifacts', () => {
  test('returns 201 for registration and 200 with the same ID and a new SAS on retry', async () => {
    const retryUpload = {
      ...upload,
      url: 'https://example.blob.core.windows.net/artifacts/plan?sig=retry',
    }
    vi.mocked(upsertArtifact)
      .mockResolvedValueOnce({
        record: reserved,
        created: true,
      })
      .mockResolvedValueOnce({
        record: reserved,
        created: false,
      })
    vi.mocked(signUpload).mockResolvedValueOnce(upload).mockResolvedValueOnce(retryUpload)
    const first = artifactEvent('POST', '', registration)
    const retry = artifactEvent('POST', '', registration)

    await expect(registerArtifact(first)).resolves.toStrictEqual({
      id,
      state: 'reserved',
      upload,
    })
    await expect(registerArtifact(retry)).resolves.toStrictEqual({
      id,
      state: 'reserved',
      upload: retryUpload,
    })
    expect(first.node.res.statusCode).toBe(201)
    expect(retry.node.res.statusCode).toBe(200)
    const metadata = { contentType: registration.contentType }
    expect(upsertArtifact).toHaveBeenNthCalledWith(1, db, planP1, metadata)
    expect(upsertArtifact).toHaveBeenNthCalledWith(2, db, planP1, metadata)
    expect(signUpload).toHaveBeenNthCalledWith(1, storage, reserved)
    expect(signUpload).toHaveBeenNthCalledWith(2, storage, reserved)
    expect(retry.node.res.getHeader('Cache-Control')).toBe('no-store')
  })

  test('rejects registration outside the caller’s bindings before writing or signing', async () => {
    authenticateAs(contexts['coder-c1'])
    const event = artifactEvent('POST', '', registration)

    await expect(registerArtifact(event)).rejects.toMatchObject({ statusCode: 404 })
    expect(upsertArtifact).not.toHaveBeenCalled()
    expect(signUpload).not.toHaveBeenCalled()
  })

  test('authenticates before validating a request body', async () => {
    vi.mocked(requireStepContext).mockRejectedValueOnce(createError({ statusCode: 401 }))
    const event = artifactEvent('POST', '', {})

    await expect(registerArtifact(event)).rejects.toMatchObject({ statusCode: 401 })
    expect(upsertArtifact).not.toHaveBeenCalled()
    expect(signUpload).not.toHaveBeenCalled()
  })
})

describe('PUT /api/artifacts/:id', () => {
  test('returns only the acknowledgement to a write-only planner', async () => {
    vi.mocked(findArtifactById).mockResolvedValueOnce(reserved)
    vi.mocked(recordUploadReport).mockResolvedValueOnce({
      ...reserved,
      ...report,
    })
    const event = artifactEvent('PUT', '/' + id, report)

    await expect(reportUpload(event)).resolves.toStrictEqual({
      id,
      state: 'failed',
    })
    expect(recordUploadReport).toHaveBeenCalledExactlyOnceWith(db, id, report)
  })

  test.each([
    {
      record: reserved,
      action: 'create',
    },
    {
      record: uploaded,
      action: 'update',
    },
  ])('requires $action for a $record.state artifact before recording the report', async ({ record, action }) => {
    authenticateAs(contexts['coder-c1'])
    vi.mocked(findArtifactById).mockResolvedValueOnce(record)
    const event = artifactEvent('PUT', '/' + id, report)

    await expect(reportUpload(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(logSecurityEvent).toHaveBeenCalledWith(event, 'artifact_action_denied', expect.objectContaining({
      requiredActions: [action],
    }))
    expect(recordUploadReport).not.toHaveBeenCalled()
  })

  test('rejects an invalid upload report before writing', async () => {
    const event = artifactEvent('PUT', '/' + id, { state: 'uploaded' })

    await expect(reportUpload(event)).rejects.toMatchObject({ statusCode: 400 })
    expect(recordUploadReport).not.toHaveBeenCalled()
  })
})

describe('GET /api/artifacts/:id/sas', () => {
  beforeEach(() => {
    authenticateAs(contexts['coder-c1'])
  })

  test('returns a non-cacheable download SAS for an uploaded artifact', async () => {
    vi.mocked(findArtifactById).mockResolvedValueOnce(uploaded)
    vi.mocked(signDownload).mockResolvedValueOnce(download)
    const event = artifactEvent('GET', '/' + id + '/sas')

    await expect(getDownloadSas(event)).resolves.toStrictEqual(download)
    expect(event.node.res.getHeader('Cache-Control')).toBe('no-store')
    expect(signDownload).toHaveBeenCalledExactlyOnceWith(storage, uploaded)
  })

  test('returns 409 without signing while the artifact is reserved', async () => {
    vi.mocked(findArtifactById).mockResolvedValueOnce(reserved)
    const event = artifactEvent('GET', '/' + id + '/sas')

    await expect(getDownloadSas(event)).rejects.toMatchObject({ statusCode: 409 })
    expect(signDownload).not.toHaveBeenCalled()
  })

  test.each([
    {
      reason: 'missing',
      record: undefined,
    },
    {
      reason: 'outside the caller’s bindings',
      record: uploadedRecord(id, planP2),
    },
  ])('returns the same 404 when the artifact is $reason', async ({ record }) => {
    vi.mocked(findArtifactById).mockResolvedValueOnce(record)
    const event = artifactEvent('GET', '/' + id + '/sas')

    await expect(getDownloadSas(event)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Artifact not found',
    })
    expect(signDownload).not.toHaveBeenCalled()
  })

  test('does not reveal the upload state to a planner without read access', async () => {
    authenticateAs(contexts['planner-p1'])
    vi.mocked(findArtifactById).mockResolvedValueOnce(reserved)
    const event = artifactEvent('GET', '/' + id + '/sas')

    await expect(getDownloadSas(event)).rejects.toMatchObject({ statusCode: 403 })
    expect(signDownload).not.toHaveBeenCalled()
  })
})
