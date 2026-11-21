import { createError, defineEventHandler } from 'h3'
import { requireArtifactAccess } from '../../../utils/guards/require-artifact-access.ts'
import { requireArtifactConfiguration } from '../../../utils/guards/require-artifact-configuration.ts'
import { requireStepContext } from '../../../utils/guards/require-step-context.ts'
import { signDownload } from '../../../utils/artifact/azure-sas.utils.ts'
import { preventCaching, readArtifactId } from '../../../utils/artifact/http.utils.ts'
import { useArtifactStorage } from '../../../utils/artifact/use-artifact-storage.ts'

// Issue a just-in-time download SAS; 409 until an upload has been reported.
export default defineEventHandler(async (event) => {
  await requireStepContext(event)
  const id = await readArtifactId(event)
  preventCaching(event)
  requireArtifactConfiguration(event)
  await requireArtifactAccess(event, id, () => 'read')
  const record = event.context.artifact!
  if (record.state !== 'uploaded') {
    throw createError({
      statusCode: 409,
      message: 'No successful upload has been reported',
    })
  }
  return signDownload(useArtifactStorage(event), record)
})
