import { defineEventHandler } from 'h3'
import { completeArtifactRequestSchema } from '#shared/utils/zod-schemas/artifact.schema.ts'
import { useDB } from '#server/db/use-db.ts'
import { requireArtifactAccess } from '#server/utils/guards/require-artifact-access.ts'
import { requireArtifactConfiguration } from '#server/utils/guards/require-artifact-configuration.ts'
import { requireStepContext } from '#server/utils/guards/require-step-context.ts'
import { readArtifactBody, readArtifactId } from '#server/utils/artifact/http.utils.ts'
import { recordUploadReport } from '#server/utils/artifact/repository.utils.ts'

// Report the outcome of a direct upload to Azure: uploaded (reported, not verified,
// size/hash) or failed, with optional details. Each report replaces the previous one.
export default defineEventHandler(async (event) => {
  await requireStepContext(event)
  const id = await readArtifactId(event)
  const report = await readArtifactBody(event, completeArtifactRequestSchema)
  requireArtifactConfiguration(event)
  // The first report on a reserved artifact needs create; later reports need update.
  await requireArtifactAccess(event, id, record => record.state === 'reserved' ? 'create' : 'update')
  await recordUploadReport(useDB(), id, report)
  // Acknowledgment only: a write-only caller must not read the stored metadata.
  return {
    id,
    state: report.state,
  }
})
