const mongoose = require('mongoose');
const Joi = require('joi');
const currency = require('currency.js');

const Project = mongoose.model('Project');
const Contract = mongoose.model('Contract');
const Allocation = mongoose.model('Allocation');
const Timesheet = mongoose.model('Timesheet');

const idSchema = Joi.string()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .required();

module.exports = async function projectLaborCost(req, res) {
  const { error, value } = idSchema.validate(req.params.id);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID proyek tidak valid.',
    });
  }

  const project = await Project.findOne({
    _id: value,
    manager: req.admin._id,
  }).lean();

  if (!project) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Proyek tidak ditemukan dalam cakupan akses Anda.',
    });
  }

  const contract = await Contract.findById(project.contract)
    .select('currency')
    .lean();

  if (!contract || !contract.currency) {
    return res.status(409).json({
      success: false,
      result: null,
      message: 'Mata uang kontrak proyek tidak tersedia.',
    });
  }

  const allocationIds = await Allocation.distinct('_id', {
    project: project._id,
  });

  const timesheets = await Timesheet.find({
    allocation: { $in: allocationIds },
    approvalStatus: 'approved',
  })
    .select(
      '_id allocation activity workHours hourlyCostSnapshot currency'
    )
    .sort({ _id: 1 })
    .lean();

  const details = [];
  let totalCostMinor = 0;
  let approvedHours = 0;

  for (const timesheet of timesheets) {
    if (
      !Number.isFinite(timesheet.workHours) ||
      timesheet.workHours <= 0 ||
      !Number.isFinite(timesheet.hourlyCostSnapshot) ||
      timesheet.hourlyCostSnapshot <= 0
    ) {
      return res.status(409).json({
        success: false,
        result: null,
        message: 'Terdapat timesheet approved dengan jam atau tarif tidak valid.',
      });
    }

    if (timesheet.currency !== contract.currency) {
      return res.status(409).json({
        success: false,
        result: null,
        message:
          'Mata uang timesheet berbeda dari kontrak. Konversi mata uang belum diterapkan.',
      });
    }

    const amount = currency(timesheet.hourlyCostSnapshot, {
      precision: 2,
    }).multiply(timesheet.workHours);

    if (
      !Number.isSafeInteger(amount.intValue) ||
      !Number.isSafeInteger(totalCostMinor + amount.intValue)
    ) {
      return res.status(409).json({
        success: false,
        result: null,
        message: 'Nilai biaya melebihi batas perhitungan yang didukung.',
      });
    }

    totalCostMinor += amount.intValue;
    approvedHours += timesheet.workHours;

    details.push({
      timesheet: timesheet._id,
      allocation: timesheet.allocation,
      activity: timesheet.activity,
      workHours: timesheet.workHours,
      hourlyCostSnapshot: timesheet.hourlyCostSnapshot,
      amount: amount.value,
    });
  }

  return res.status(200).json({
    success: true,
    result: {
      project: project._id,
      projectCode: project.code,
      currency: contract.currency,
      timesheetCount: timesheets.length,
      approvedHours: Number(approvedHours.toFixed(8)),
      totalCost: currency(totalCostMinor, {
        fromCents: true,
        precision: 2,
      }).value,
      details,
    },
    message: 'Biaya tenaga ahli approved berhasil dihitung.',
  });
};