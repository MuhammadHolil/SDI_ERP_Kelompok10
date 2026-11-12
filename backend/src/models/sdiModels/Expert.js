const mongoose = require('mongoose');

const expertSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },

    skills: {
      type: [String],
      default: [],
    },

    capacityPeriods: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

expertSchema.index({ code: 1 }, { unique: true });
expertSchema.index({ user: 1 }, { unique: true });

module.exports = mongoose.model('Expert', expertSchema);