const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CostCategory',
      required: true,
    },

    vendor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
      immutable: true,
    },

    transactionDate: {
      type: Date,
      required: true,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },

    amount: {
      type: Number,
      required: true,
      validate: {
        validator: (value) =>
          Number.isFinite(value) && value > 0,
        message: 'Nominal pengeluaran harus lebih besar dari nol.',
      },
    },

    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      match: /^[A-Z]{3}$/,
    },

    evidence: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },

    revision: {
      type: Number,
      required: true,
      default: 1,
      validate: {
        validator: (value) =>
          Number.isInteger(value) && value >= 1,
        message: 'Revisi harus berupa bilangan bulat minimal satu.',
      },
    },

    approvalStatus: {
      type: String,
      enum: ['draft', 'submitted', 'approved', 'rejected'],
      required: true,
      default: 'draft',
    },
  },
  {
    timestamps: true,
  }
);

expenseSchema.index({
  project: 1,
  approvalStatus: 1,
  transactionDate: -1,
});

expenseSchema.index({
  createdBy: 1,
  transactionDate: -1,
});

module.exports = mongoose.model('Expense', expenseSchema);