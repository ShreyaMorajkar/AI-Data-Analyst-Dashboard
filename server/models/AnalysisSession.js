const mongoose = require('mongoose')

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

const analysisSchema = new mongoose.Schema(
  {
    question: { type: String, required: true },
    plan: { type: mongoose.Schema.Types.Mixed, required: true },
    response: { type: mongoose.Schema.Types.Mixed, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

const analysisSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: String, required: true, unique: true },
    filename: { type: String, required: true },
    rows: { type: [mongoose.Schema.Types.Mixed], required: true },
    profile: { type: mongoose.Schema.Types.Mixed, required: true },
    messages: { type: [messageSchema], default: [] },
    analyses: { type: [analysisSchema], default: [] },
  },
  { timestamps: true },
)

module.exports = mongoose.models.AnalysisSession || mongoose.model('AnalysisSession', analysisSessionSchema)
