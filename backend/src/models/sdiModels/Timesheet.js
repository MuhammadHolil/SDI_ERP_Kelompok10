const mongoose = require('mongoose');

const timesheetSchema = new mongoose.Schema(
  {
    allocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Allocation',
      required: true,
    },

    rate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExpertRate',
      required: true,
    },

    activity: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    startedAt: {
      type: Date,
      required: true,
    },

    endedAt: {
      type: Date,
      required: true,
      validate: {
        validator: function (value) {
          return this.startedAt && value > this.startedAt;
        },
        message: 'Waktu selesai harus setelah waktu mulai.',
      },
    },

    breakMinutes: {
      type: Number,
      required: true,
      default: 0,
      validate: {
        validator: (value) =>
          Number.isInteger(value) && value >= 0,
        message: 'Waktu istirahat harus berupa menit bulat, minimal nol.',
      },
    },

    workHours: {
      type: Number,
      required: true,
      validate: {
        validator: (value) =>
          Number.isFinite(value) && value > 0,
        message: 'Jam kerja bersih harus lebih besar dari nol.',
      },
    },

    hourlyCostSnapshot: {
      type: Number,
      required: true,
      validate: {
        validator: (value) =>
          Number.isFinite(value) && value > 0,
        message: 'Tarif biaya harus lebih besar dari nol.',
      },
    },

    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
    },

    revision: {
      type: Number,
      default: 1,
      required: true,
      validate: {
        validator: (value) =>
          Number.isInteger(value) && value >= 1,
        message: 'Revisi harus berupa bilangan bulat minimal satu.',
      },
    },

    approvalStatus: {
      type: String,
      enum: ['draft', 'submitted', 'approved', 'rejected'],
      default: 'draft',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

timesheetSchema.index({
  allocation: 1,
  startedAt: 1,
  endedAt: 1,
});

module.exports = mongoose.model('Timesheet', timesheetSchema);