const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema(
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

    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
      maxlength: 254,
    },

    active: {
      type: Boolean,
      default: true,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

vendorSchema.index({ code: 1 }, { unique: true });

module.exports = mongoose.model('Vendor', vendorSchema);