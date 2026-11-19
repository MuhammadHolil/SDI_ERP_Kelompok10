const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  removed: {
    type: Boolean,
    default: false,
  },

  createdBy: { type: mongoose.Schema.ObjectId, ref: 'Admin', autopopulate: true, required: true },
  number: {
    type: Number,
    required: true,
  },
  client: {
    type: mongoose.Schema.ObjectId,
    ref: 'Client',
    autopopulate: true,
    required: true,
  },
  invoice: {
    type: mongoose.Schema.ObjectId,
    ref: 'Invoice',
    required: true,
    autopopulate: true,
  },
  date: {
    type: Date,
    default: Date.now,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: 'NA',
    uppercase: true,
    required: true,
  },
  paymentMode: {
    type: mongoose.Schema.ObjectId,
    ref: 'PaymentMode',
    autopopulate: true,
  },
  ref: {
    type: String,
  },
  description: {
    type: String,
  },
  updated: {
    type: Date,
    default: Date.now,
  },
  created: {
    type: Date,
    default: Date.now,
  },
});

paymentSchema.add({
  idempotencyKey: {
    type: String,
  },
});

paymentSchema.index(
  { idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      idempotencyKey: { $type: 'string' },
    },
  }
);

paymentSchema.add({
  isReversed: {
    type: Boolean,
    default: false,
  },
  reversal: {
    reason: {
      type: String,
      maxlength: 1500,
    },
    reference: {
      type: String,
      maxlength: 300,
    },
    reversedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
    },
    reversedAt: Date,
    invoiceCreditBefore: Number,
    invoiceCreditAfter: Number,
    ledgerBefore: Number,
    ledgerAfter: Number,
  },
});

paymentSchema.plugin(require('mongoose-autopopulate'));
module.exports = mongoose.model('Payment', paymentSchema);
