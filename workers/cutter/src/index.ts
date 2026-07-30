import { Worker } from "bullmq"
import pino from "pino"
import type { MatchResult } from "@dota-vod/shared"

const logger = pino()
const connection = { url: process.env["REDIS_URL"] ?? "redis://localhost:6379" }

const worker = new Worker(
  "jobs",
  async (job) => {
    if (job.name !== "cut") return
    const matches = job.data.matches as MatchResult
    logger.info({ jobId: job.data.jobId, count: matches.length }, "cutting started")
    throw new Error("not implemented")
  },
  { connection },
)

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.data.jobId, err }, "cutting failed")
})
