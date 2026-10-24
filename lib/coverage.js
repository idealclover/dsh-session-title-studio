import { z } from 'zod'
import { coverageInit, foldCoverage } from './coverage-core.js'

export const coverageDefinition = {
  key: 'studioTitleCoverage', stateVersion: 1,
  stateSchema: z.object({
    count: z.number().int().nonnegative(),
    covered: z.number().int().nonnegative(),
    first: z.number().int().nonnegative().nullable(),
    tail: z.array(z.number().int().nonnegative()).max(256),
  }),
  init: coverageInit,
  apply: foldCoverage,
}
