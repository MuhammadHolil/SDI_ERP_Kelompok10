const mongoose = require('mongoose');
const Joi = require('joi');

const Expert = mongoose.model('Expert');
const Allocation = mongoose.model('Allocation');

const objectIdPattern = /^[a-fA-F0-9]{24}$/;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

const capacityPeriodSchema = Joi.object({
  startDate: Joi.string()
    .pattern(dateOnlyPattern)
    .required(),

  endDate: Joi.string()
    .pattern(dateOnlyPattern)
    .required(),

  availableHours: Joi.number()
    .min(0)
    .precision(2)
    .strict()
    .required(),
}).unknown(false);

const updateSchema = Joi.object({
  expectedRevision: Joi.number()
    .integer()
    .min(0)
    .strict()
    .required(),

  capacityPeriods: Joi.array()
    .items(capacityPeriodSchema)
    .min(1)
    .max(100)
    .required(),
}).unknown(false);

function parseDateOnly(value) {
  if (
    typeof value !== 'string' ||
    !dateOnlyPattern.test(value)
  ) {
    return null;
  }

  const result = new Date(`${value}T00:00:00.000Z`);

  if (
    Number.isNaN(result.getTime()) ||
    result.toISOString().slice(0, 10) !== value
  ) {
    return null;
  }

  return result;
}

function toDateOnly(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function prepareCapacityPeriods(inputPeriods) {
  const periods = inputPeriods.map((item) => ({
    startDate: parseDateOnly(item.startDate),
    endDate: parseDateOnly(item.endDate),
    availableHours: item.availableHours,
  }));

  if (
    periods.some(
      (item) =>
        !item.startDate ||
        !item.endDate ||
        item.endDate < item.startDate
    )
  ) {
    return {
      error:
        'Tanggal periode kapasitas tidak valid atau tanggal akhir sebelum tanggal mulai.',
    };
  }

  periods.sort(
    (first, second) =>
      first.startDate.getTime() -
      second.startDate.getTime()
  );

  for (let index = 1; index < periods.length; index += 1) {
    const previous = periods[index - 1];
    const current = periods[index];

    if (current.startDate <= previous.endDate) {
      return {
        error:
          'Periode kapasitas tenaga ahli tidak boleh bertumpuk.',
      };
    }
  }

  return { periods };
}

function findCoveringPeriod(periods, allocation) {
  return periods.findIndex(
    (period) =>
      allocation.startDate >= period.startDate &&
      allocation.endDate <= period.endDate
  );
}

async function calculateUsage(expertId, periods) {
  const allocations = await Allocation.find({
    expert: expertId,
    status: {
      $in: ['planned', 'active'],
    },
  })
    .select('startDate endDate plannedHours')
    .lean();

  const usage = periods.map(() => 0);
  let uncoveredAllocationHours = 0;

  for (const allocation of allocations) {
    const periodIndex = findCoveringPeriod(
      periods,
      allocation
    );

    if (periodIndex === -1) {
      uncoveredAllocationHours += allocation.plannedHours;
      continue;
    }

    usage[periodIndex] += allocation.plannedHours;
  }

  return {
    allocations,
    usage,
    uncoveredAllocationHours,
  };
}

exports.read = async function readExpertCapacity(req, res) {
  if (!objectIdPattern.test(req.params.id)) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID tenaga ahli tidak valid.',
    });
  }

  const expert = await Expert.findOne({
    _id: req.params.id,
    active: true,
  })
    .select(
      '_id code name capacityPeriods capacityRevision active'
    )
    .lean();

  if (!expert) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Tenaga ahli aktif tidak ditemukan.',
    });
  }

  const periods = expert.capacityPeriods || [];

  const {
    usage,
    uncoveredAllocationHours,
  } = await calculateUsage(expert._id, periods);

  const capacityPeriods = periods.map((period, index) => {
    const allocatedHours = usage[index] || 0;

    return {
      startDate: toDateOnly(period.startDate),
      endDate: toDateOnly(period.endDate),
      availableHours: period.availableHours,
      allocatedHours,
      remainingHours:
        period.availableHours - allocatedHours,
    };
  });

  return res.status(200).json({
    success: true,
    result: {
      _id: expert._id,
      code: expert.code,
      name: expert.name,
      capacityRevision: expert.capacityRevision || 0,
      capacityPeriods,
      uncoveredAllocationHours,
    },
    message: 'Kapasitas tenaga ahli berhasil dibaca.',
  });
};

