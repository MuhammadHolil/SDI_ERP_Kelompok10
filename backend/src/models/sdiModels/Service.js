const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 50,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    unit: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    active: {
      type: Boolean,
      required: true,
      default: true,
    },
  },
  { timestamps: true }
);

serviceSchema.index({ code: 1 }, { unique: true });

module.exports = mongoose.model('Service', serviceSchema);