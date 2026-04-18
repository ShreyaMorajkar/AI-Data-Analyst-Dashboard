const mongoose = require('mongoose')

let connected = false
let lastConnectionError = null

async function connectToDatabase() {
  if (connected || !process.env.MONGODB_URI) {
    return
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGODB_DB || 'ai_data_analyst_dashboard',
    })

    connected = true
    lastConnectionError = null
    console.log('Connected to MongoDB')
  } catch (error) {
    connected = false
    lastConnectionError = error
    throw error
  }
}

function isDatabaseEnabled() {
  return connected
}

function hasDatabaseConfig() {
  return Boolean(process.env.MONGODB_URI)
}

function getDatabaseStatus() {
  if (connected) {
    return 'connected'
  }

  if (process.env.MONGODB_URI) {
    return 'configured'
  }

  return 'disabled'
}

function getLastDatabaseError() {
  return lastConnectionError?.message ?? null
}

module.exports = {
  connectToDatabase,
  getDatabaseStatus,
  getLastDatabaseError,
  hasDatabaseConfig,
  isDatabaseEnabled,
}
