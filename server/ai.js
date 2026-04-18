const OpenAI = require('openai')
const axios = require('axios')

function getPreferredAiProvider() {
  const requestedProvider = String(process.env.AI_PROVIDER || '').trim().toLowerCase()

  if (requestedProvider === 'gemini' && process.env.GEMINI_API_KEY) {
    return 'gemini'
  }

  if (requestedProvider === 'openai' && process.env.OPENAI_API_KEY) {
    return 'openai'
  }

  if (process.env.GEMINI_API_KEY) {
    return 'gemini'
  }

  if (process.env.OPENAI_API_KEY) {
    return 'openai'
  }

  return 'none'
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function inferChartTypeFromQuestion(question) {
  const normalized = normalizeText(question)
  if (/\b(trend|over time|monthly|daily|weekly|yearly|time series)\b/.test(normalized)) {
    return 'line'
  }
  if (/\b(share|distribution|breakdown|contribution|split|composition|mix|pie)\b/.test(normalized)) {
    return 'pie'
  }
  if (/\b(top|highest|largest|best|most|least|lowest|ranking)\b/.test(normalized)) {
    return 'bar'
  }
  return null
}

function enforceChartType(question, analysis) {
  if (!analysis?.chart?.type) return analysis
  const inferred = inferChartTypeFromQuestion(question)
  if (!inferred) return analysis
  if (analysis.chart.type !== inferred) {
    analysis.chart.type = inferred
  }
  return analysis
}

function quoteIdentifier(value) {
  return `"${String(value).replace(/"/g, '""')}"`
}

function findMatchingColumn(columns, question, preferredType) {
  const normalizedQuestion = normalizeText(question)
  const scopedColumns = preferredType ? columns.filter((column) => column.type === preferredType) : columns

  return (
    scopedColumns.find((column) => {
      const normalizedLabel = normalizeText(column.label)
      const normalizedName = normalizeText(column.name)
      return normalizedLabel && normalizedQuestion.includes(normalizedLabel)
        || normalizedName && normalizedQuestion.includes(normalizedName)
    }) || null
  )
}

function buildHeuristicSql({ question, profile }) {
  const normalizedQuestion = normalizeText(question)
  const metricColumn =
    findMatchingColumn(profile.columns, question, 'numeric') || profile.numericColumns?.[0] || null
  const categoryColumn =
    findMatchingColumn(profile.columns, question, 'categorical') || profile.categoricalColumns?.[0] || null
  const dateColumn =
    findMatchingColumn(profile.columns, question, 'date') || profile.dateColumns?.[0] || null
  const limitMatch = normalizedQuestion.match(/\btop\s+(\d+)\b/)
  const limit = limitMatch ? Number(limitMatch[1]) : 5
  const wantsAverage = /\b(average|avg|mean)\b/.test(normalizedQuestion)
  const wantsCount = /\b(count|number of|how many)\b/.test(normalizedQuestion)
  const wantsTrend = /\b(trend|over time|monthly|daily|weekly|yearly)\b/.test(normalizedQuestion)
  const wantsShare = /\b(share|distribution|breakdown|contribution|split|pie)\b/.test(normalizedQuestion)
  const wantsRanking = /\b(top|highest|largest|best|most|least|lowest)\b/.test(normalizedQuestion)

  if (wantsTrend && dateColumn) {
    const metricExpression =
      wantsCount || !metricColumn
        ? 'COUNT(*)'
        : `${wantsAverage ? 'AVG' : 'SUM'}(${quoteIdentifier(metricColumn.name)})`

    return `
      SELECT
        CAST(date_trunc('month', TRY_CAST(${quoteIdentifier(dateColumn.name)} AS DATE)) AS VARCHAR) AS label,
        ${metricExpression} AS value
      FROM data
      WHERE TRY_CAST(${quoteIdentifier(dateColumn.name)} AS DATE) IS NOT NULL
      GROUP BY 1
      ORDER BY 1
      LIMIT 24
    `.trim()
  }

  if ((wantsShare || wantsRanking) && categoryColumn) {
    const metricExpression =
      wantsCount || !metricColumn
        ? 'COUNT(*)'
        : `${wantsAverage ? 'AVG' : 'SUM'}(${quoteIdentifier(metricColumn.name)})`

    return `
      SELECT
        CAST(${quoteIdentifier(categoryColumn.name)} AS VARCHAR) AS label,
        ${metricExpression} AS value
      FROM data
      WHERE ${quoteIdentifier(categoryColumn.name)} IS NOT NULL
      GROUP BY 1
      ORDER BY value DESC
      LIMIT ${Math.max(1, limit)}
    `.trim()
  }

  if (wantsAverage && metricColumn) {
    return `
      SELECT
        'Average ${metricColumn.label}' AS label,
        AVG(${quoteIdentifier(metricColumn.name)}) AS value
      FROM data
    `.trim()
  }

  if (metricColumn && categoryColumn) {
    return `
      SELECT
        CAST(${quoteIdentifier(categoryColumn.name)} AS VARCHAR) AS label,
        SUM(${quoteIdentifier(metricColumn.name)}) AS value
      FROM data
      WHERE ${quoteIdentifier(categoryColumn.name)} IS NOT NULL
      GROUP BY 1
      ORDER BY value DESC
      LIMIT ${Math.max(1, limit)}
    `.trim()
  }

  return `
    SELECT
      'Rows' AS label,
      COUNT(*) AS value
    FROM data
  `.trim()
}

function buildLocalAnalysis({ question, sqlResultRows }) {
  const rows = Array.isArray(sqlResultRows) ? sqlResultRows : []
  const firstRow = rows[0] || {}
  const keys = Object.keys(firstRow)
  const labelKey = keys.find((key) => /label|name|category|date|month|region|product/i.test(key)) || keys[0] || 'label'
  const valueKey = keys.find((key) => /value|sales|profit|orders|count|avg|sum|total/i.test(key)) || keys[1] || 'value'
  const normalizedQuestion = normalizeText(question)
  const chartType = /\b(trend|over time|monthly|daily|weekly|yearly)\b/.test(normalizedQuestion)
    ? 'line'
    : /\b(share|distribution|breakdown|contribution|split|pie)\b/.test(normalizedQuestion)
      ? 'pie'
      : 'bar'

  const chartData = rows.map((row) => ({
    label: row[labelKey] == null ? 'Unknown' : String(row[labelKey]),
    value: Number(row[valueKey]) || 0,
  }))

  const topPoint = [...chartData].sort((a, b) => b.value - a.value)[0]
  const summary = topPoint
    ? `${topPoint.label} leads this view at ${topPoint.value.toLocaleString()}.`
    : 'Analysis completed successfully.'

  return {
    title: 'Analysis result',
    summary,
    insights: [
      chartData.length ? `${chartData.length} result points were returned.` : 'No rows matched the request.',
      topPoint ? `${topPoint.label} is currently the strongest result.` : 'Try refining the question for a more specific cut.',
      'This view was generated with the built-in fallback planner.',
    ],
    chart: {
      type: chartType,
      xKey: 'label',
      yKey: 'value',
      label: 'Value',
      data: chartData,
    },
    table: rows,
  }
}

function buildSqlSystemPrompt() {
  return `
You are an expert DuckDB Data Analyst.
You will write a SQL query to answer the user's question.
You are querying a view named 'data'.
Use ONLY standard DuckDB SQL syntax.

Return ONLY a valid JSON object with the following schema:
{
  "sqlQuery": "SELECT ..." 
}
`.trim()
}

function buildSqlUserPrompt({ question, profile }) {
  // Omit previewRows!
  return JSON.stringify(
    {
      question,
      schema: profile.columns.map((column) => ({
        name: column.name,
        label: column.label,
        type: column.type,
      })),
      table_name: 'data'
    },
    null,
    2,
  )
}

function extractJson(text) {
  if (!text) {
    return null
  }

  const trimmed = String(text).trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }

  const match = trimmed.match(/\{[\s\S]*\}/)
  return match ? match[0] : null
}

