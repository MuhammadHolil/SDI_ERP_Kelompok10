const mongoose = require('mongoose');

const { Schema } = mongoose;

const changeRequestSchema = new Schema(
  {
    project: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    type: {
      type: String,
      enum: ['budget', 'scope'],
      required: true,
    },
    reason: {
      type: String,
      required: true,
      maxlength: 1500,
    },
    impact: {
      type: String,
      required: true,
      maxlength: 1500,
    },
    reference: {
      type: String,
      required: true,
      maxlength: 300,
    },
    before: {
      type: Schema.Types.Mixed,
      required: true,
    },
    proposed: {
      type: Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ['submitted', 'approved', 'rejected'],
      default: 'submitted',
      required: true,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },
    decidedBy: {
      type: Schema.Types.ObjectId,
      ref: 'Admin',
      default: null,
    },
    decisionNotes: {
      type: String,
      default: '',
      maxlength: 1500,
    },
    decidedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

changeRequestSchema.index(
  { project: 1, type: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'submitted' },
  }
);

module.exports = mongoose.model(
  'ChangeRequest',
  changeRequestSchema
);