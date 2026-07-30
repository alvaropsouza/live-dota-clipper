import { Worker } from "bullmq"
import pino from "pino"

const logger = pino()
const connection = { url: process.env["REDIS_URL"] ?? "redis://localhost:6379" }

const worker = new Worker(
  "jobs",
  async (job) => {
    if (job.name !== "download") return
    logger.info({ jobId: job.data.jobId }, "download started")
    throw new Error("not implemented")
  },
  { connection },
)

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.data.jobId, err }, "download failed")
})
