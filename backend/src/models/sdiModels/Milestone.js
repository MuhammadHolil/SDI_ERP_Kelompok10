const mongoose = require('mongoose');

const { Schema } = mongoose;

const milestoneSchema = new Schema({
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
  },

  code: {
    type: String,
    required: true,
    trim: true,
  },

  name: {
    type: String,
    required: true,
    trim: true,
  },

  dueDate: {
    type: Date,
    required: true,
  },

  progressWeight: {
    type: Number,
    required: true,
    validate: {
      validator: (value) =>
        Number.isFinite(value) && value > 0 && value <= 100,
      message: 'Bobot progres harus lebih dari 0 dan maksimal 100.',
    },
  },

  billingTermCode: {
    type: String,
    required: true,
    trim: true,
  },

  billingAmount: {
    type: Number,
    required: true,
    validate: {
      validator: (value) =>
        Number.isFinite(value) && value > 0,
      message: 'Nilai penagihan harus lebih dari nol.',
    },
  },

  status: {
    type: String,
    required: true,
    default: 'planned',
  },

  approvalStatus: {
    type: String,
    required: true,
    default: 'draft',
  },

  evidence: {
    type: [Schema.Types.Mixed],
    default: [],
  },
});

milestoneSchema.index(
  { project: 1, code: 1 },
  { unique: true }
);

module.exports = mongoose.model('Milestone', milestoneSchema);