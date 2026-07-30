import { z } from "zod"

export const MatchSchema = z.object({
  match: z.number().int().positive(),
  start: z.string(),
  end: z.string(),
})

export type Match = z.infer<typeof MatchSchema>

export const MatchResultSchema = z.array(MatchSchema)
export type MatchResult = z.infer<typeof MatchResultSchema>

export const JobStatus = {
  Pending: "pending",
  Downloading: "downloading",
  Preprocessing: "preprocessing",
  Detecting: "detecting",
  Cutting: "cutting",
  Done: "done",
  Failed: "failed",
} as const

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus]

export const ProcessRequestSchema = z.object({
  videoPath: z.string().min(1),
})

export type ProcessRequest = z.infer<typeof ProcessRequestSchema>
