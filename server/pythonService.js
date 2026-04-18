const axios = require('axios')

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://127.0.0.1:8000'
const PYTHON_REQUEST_TIMEOUT_MS = 30_000

function mapPythonServiceError(error) {
  if (error.code === 'ECONNREFUSED') {
    throw new Error(
      `Python Pandas service is not reachable at ${PYTHON_SERVICE_URL}. Start it first and install python-service/requirements.txt.`,
    )
  }
  if (error.code === 'ECONNABORTED') {
    throw new Error('Python Pandas service timed out while processing the request. Try a smaller dataset or retry.')
  }

  if (error.response?.data) {
    throw new Error(
      typeof error.response.data === 'string'
        ? error.response.data
        : JSON.stringify(error.response.data),
    )
  }

  throw error
}

async function profileCsv(csvText, filename, sessionId) {
  try {
    const response = await axios.post(`${PYTHON_SERVICE_URL}/profile`, {
      csv_text: csvText,
      filename,
      sessionId,
    }, {
      timeout: PYTHON_REQUEST_TIMEOUT_MS,
    })

    return response.data
  } catch (error) {
    mapPythonServiceError(error)
  }
}

async function executeSqlAnalysis(sessionId, sqlQuery) {
  try {
    const response = await axios.post(`${PYTHON_SERVICE_URL}/execute`, {
      sessionId,
      sqlQuery,
    }, {
      timeout: PYTHON_REQUEST_TIMEOUT_MS,
    })

    return response.data
  } catch (error) {
    mapPythonServiceError(error)
  }
}

async function pingPythonService() {
  try {
    const response = await axios.get(`${PYTHON_SERVICE_URL}/health`, {
      timeout: 5_000,
    })

    return Boolean(response.data?.ok)
  } catch {
    return false
  }
}

module.exports = {
  executeSqlAnalysis,
  pingPythonService,
  profileCsv,
}
