const mongoose = require('mongoose');

const { Schema } = mongoose;

const contractSchema = new Schema({
  code: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },

  quote: {
    type: Schema.Types.ObjectId,
    ref: 'Quote',
    required: true,
  },

  client: {
    type: Schema.Types.ObjectId,
    ref: 'Client',
    required: true,
  },

  scope: {
    type: String,
    required: true,
    trim: true,
  },

  contractValue: {
    type: Number,
    required: true,
    validate: {
      validator: (value) => Number.isFinite(value) && value > 0,
      message: 'Nilai kontrak harus lebih dari nol.',
    },
  },

  currency: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },

  billingTerms: {
    type: [Schema.Types.Mixed],
    default: [],
  },

  revisions: {
    type: [Schema.Types.Mixed],
    default: [],
  },

  currentVersion: {
    type: Number,
    default: 1,
    min: 1,
    validate: {
      validator: Number.isInteger,
      message: 'Versi kontrak harus berupa bilangan bulat.',
    },
  },

  status: {
    type: String,
    required: true,
    default: 'draft',
  },
});

module.exports = mongoose.model('Contract', contractSchema);