function getGeminiModelCandidates() {
  const configuredModel = String(process.env.GEMINI_MODEL || '').trim()
  return [...new Set([configuredModel, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'].filter(Boolean))]
}

async function requestGeminiJson(promptText, maxOutputTokens) {
  let lastError = null

  for (const model of getGeminiModelCandidates()) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`

    try {
      const response = await axios.post(
        endpoint,
        {
          contents: [
            {
              role: 'user',
              parts: [{ text: promptText }],
            },
          ],
          generationConfig: {
            temperature: 0.2,
            topP: 0.9,
            maxOutputTokens,
          },
        },
        { timeout: 15_000, proxy: false },
      )

      const text =
        response.data?.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') ??
        ''
      const jsonText = extractJson(text)
      if (!jsonText) {
        throw new Error(`Gemini model ${model} returned an empty response.`)
      }

      return jsonText
    } catch (error) {
      lastError = error
      const statusCode = error.response?.status
      if (statusCode === 404) {
        continue
      }

      throw error
    }
  }

  throw lastError || new Error('No Gemini model could generate a response.')
}

async function planAnalysisSqlWithGemini({ question, profile }) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is missing. AI SQL generation requires it.')
  }

  const jsonText = await requestGeminiJson(
    `${buildSqlSystemPrompt()}\n\n${buildSqlUserPrompt({ question, profile })}`,
    512,
  )
  const result = JSON.parse(jsonText)
  return result.sqlQuery || result.sql || result.sql_query
}

async function planAnalysisSql({ question, profile }) {
  const provider = getPreferredAiProvider()

  if (provider === 'gemini') {
    try {
      return await planAnalysisSqlWithGemini({ question, profile })
    } catch {
      return buildHeuristicSql({ question, profile })
    }
  }

  if (provider !== 'openai') {
    return buildHeuristicSql({ question, profile })
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: buildSqlSystemPrompt(),
        },
        {
          role: 'user',
          content: buildSqlUserPrompt({ question, profile }),
        },
      ],
    })

    const text = response.choices[0]?.message?.content?.trim()
    if (!text) {
      throw new Error('OpenAI returned an empty planning response.')
    }

    const result = JSON.parse(text)
    return result.sqlQuery || result.sql || result.sql_query
  } catch {
    return buildHeuristicSql({ question, profile })
  }
}

function buildChartSystemPrompt() {
  return `
You are a Data Visualization expert.
Given a raw SQL result set (rows of data) and the original user question, you must generate a visual analysis configuration.
Return ONLY valid JSON matching this schema:
{
  "title": "A short, clear title for the chart",
  "summary": "A 1-2 sentence conversational summary summarizing the finding",
  "insights": ["Insight 1", "Insight 2", "Insight 3"],
  "chart": {
    "type": "bar" | "line" | "pie",
    "xKey": "The exact key from the data rows to use as the X axis/label",
    "yKey": "The exact key from the data rows to use as the Y axis/value",
    "label": "The label for the Y axis",
    "data": [
      { "label": "string representing x axis", "value": "number representing y axis" }
    ]
  }
}
Rules:
- For trends over time, use "line".
- For share or breakdown, use "pie".
- For comparisons (top 5, highest, totals by category), use "bar".
- Convert the raw rows into the matching chart.data array using EXACTLY the keys "label" and "value".
- Ensure insights are interesting observations.
- Keep the summary short and engaging.
`.trim()
}

async function generateInsightsAndChart({ question, sqlResultRows }) {
  const provider = getPreferredAiProvider()

  if (provider === 'gemini') {
    try {
      const jsonText = await requestGeminiJson(
        `${buildChartSystemPrompt()}\n\n${JSON.stringify({ question, sqlResultRows }, null, 2)}`,
        1024,
      )

      const analysis = JSON.parse(jsonText)
      analysis.table = sqlResultRows
      return enforceChartType(question, analysis)
    } catch {
      return buildLocalAnalysis({ question, sqlResultRows })
    }
  }

  if (provider !== 'openai') {
    return buildLocalAnalysis({ question, sqlResultRows })
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  try {
    const response = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: buildChartSystemPrompt(),
        },
        {
          role: 'user',
          content: JSON.stringify({ question, sqlResultRows }, null, 2),
        },
      ],
    })

    const text = response.choices[0]?.message?.content?.trim()
    if (!text) {
      throw new Error('OpenAI returned an empty chart response.')
    }

    const analysis = JSON.parse(text)
    analysis.table = sqlResultRows // Always include the raw table
    return enforceChartType(question, analysis)
  } catch {
    return buildLocalAnalysis({ question, sqlResultRows })
  }
}

module.exports = {
  getPreferredAiProvider,
  planAnalysisSql,
  generateInsightsAndChart,
}
