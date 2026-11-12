const mongoose = require('mongoose');

const { Schema } = mongoose;

const budgetLineSchema = new Schema({
  category: {
    type: Schema.Types.ObjectId,
    ref: 'CostCategory',
    required: true,
  },

  description: {
    type: String,
    required: true,
    trim: true,
  },

  quantity: {
    type: Number,
    required: true,
    validate: {
      validator: (value) => Number.isFinite(value) && value > 0,
      message: 'Jumlah harus lebih dari nol.',
    },
  },

  unit: {
    type: String,
    required: true,
    trim: true,
  },

  unitCost: {
    type: Number,
    required: true,
    validate: {
      validator: (value) => Number.isFinite(value) && value >= 0,
      message: 'Biaya satuan tidak boleh negatif.',
    },
  },

  amount: {
    type: Number,
    required: true,
    min: 0,
  },
});

const projectBudgetSchema = new Schema({
  project: {
    type: Schema.Types.ObjectId,
    ref: 'Project',
    required: true,
  },

  changeRequest: {
    type: Schema.Types.ObjectId,
    ref: 'ChangeRequest',
    default: null,
  },

  version: {
    type: Number,
    required: true,
    default: 1,
    min: 1,
    validate: {
      validator: Number.isInteger,
      message: 'Versi harus berupa bilangan bulat.',
    },
  },

  total: {
    type: Number,
    required: true,
    min: 0,
  },

  currency: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
  },

  approvalStatus: {
    type: String,
    required: true,
    default: 'draft',
  },

  isCurrent: {
    type: Boolean,
    default: false,
  },

  lines: {
    type: [budgetLineSchema],
    required: true,
    validate: {
      validator: (value) => value.length > 0,
      message: 'Anggaran harus memiliki rincian biaya.',
    },
  },
});

projectBudgetSchema.index(
  { project: 1, version: 1 },
  { unique: true }
);

projectBudgetSchema.index(
  { project: 1 },
  { unique: true, partialFilterExpression: { isCurrent: true } }
);

module.exports = mongoose.model('ProjectBudget', projectBudgetSchema);