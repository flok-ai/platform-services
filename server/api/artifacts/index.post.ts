import { defineEventHandler, setResponseStatus } from 'h3'
import { createArtifactRequestSchema } from '../../../shared/utils/zod-schemas/artifact.schema.ts'
import { useDB } from '../../db/use-db.ts'
import { requireArtifactPermission } from '../../utils/guards/require-artifact-access.ts'
import { requireArtifactConfiguration } from '../../utils/guards/require-artifact-configuration.ts'
import { requireStepContext } from '../../utils/guards/require-step-context.ts'
import { signUpload } from '../../utils/artifact/azure-sas.utils.ts'
import { preventCaching, readArtifactBody } from '../../utils/artifact/http.utils.ts'
import { upsertArtifact } from '../../utils/artifact/repository.utils.ts'
import { useArtifactStorage } from '../../utils/artifact/use-artifact-storage.ts'

// Register (201) or re-register (200) the caller's own artifact and issue an upload SAS.
export default defineEventHandler(async (event) => {
  await requireStepContext(event)
  const { name, ...metadata } = await readArtifactBody(event, createArtifactRequestSchema)
  preventCaching(event)
  requireArtifactConfiguration(event)
  // The producing step comes from the caller, never the request body.
  const step = event.context.step!
  const reference = {
    runId: step.runId,
    producerStepId: step.stepId,
    name,
  }
  // The upload SAS can overwrite (`sp=w`), so it needs both permissions.
  requireArtifactPermission(event, reference, ['create', 'update'])
  const { record, created } = await upsertArtifact(useDB(), reference, metadata)
  // If signing fails the registration stays; a repeated POST signs again.
  const upload = await signUpload(useArtifactStorage(event), record)
  setResponseStatus(event, created ? 201 : 200)
  return {
    id: record.id,
    state: record.state,
    upload,
  }
})