exports.update = async function updateExpertCapacity(
  req,
  res
) {
  if (!objectIdPattern.test(req.params.id)) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID tenaga ahli tidak valid.',
    });
  }

  const { error, value } = updateSchema.validate(
    req.body,
    {
      abortEarly: false,
    }
  );

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Data kapasitas belum sesuai.',
      details: error.details.map((item) => ({
        field: item.path.join('.'),
        code: item.type,
      })),
    });
  }

  const prepared = prepareCapacityPeriods(
    value.capacityPeriods
  );

  if (prepared.error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: prepared.error,
    });
  }

  const expert = await Expert.findOne({
    _id: req.params.id,
    active: true,
  })
    .select('_id capacityRevision')
    .lean();

  if (!expert) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Tenaga ahli aktif tidak ditemukan.',
    });
  }

  const currentRevision = expert.capacityRevision || 0;

  if (currentRevision !== value.expectedRevision) {
    return res.status(409).json({
      success: false,
      result: null,
      message:
        'Revisi kapasitas telah berubah. Muat ulang data sebelum mengubah.',
    });
  }

  const {
    allocations,
    usage,
  } = await calculateUsage(
    expert._id,
    prepared.periods
  );

  for (const allocation of allocations) {
    const periodIndex = findCoveringPeriod(
      prepared.periods,
      allocation
    );

    if (periodIndex === -1) {
      return res.status(409).json({
        success: false,
        result: null,
        message:
          'Periode kapasitas baru tidak mencakup seluruh alokasi berjalan.',
      });
    }
  }

  for (
    let index = 0;
    index < prepared.periods.length;
    index += 1
  ) {
    if (
      usage[index] >
      prepared.periods[index].availableHours
    ) {
      return res.status(409).json({
        success: false,
        result: null,
        message:
          'Kapasitas baru lebih kecil daripada jam yang sudah dialokasikan.',
      });
    }
  }

  const revisionFilter =
    currentRevision === 0
      ? {
          $or: [
            { capacityRevision: 0 },
            { capacityRevision: { $exists: false } },
          ],
        }
      : { 
          capacityRevision: currentRevision,
        };

  const updated = await Expert.findOneAndUpdate( 
    {
     _id: expert._id,
     ...revisionFilter, 
    },
    {
      $set: {
        capacityPeriods: prepared.periods,
      },
      $inc: {
        capacityRevision: 1,
      },
    },
    {
      new: true,
      runValidators: true,
    }
  )
    .select(
      '_id code name capacityPeriods capacityRevision active'
    )
    .lean();

  if (!updated) {
    return res.status(409).json({
      success: false,
      result: null,
      message:
        'Revisi kapasitas telah berubah. Muat ulang data sebelum mengubah.',
    });
  }

  const updatedUsage = await calculateUsage(
    updated._id,
    updated.capacityPeriods
  );

  const capacityPeriods = updated.capacityPeriods.map(
    (period, index) => {
      const allocatedHours =
        updatedUsage.usage[index] || 0;

      return {
        startDate: toDateOnly(period.startDate),
        endDate: toDateOnly(period.endDate),
        availableHours: period.availableHours,
        allocatedHours,
        remainingHours:
          period.availableHours - allocatedHours,
      };
    }
  );

  return res.status(200).json({
    success: true,
    result: {
      _id: updated._id,
      code: updated.code,
      name: updated.name,
      capacityRevision: updated.capacityRevision,
      capacityPeriods,
      uncoveredAllocationHours:
        updatedUsage.uncoveredAllocationHours,
    },
    message: 'Kapasitas tenaga ahli berhasil disimpan.',
  });
};