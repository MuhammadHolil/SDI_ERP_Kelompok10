const mongoose = require('mongoose');

const allocationSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },

    expert: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expert',
      required: true,
    },

    projectRole: {
      type: String,
      required: true,
      trim: true,
    },

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
        message: 'Tanggal akhir tidak boleh sebelum tanggal mulai.',
      },
    },

    plannedHours: {
      type: Number,
      required: true,
      validate: {
        validator: (value) =>
          Number.isFinite(value) && value > 0,
        message: 'Rencana jam kerja harus lebih besar dari nol.',
      },
    },

    status: {
      type: String,
      enum: ['planned', 'active', 'completed', 'cancelled'],
      default: 'planned',
    },
  },
  {
    timestamps: true,
  }
);

allocationSchema.index(
  {
    project: 1,
    expert: 1,
    startDate: 1,
    endDate: 1,
  },
  { unique: true }
);

module.exports = mongoose.model('Allocation', allocationSchema);