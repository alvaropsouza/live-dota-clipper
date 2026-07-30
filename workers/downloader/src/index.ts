import { createClient } from "@libsql/client"
import { Queue, Worker } from "bullmq"
import { spawn } from "node:child_process"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import pino from "pino"
import { JobStatus } from "@dota-vod/shared"

const logger = pino()
const connection = { url: process.env["REDIS_URL"] ?? "redis://localhost:6379" }
const TMP_DIR = path.resolve(process.env["TMP_DIR"] ?? "./tmp")

const DB_PATH = path.resolve(process.env["DB_PATH"] ?? "./data/app.db")
await mkdir(path.dirname(DB_PATH), { recursive: true })
const db = createClient({ url: `file:${DB_PATH}` })

const jobQueue = new Queue("jobs", { connection })

function runYtDlp(url: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("yt-dlp", [
      "--no-playlist",
      "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
      "--merge-output-format", "mp4",
      "-o", outputPath,
      url,
    ])

    proc.stderr.on("data", (chunk: Buffer) => {
      logger.info(chunk.toString().trimEnd())
    })

    proc.stdout.on("data", (chunk: Buffer) => {
      logger.info(chunk.toString().trimEnd())
    })

    proc.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`yt-dlp exited with code ${String(code)}`))
    })

    proc.on("error", (err) => {
      reject(new Error(`yt-dlp spawn failed: ${err.message}`))
    })
  })
}

const worker = new Worker(
  "jobs",
  async (job) => {
    if (job.name !== "download") return

    const { jobId, videoPath: url } = job.data as { jobId: string; videoPath: string }
    const jobDir = path.join(TMP_DIR, `job-${jobId}`)
    const outputPath = path.join(jobDir, "video.mp4")

    await db.execute({
      sql: `UPDATE jobs SET status = ? WHERE id = ?`,
      args: [JobStatus.Downloading, jobId],
    })

    logger.info({ jobId, url }, "download started")

    await mkdir(jobDir, { recursive: true })
    await runYtDlp(url, outputPath)

    logger.info({ jobId, outputPath }, "download complete")

    await db.execute({
      sql: `UPDATE jobs SET status = ? WHERE id = ?`,
      args: [JobStatus.Preprocessing, jobId],
    })

    await jobQueue.add("preprocess", { jobId, videoPath: outputPath })
  },
  { connection },
)

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.data.jobId, err }, "download failed")
  if (!job) return
  db.execute({
    sql: `UPDATE jobs SET status = ?, finishedAt = ? WHERE id = ?`,
    args: [JobStatus.Failed, new Date().toISOString(), job.data.jobId],
  }).catch((dbErr: unknown) => {
    logger.error({ jobId: job.data.jobId, err: dbErr }, "failed to update job status to failed")
  })
})
