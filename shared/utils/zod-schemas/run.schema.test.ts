import { expect, test } from 'vitest'
import { createRunResponseSchema } from './run.schema.ts'

const response = {
  runId: '40000000-0000-4000-8000-000000000001',
  expiresAt: '2026-11-21T13:00:00Z',
  steps: {
    planner: {
      stepId: '40000000-0000-4000-8000-000000000002',
      token: 'a'.repeat(64),
    },
    coder: {
      stepId: '40000000-0000-4000-8000-000000000003',
      token: 'b'.repeat(64),
    },
  },
}

test('accepts a run response with planner and coder credentials', () => {
  expect(createRunResponseSchema.parse(response)).toStrictEqual(response)
})

test.each([
  {
    reason: 'a missing coder',
    steps: { planner: response.steps.planner },
  },
  {
    reason: 'a non-hex token',
    steps: {
      ...response.steps,
      coder: {
        ...response.steps.coder,
        token: 'g'.repeat(64),
      },
    },
  },
  {
    reason: 'an extra credential field',
    steps: {
      ...response.steps,
      coder: {
        ...response.steps.coder,
        internalId: 'internal',
      },
    },
  },
])('rejects a run response with $reason', ({ steps }) => {
  expect(createRunResponseSchema.safeParse({
    ...response,
    steps,
  }).success).toBe(false)
})
