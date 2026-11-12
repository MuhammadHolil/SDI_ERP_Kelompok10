const mongoose = require('mongoose');

const expertRateSchema = new mongoose.Schema(
  {
    expert: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expert',
      required: true,
    },

    hourlyCost: {
      type: Number,
      required: true,
      validate: {
        validator: (value) =>
          Number.isFinite(value) && value > 0,
        message: 'Tarif per jam harus lebih besar dari nol.',
      },
    },

    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
    },

    effectiveFrom: {
      type: Date,
      required: true,
    },

    effectiveTo: {
      type: Date,
      default: null,
      validate: {
        validator: function (value) {
          return (
            value === null ||
            (this.effectiveFrom &&
              value >= this.effectiveFrom)
          );
        },
        message:
          'Tanggal akhir berlaku tidak boleh sebelum tanggal mulai.',
      },
    },
  },
  {
    timestamps: true,
  }
);

expertRateSchema.index(
  { expert: 1, effectiveFrom: 1 },
  { unique: true }
);

module.exports = mongoose.model('ExpertRate', expertRateSchema);