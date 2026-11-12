const mongoose = require('mongoose');

const { Schema } = mongoose;

const projectSchema = new Schema({
  code: {
    type: String,
    required: true,
    trim: true,
    unique: true,
  },

  name: {
    type: String,
    required: true,
    trim: true,
  },

  contract: {
    type: Schema.Types.ObjectId,
    ref: 'Contract',
    required: true,
  },

  manager: {
    type: Schema.Types.ObjectId,
    ref: 'Admin',
    required: true,
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
        return !this.startDate || value >= this.startDate;
      },
      message: 'Tanggal selesai tidak boleh sebelum tanggal mulai.',
    },
  },

  status: {
    type: String,
    required: true,
    default: 'planned',
  },
});

module.exports = mongoose.model('Project', projectSchema);