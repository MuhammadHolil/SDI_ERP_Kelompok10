const mongoose = require('mongoose');

const projectAccessSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },

    teamMembers: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Admin',
        },
      ],
      default: [],
    },

    expenseApprovers: {
      type: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Admin',
        },
      ],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

projectAccessSchema.index(
  { project: 1 },
  { unique: true }
);

module.exports = mongoose.model(
  'ProjectAccess',
  projectAccessSchema
);