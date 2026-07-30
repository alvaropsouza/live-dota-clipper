import { createClient } from "@libsql/client"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import path from "node:path"
import pino from "pino"
import { JobStatus } from "@dota-vod/shared"

const logger = pino({
  name: "cutter",
  transport: { target: "pino-pretty", options: { colorize: true } },
})

const DB_PATH = path.resolve(process.env["DB_PATH"] ?? "./data/app.db")
const TMP_DIR = path.resolve(process.env["TMP_DIR"] ?? "../../data/tmp")
const FFMPEG = process.env["FFMPEG_PATH"] ?? "ffmpeg"
const PYTHON_URL = process.env["PYTHON_URL"] ?? "http://localhost:8000"

await mkdir(path.dirname(DB_PATH), { recursive: true })
const db = createClient({ url: `file:${DB_PATH}` })
await db.executeMultiple("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;")

logger.info({ dbPath: DB_PATH, tmpDir: TMP_DIR }, "worker ready")

type MatchEntry = { match: number; start: string; end: string }
type HighlightEntry = { highlight: number; match: number; start: string; end: string }

async function detectHighlights(matchPath: string, matchNum: number, jobId: string): Promise<HighlightEntry[]> {
  try {
    const res = await fetch(`${PYTHON_URL}/detect-highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoPath: matchPath, matchNum, jobId }),
    })
    if (!res.ok) {
      logger.warn({ jobId, matchNum, status: res.status }, "highlight detection failed, skipping")
      return []
    }
    const data = await res.json() as { highlights: HighlightEntry[] }
    return data.highlights ?? []
  } catch (err) {
    logger.warn({ jobId, matchNum, err: (err as Error).message }, "highlight detection error, skipping")
    return []
  }
}

function runCut(input: string, start: string, end: string, output: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG, ["-ss", start, "-to", end, "-i", input, "-c", "copy", "-y", output])
    proc.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited ${String(code)}`))
    })
    proc.on("error", (err) => reject(new Error(`ffmpeg spawn: ${err.message}`)))
  })
}

function probeDuration(filePath: string): Promise<number | null> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "error", "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1", filePath,
    ])
    let out = ""
    proc.stdout.on("data", (d: Buffer) => { out += d.toString() })
    proc.on("close", () => {
      const n = parseFloat(out.trim())
      resolve(isNaN(n) ? null : n)
    })
    proc.on("error", () => resolve(null))
  })
}

async function poll() {
  const claimed = await db.execute(`
    UPDATE jobs SET status = '${JobStatus.Done}'
    WHERE id = (SELECT id FROM jobs WHERE status = '${JobStatus.Cutting}' ORDER BY createdAt ASC LIMIT 1)
    RETURNING id
  `)

  if (claimed.rows.length === 0) return

  const jobId = claimed.rows[0].id as string
  const jobDir = path.join(TMP_DIR, `job-${jobId}`)
  const outputDir = path.join(jobDir, "output")

  logger.info({ jobId }, "cutting started")

  try {
    const matches: MatchEntry[] = JSON.parse(
      await readFile(path.join(jobDir, "matches.json"), "utf-8")
    )

    if (matches.length === 0) {
      logger.warn({ jobId }, "no matches detected")
      await db.execute({
        sql: `UPDATE jobs SET status = ?, finishedAt = ? WHERE id = ?`,
        args: [JobStatus.Done, new Date().toISOString(), jobId],
      })
      return
    }

    await mkdir(outputDir, { recursive: true })

    const metadata: Array<{ match: number; start: string; end: string; file: string; duration: number | null }> = []
    const hlDir = path.join(outputDir, "highlights")

    for (const m of matches) {
      const outputPath = path.join(outputDir, `match${String(m.match).padStart(3, "0")}.mp4`)
      logger.info({ jobId, match: m.match, start: m.start, end: m.end }, "cutting")
      await runCut(path.join(jobDir, "video.mp4"), m.start, m.end, outputPath)
      const duration = await probeDuration(outputPath)
      await db.execute({
        sql: `INSERT INTO files (id, jobId, path, duration, type) VALUES (?, ?, ?, ?, 'match')`,
        args: [crypto.randomUUID(), jobId, outputPath, duration],
      })
      metadata.push({ match: m.match, start: m.start, end: m.end, file: path.basename(outputPath), duration })

      const highlights = await detectHighlights(outputPath, m.match, jobId)
      if (highlights.length > 0) {
        await mkdir(hlDir, { recursive: true })
        for (const hl of highlights) {
          const hlName = `match${String(m.match).padStart(3, "0")}_hl${String(hl.highlight).padStart(3, "0")}.mp4`
          const hlPath = path.join(hlDir, hlName)
          logger.info({ jobId, match: m.match, highlight: hl.highlight, start: hl.start, end: hl.end }, "cutting highlight")
          await runCut(outputPath, hl.start, hl.end, hlPath)
          const hlDuration = await probeDuration(hlPath)
          await db.execute({
            sql: `INSERT INTO files (id, jobId, path, duration, type) VALUES (?, ?, ?, ?, 'highlight')`,
            args: [crypto.randomUUID(), jobId, hlPath, hlDuration],
          })
        }
        logger.info({ jobId, match: m.match, count: highlights.length }, "highlights cut")
      }
    }

    await writeFile(
      path.join(outputDir, "metadata.json"),
      JSON.stringify({ jobId, matches: metadata }, null, 2),
    )

    logger.info({ jobId, cuts: matches.length }, "cutting complete")
    await db.execute({
      sql: `UPDATE jobs SET status = ?, finishedAt = ? WHERE id = ?`,
      args: [JobStatus.Done, new Date().toISOString(), jobId],
    })

    await Promise.all([
      rm(path.join(jobDir, "video.mp4"), { force: true }),
      rm(path.join(jobDir, "matches.json"), { force: true }),
    ])
    logger.info({ jobId }, "tmp cleaned")
  } catch (err) {
    logger.error({ jobId, err: (err as Error).message }, "cutting failed")
    await db.execute({
      sql: `UPDATE jobs SET status = ?, finishedAt = ? WHERE id = ?`,
      args: [JobStatus.Failed, new Date().toISOString(), jobId],
    })
  }
}

setInterval(() => { poll().catch((err: unknown) => logger.error({ err }, "poll error")) }, 2000)
