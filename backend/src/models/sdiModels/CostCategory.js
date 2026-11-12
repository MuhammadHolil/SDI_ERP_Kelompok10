const mongoose = require('mongoose');

const costCategorySchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    unique: true,
  },

  name: {
    type: String,
    required: true,
    trim: true,
  },

  active: {
    type: Boolean,
    default: true,
  },
});

module.exports = mongoose.model('CostCategory', costCategorySchema);