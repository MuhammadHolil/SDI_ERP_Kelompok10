const mongoose = require('mongoose');
const Joi = require('joi');

const Expert = mongoose.model('Expert');
const Allocation = mongoose.model('Allocation');
const Timesheet = mongoose.model('Timesheet');

const idSchema = Joi.string()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .required();

const bodySchema = Joi.object({}).unknown(false);

module.exports = async function submitTimesheet(req, res) {
  const idValidation = idSchema.validate(req.params.id);
  const bodyValidation = bodySchema.validate(req.body || {});

  if (idValidation.error || bodyValidation.error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID timesheet tidak valid atau isi permintaan tidak sesuai.',
    });
  }

  const expertIds = await Expert.distinct('_id', {
    user: req.admin._id,
    active: true,
  });

  const allocationIds = await Allocation.distinct('_id', {
    expert: { $in: expertIds },
  });

  const timesheet = await Timesheet.findOne({
    _id: idValidation.value,
    allocation: { $in: allocationIds },
  }).lean();

  if (!timesheet) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Timesheet tidak ditemukan dalam cakupan akses Anda.',
    });
  }

  const allocation = await Allocation.findById(
    timesheet.allocation
  ).lean();

  if (
    !allocation ||
    !['planned', 'active'].includes(allocation.status)
  ) {
    return res.status(409).json({
      success: false,
      result: null,
      message: 'Status alokasi tidak mengizinkan pengajuan timesheet.',
    });
  }

  const result = await Timesheet.findOneAndUpdate(
    {
      _id: timesheet._id,
      allocation: { $in: allocationIds },
      approvalStatus: 'draft',
    },
    {
      $set: {
        approvalStatus: 'submitted',
      },
    },
    {
      new: true,
      runValidators: true,
    }
  );

  if (!result) {
    return res.status(409).json({
      success: false,
      result: null,
      message: 'Hanya timesheet draft yang dapat diajukan.',
    });
  }

  return res.status(200).json({
    success: true,
    result,
    message: 'Timesheet berhasil diajukan.',
  });
};