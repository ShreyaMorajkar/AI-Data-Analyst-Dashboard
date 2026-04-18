import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const pythonDir = path.join(rootDir, 'python-service')
const serverDir = path.join(rootDir, 'server')
const sampleCsvPath = path.join(rootDir, 'sample-sales-data.csv')

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForJson(url, attempts = 30) {
  let lastError

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return response.json()
      }
      lastError = new Error(`Unexpected status ${response.status} from ${url}`)
    } catch (error) {
      lastError = error
    }

    await wait(1000)
  }

  throw lastError || new Error(`Unable to reach ${url}`)
}

function startProcess(command, args, cwd, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  child.on('error', (error) => {
    console.error(`Failed to start ${command}:`, error.message)
  })

  return child
}

async function run() {
  const pythonProcess = startProcess('python', ['app.py'], pythonDir)
  const serverProcess = startProcess('node', ['index.js'], serverDir)

  try {
    const health = await waitForJson('http://127.0.0.1:5050/api/health')
    const csvText = await readFile(sampleCsvPath, 'utf8')
    const formData = new FormData()
    formData.append('file', new Blob([csvText], { type: 'text/csv' }), 'sample-sales-data.csv')

    const uploadResponse = await fetch('http://127.0.0.1:5050/api/upload', {
      method: 'POST',
      body: formData,
    })

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed with status ${uploadResponse.status}: ${await uploadResponse.text()}`)
    }

    const upload = await uploadResponse.json()

    const runAnalysis = async (question) => {
      const response = await fetch('http://127.0.0.1:5050/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: upload.sessionId,
          question,
        }),
      })

      if (!response.ok) {
        throw new Error(`Analysis failed for "${question}" with status ${response.status}: ${await response.text()}`)
      }

      return response.json()
    }

    const trend = await runAnalysis('Show monthly sales trend')
    const count = await runAnalysis('Which region has the highest count?')

    console.log(
      JSON.stringify(
        {
          health,
          upload: {
            sessionId: upload.sessionId,
            rows: upload.profile?.rowCount,
            columns: upload.profile?.columns?.length,
            initialChart: upload.initialAnalysis?.chart?.type ?? null,
          },
          trend: {
            title: trend.analysis?.title,
            chartType: trend.analysis?.chart?.type,
            points: trend.analysis?.chart?.data?.length,
          },
          count: {
            title: count.analysis?.title,
            chartType: count.analysis?.chart?.type,
            topLabel: count.analysis?.chart?.data?.[0]?.label ?? null,
          },
        },
        null,
        2,
      ),
    )
  } finally {
    serverProcess.kill()
    pythonProcess.kill()
  }
}

run().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
