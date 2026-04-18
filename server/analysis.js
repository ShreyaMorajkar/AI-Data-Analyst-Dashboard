function buildOverview(profile) {
  return {
    title: 'Dataset overview',
    summary: `Loaded ${profile.rowCount} rows across ${profile.columns.length} columns.`,
    insights: [
      `${profile.numericColumns.length} numeric fields can be used for KPIs and charts.`,
      `${profile.categoricalColumns.length} categorical fields can be used for grouping and rankings.`,
      `${profile.dateColumns.length} date fields can be used for trend analysis.`,
    ],
    chart: null,
    table: profile.previewRows,
    matchedColumns: profile.columns.map((column) => column.label),
  }
}

function buildSuggestionChips(profile) {
  const metric = profile.numericColumns[0]?.label ?? 'records'
  const dimension = profile.categoricalColumns[0]?.label ?? 'category'
  const date = profile.dateColumns[0]?.label ?? 'date'
  const countPrompt = profile.numericColumns.length
    ? `Which ${dimension.toLowerCase()} has the highest ${metric.toLowerCase()}?`
    : `Which ${dimension.toLowerCase()} has the highest count?`
  const distributionPrompt = profile.numericColumns.length
    ? `Show ${metric.toLowerCase()} distribution by ${dimension.toLowerCase()}`
    : `Show ${dimension.toLowerCase()} distribution by count`

  return [
    `Show ${metric.toLowerCase()} trend by ${date.toLowerCase()}`,
    `Top 5 ${dimension.toLowerCase()} by ${metric.toLowerCase()}`,
    countPrompt,
    distributionPrompt,
    `Average ${metric.toLowerCase()}`,
  ]
}

function buildStarterPlan(profile) {
  const metric = profile.numericColumns[0]?.name ?? ''
  const groupBy = profile.categoricalColumns[0]?.name ?? ''
  const dateColumn = profile.dateColumns[0]?.name ?? ''

  if (metric && dateColumn) {
    return {
      operation: 'trend',
      metric,
      groupBy: '',
      dateColumn,
      aggregation: 'sum',
      limit: 8,
      timeGrain: 'month',
      chartType: 'line',
    }
  }

  if (!metric && dateColumn) {
    return {
      operation: 'trend',
      metric: '',
      groupBy: '',
      dateColumn,
      aggregation: 'count',
      limit: 8,
      timeGrain: 'month',
      chartType: 'line',
    }
  }

  if (metric && groupBy) {
    return {
      operation: 'top',
      metric,
      groupBy,
      dateColumn: '',
      aggregation: 'sum',
      limit: 5,
      timeGrain: 'month',
      chartType: 'bar',
    }
  }

  if (!metric && groupBy) {
    return {
      operation: 'top',
      metric: '',
      groupBy,
      dateColumn: '',
      aggregation: 'count',
      limit: 5,
      timeGrain: 'month',
      chartType: 'bar',
    }
  }

  return {
    operation: 'overview',
    metric: '',
    groupBy: '',
    dateColumn: '',
    aggregation: 'sum',
    limit: 5,
    timeGrain: 'month',
    chartType: 'bar',
  }
}

module.exports = {
  buildStarterPlan,
  buildOverview,
  buildSuggestionChips,
}
