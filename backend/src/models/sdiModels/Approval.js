const mongoose = require('mongoose');

const approvalSchema = new mongoose.Schema(
  {
    targetType: {
      type: String,
      required: true,
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    targetRevision: {
      type: Number,
      required: true,
      min: 1,
    },

    step: {
      type: String,
      required: true,
    },

    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },

    decidedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },

    decision: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },

    requestedAt: {
      type: Date,
      required: true,
    },

    decidedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

approvalSchema.index(
  {
    targetType: 1,
    targetId: 1,
    targetRevision: 1,
    step: 1,
  },
  { unique: true }
);

module.exports = mongoose.model('Approval', approvalSchema);