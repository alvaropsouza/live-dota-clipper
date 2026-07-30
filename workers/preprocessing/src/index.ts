import { createClient } from "@libsql/client"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import pino from "pino"
import { JobStatus } from "@dota-vod/shared"

const logger = pino({
  name: "preprocessing",
  transport: { target: "pino-pretty", options: { colorize: true } },
})

const DB_PATH = path.resolve(process.env["DB_PATH"] ?? "./data/app.db")
const TMP_DIR = path.resolve(process.env["TMP_DIR"] ?? "../../data/tmp")
const PYTHON_URL = process.env["PYTHON_URL"] ?? "http://localhost:8000"
const API_URL = process.env["API_URL"] ?? "http://localhost:3000"

await mkdir(path.dirname(DB_PATH), { recursive: true })
const db = createClient({ url: `file:${DB_PATH}` })
await db.executeMultiple("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;")

logger.info({ dbPath: DB_PATH, tmpDir: TMP_DIR, pythonUrl: PYTHON_URL }, "worker ready")

async function poll() {
  const claimed = await db.execute(`
    UPDATE jobs SET status = '${JobStatus.Detecting}'
    WHERE id = (SELECT id FROM jobs WHERE status = '${JobStatus.Preprocessing}' ORDER BY createdAt ASC LIMIT 1)
    RETURNING id
  `)

  if (claimed.rows.length === 0) return

  const jobId = claimed.rows[0].id as string
  const videoPath = path.join(TMP_DIR, `job-${jobId}`, "video.mp4")

  logger.info({ jobId, videoPath }, "dispatching to python")

  try {
    const res = await fetch(`${PYTHON_URL}/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoPath,
        jobId,
        progressUrl: `${API_URL}/jobs/${jobId}/progress`,
      }),
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Python service ${res.status}: ${text}`)
    }

    // Python accepted the job (202) — result arrives via POST /jobs/:id/complete
    logger.info({ jobId }, "detection accepted by python")
  } catch (err) {
    logger.error({ jobId, err: (err as Error).message }, "preprocessing failed")
    await db.execute({
      sql: `UPDATE jobs SET status = ?, finishedAt = ? WHERE id = ?`,
      args: [JobStatus.Failed, new Date().toISOString(), jobId],
    })
  }
}

setInterval(() => { poll().catch((err: unknown) => logger.error({ err }, "poll error")) }, 2000)
