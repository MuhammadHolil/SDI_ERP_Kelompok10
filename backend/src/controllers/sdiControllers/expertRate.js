const mongoose = require('mongoose');
const Joi = require('joi');

const Expert = mongoose.model('Expert');
const ExpertRate = mongoose.model('ExpertRate');

const createSchema = Joi.object({
  expert: Joi.string()
    .pattern(/^[a-fA-F0-9]{24}$/)
    .required(),

  hourlyCost: Joi.number()
    .positive()
    .precision(2)
    .strict()
    .required(),

  currency: Joi.string()
    .trim()
    .uppercase()
    .pattern(/^[A-Z]{3}$/)
    .required(),

  effectiveFrom: Joi.date().iso().required(),

  effectiveTo: Joi.date()
    .iso()
    .min(Joi.ref('effectiveFrom'))
    .allow(null)
    .default(null),
}).unknown(false);

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

exports.create = async (req, res) => {
  const { error, value } = createSchema.validate(req.body, {
    abortEarly: false,
  });

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Data tarif tenaga ahli belum sesuai.',
      details: error.details.map((item) => ({
        field: item.path.join('.'),
        code: item.type,
      })),
    });
  }

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      // Menyelaraskan permintaan tarif untuk tenaga ahli yang sama.
      const expert = await Expert.findOneAndUpdate(
        {
          _id: value.expert,
          active: true,
        },
        {
          $inc: { __v: 1 },
        },
        {
          new: true,
          session,
        }
      ).lean();

      if (!expert) {
        fail(404, 'Tenaga ahli aktif tidak ditemukan.');
      }

      const overlapFilter = {
        expert: expert._id,
        $or: [
          { effectiveTo: null },
          { effectiveTo: { $gte: value.effectiveFrom } },
        ],
      };

      if (value.effectiveTo !== null) {
        overlapFilter.effectiveFrom = {
          $lte: value.effectiveTo,
        };
      }

      const overlappingRate = await ExpertRate.exists(
        overlapFilter
      ).session(session);

      if (overlappingRate) {
        fail(
          409,
          'Periode tarif bertumpuk dengan tarif yang sudah ada.'
        );
      }

      const rates = await ExpertRate.create(
        [
          {
            expert: expert._id,
            hourlyCost: value.hourlyCost,
            currency: value.currency,
            effectiveFrom: value.effectiveFrom,
            effectiveTo: value.effectiveTo,
          },
        ],
        { session }
      );

      result = rates[0];
    });

    return res.status(201).json({
      success: true,
      result,
      message: 'Tarif tenaga ahli berhasil ditambahkan.',
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        result: null,
        message: 'Tarif pada tanggal mulai tersebut sudah tersedia.',
      });
    }

    if ([400, 404, 409].includes(err.status)) {
      return res.status(err.status).json({
        success: false,
        result: null,
        message: err.message,
      });
    }

    throw err;
  } finally {
    await session.endSession();
  }
};

exports.list = async (req, res) => {
  const schema = Joi.object({
    expert: Joi.string()
      .pattern(/^[a-fA-F0-9]{24}$/)
      .required(),
  }).unknown(false);

  const { error, value } = schema.validate(req.query);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Parameter expert wajib berupa ID yang valid.',
    });
  }

  const expert = await Expert.exists({
    _id: value.expert,
    active: true,
  });

  if (!expert) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Tenaga ahli aktif tidak ditemukan.',
    });
  }

  const result = await ExpertRate.find({
    expert: value.expert,
  })
    .sort({ effectiveFrom: -1 })
    .lean();

  return res.status(200).json({
    success: true,
    result,
    message: 'Daftar tarif berhasil dibaca.',
  });
};