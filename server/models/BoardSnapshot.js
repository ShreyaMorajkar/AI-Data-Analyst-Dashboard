const mongoose = require('mongoose')

const boardSnapshotSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    filename: { type: String, required: true },
    title: { type: String, required: true },
    mode: { type: String, required: true, default: 'overview' },
    focusedViewId: { type: String, default: null },
  },
  { timestamps: true },
)

module.exports = mongoose.models.BoardSnapshot || mongoose.model('BoardSnapshot', boardSnapshotSchema)
