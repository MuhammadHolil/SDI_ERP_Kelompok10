const mongoose = require('mongoose');
const Joi = require('joi');

const Project = mongoose.model('Project');
const Expert = mongoose.model('Expert');
const Admin = mongoose.model('Admin');
const Allocation = mongoose.model('Allocation');

const objectId = Joi.string()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .required();

const schema = Joi.object({
  project: objectId,
  expert: objectId,

  projectRole: Joi.string()
    .trim()
    .max(200)
    .required(),

  startDate: Joi.date().iso().required(),

  endDate: Joi.date()
    .iso()
    .min(Joi.ref('startDate'))
    .required(),

  plannedHours: Joi.number()
    .positive()
    .precision(2)
    .strict()
    .required(),
}).unknown(false);

module.exports = async function createAllocation(
  req,
  res
) {
  const { error, value } = schema.validate(req.body, {
    abortEarly: false,
  });

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Data alokasi belum sesuai.',
      details: error.details.map((item) => ({
        field: item.path.join('.'),
        code: item.type,
      })),
    });
  }

  const project = await Project.findOne({
    _id: value.project,
    manager: req.admin._id,
  }).lean();

  if (!project) {
    return res.status(404).json({
      success: false,
      result: null,
      message:
        'Proyek tidak ditemukan dalam cakupan akses Anda.',
    });
  }

  if (
    value.startDate < project.startDate ||
    value.endDate > project.endDate
  ) {
    return res.status(400).json({
      success: false,
      result: null,
      message:
        'Periode alokasi harus dalam periode proyek.',
    });
  }

  const expert = await Expert.findOne({
    _id: value.expert,
    active: true,
  }).lean();

  if (!expert) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Tenaga ahli aktif tidak ditemukan.',
    });
  }

  const user = await Admin.exists({
    _id: expert.user,
    enabled: true,
    removed: false,
    businessRoles: 'expert',
  });

  if (!user) {
    return res.status(400).json({
      success: false,
      result: null,
      message:
        'Akun tenaga ahli harus aktif dan memiliki peran expert.',
    });
  }

  const capacityPeriods = expert.capacityPeriods || [];

  const coveringPeriod = capacityPeriods.find(
    (period) =>
      value.startDate >= period.startDate &&
      value.endDate <= period.endDate
  );

  if (!coveringPeriod) {
    return res.status(409).json({
      success: false,
      result: null,
      message:
        'Kapasitas tenaga ahli belum tersedia untuk seluruh periode alokasi.',
    });
  }

  const existingAllocations = await Allocation.find({
    expert: expert._id,
    status: {
      $in: ['planned', 'active'],
    },
    startDate: {
      $gte: coveringPeriod.startDate,
    },
    endDate: {
      $lte: coveringPeriod.endDate,
    },
  })
    .select('plannedHours')
    .lean();

  const allocatedHours = existingAllocations.reduce(
    (total, allocation) =>
      total + allocation.plannedHours,
    0
  );

  const remainingHours =
    coveringPeriod.availableHours - allocatedHours;

  if (value.plannedHours > remainingHours) {
    return res.status(409).json({
      success: false,
      result: null,
      message:
        `Sisa kapasitas tenaga ahli hanya ${remainingHours} jam.`,
    });
  }

  try {
    const result = await Allocation.create({
      project: project._id,
      expert: expert._id,
      projectRole: value.projectRole,
      startDate: value.startDate,
      endDate: value.endDate,
      plannedHours: value.plannedHours,
      status: 'planned',
    });

    return res.status(201).json({
      success: true,
      result,
      capacity: {
        availableHours:
          coveringPeriod.availableHours,
        allocatedHoursBefore: allocatedHours,
        allocatedHoursAfter:
          allocatedHours + value.plannedHours,
        remainingHoursAfter:
          remainingHours - value.plannedHours,
      },
      message:
        'Alokasi tenaga ahli berhasil dibuat.',
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        result: null,
        message:
          'Alokasi tenaga ahli pada periode tersebut sudah tersedia.',
      });
    }

    throw err;
  }
};