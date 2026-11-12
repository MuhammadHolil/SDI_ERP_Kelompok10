const mongoose = require('mongoose');

const capacityPeriodSchema = new mongoose.Schema(
  {
    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          return this.startDate && value >= this.startDate;
        },
        message:
          'Tanggal akhir kapasitas tidak boleh sebelum tanggal mulai.',
      },
    },

    availableHours: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: false,
  }
);

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
      type: [capacityPeriodSchema],
      default: [],
    },

    capacityRevision: {
      type: Number,
      default: 0,
      min: 0,
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