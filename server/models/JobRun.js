const mongoose = require('mongoose');

// When each background job last ran. On Vercel there is no long-running process to keep a timer,
// so incoming requests start the job instead; this record lets every server instance share one
// schedule. _id is the job's name, e.g. 'reminders'.
const jobRunSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    lastRunAt: { type: Date, default: null },
  },
  { versionKey: false }
);

module.exports = mongoose.models.JobRun || mongoose.model('JobRun', jobRunSchema);
