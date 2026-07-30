import { createClient } from "@libsql/client"
import { spawn } from "node:child_process"
import { mkdir } from "node:fs/promises"
import path from "node:path"
import pino from "pino"
import { JobStatus } from "@dota-vod/shared"

const logger = pino({
  name: "downloader",
  transport: { target: "pino-pretty", options: { colorize: true } },
})

const TMP_DIR = path.resolve(process.env["TMP_DIR"] ?? "../../data/tmp")
const DB_PATH = path.resolve(process.env["DB_PATH"] ?? "./data/app.db")

await mkdir(path.dirname(DB_PATH), { recursive: true })
const db = createClient({ url: `file:${DB_PATH}` })
await db.executeMultiple("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;")

logger.info({ dbPath: DB_PATH, tmpDir: TMP_DIR }, "worker ready")

let activeProc: ReturnType<typeof spawn> | null = null

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    activeProc?.kill()
    process.exit(0)
  })
}

function runYtDlp(url: string, outputPath: string, jobId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ytDlp = process.env["YT_DLP_PATH"] ?? "yt-dlp"
    const ffmpegLocation = process.env["FFMPEG_BIN"] ?? ""
    const args = [
      "--no-playlist",
      "--newline",
      "--progress-delta", "5",
      "--continue",
      "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
      "--merge-output-format", "mp4",
      "-o", outputPath,
      ...(ffmpegLocation ? ["--ffmpeg-location", ffmpegLocation] : []),
      url,
    ]
    const proc = spawn(ytDlp, args)
    activeProc = proc
    let lastPct = -1

    proc.stdout.on("data", (chunk: Buffer) => {
      const line = chunk.toString().trimEnd()
      if (line) logger.info({ jobId }, line)
    })

    proc.stderr.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split(/[\r\n]+/)) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const match = trimmed.match(/(\d+\.\d+)%/)
        if (match) {
          const pct = Math.floor(parseFloat(match[1]))
          if (pct === lastPct) continue
          lastPct = pct
          logger.info({ jobId }, trimmed)
          db.execute({ sql: `UPDATE jobs SET progress = ? WHERE id = ?`, args: [pct, jobId] }).catch(() => {})
        } else {
          logger.info({ jobId }, trimmed)
        }
      }
    })

    proc.on("close", (code) => {
      activeProc = null
      if (code === 0) resolve()
      else reject(new Error(`yt-dlp exited with code ${String(code)}`))
    })

    proc.on("error", (err) => {
      reject(new Error(`yt-dlp spawn failed: ${err.message}`))
    })
  })
}

async function poll() {
  const claimed = await db.execute(`
    UPDATE jobs SET status = '${JobStatus.Downloading}'
    WHERE id = (SELECT id FROM jobs WHERE status = '${JobStatus.Pending}' ORDER BY createdAt ASC LIMIT 1)
    RETURNING id, url
  `)

  if (claimed.rows.length === 0) return

  const jobId = claimed.rows[0].id as string
  const url = claimed.rows[0].url as string
  const jobDir = path.join(TMP_DIR, `job-${jobId}`)
  const outputPath = path.join(jobDir, "video.mp4")
  const startedAt = Date.now()

  logger.info({ jobId, url }, "download started")

  try {
    await mkdir(jobDir, { recursive: true })
    await runYtDlp(url, outputPath, jobId)

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1)
    logger.info({ jobId, outputPath, elapsedSec: elapsed }, "download complete → preprocessing")

    await db.execute({
      sql: `UPDATE jobs SET status = ? WHERE id = ?`,
      args: [JobStatus.Preprocessing, jobId],
    })
  } catch (err) {
    logger.error({ jobId, err: (err as Error).message }, "download failed")
    await db.execute({
      sql: `UPDATE jobs SET status = ?, finishedAt = ? WHERE id = ?`,
      args: [JobStatus.Failed, new Date().toISOString(), jobId],
    })
  }
}

setInterval(() => { poll().catch((err: unknown) => logger.error({ err }, "poll error")) }, 2000)
