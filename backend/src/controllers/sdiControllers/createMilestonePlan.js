const mongoose = require('mongoose');
const Joi = require('joi');
const currency = require('currency.js');

const schema = Joi.object({
  project: Joi.string().lowercase().hex().length(24).required(),

  milestones: Joi.array()
    .items(
      Joi.object({
        code: Joi.string().trim().max(50).required(),
        name: Joi.string().trim().max(200).required(),
        dueDate: Joi.date().iso().required(),

        progressWeight: Joi.number()
          .greater(0)
          .max(100)
          .precision(2)
          .strict()
          .required(),

        billingTermCode: Joi.string().trim().max(30).required(),

        billingAmount: Joi.number()
          .positive()
          .precision(2)
          .strict()
          .required(),
      })
    )
    .min(1)
    .max(100)
    .unique('code')
    .required(),
});

module.exports = async function createMilestonePlan(req, res) {
  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Data rencana milestone belum sesuai.',
      details: error.details.map((item) => ({
        field: item.path.join('.'),
        code: item.type,
      })),
    });
  }

  const weightTotal = value.milestones.reduce(
    (sum, item) => sum + Math.round(item.progressWeight * 100),
    0
  );

  if (weightTotal !== 10000) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Total bobot milestone harus 100%.',
    });
  }

  const Project = mongoose.model('Project');
  const Contract = mongoose.model('Contract');
  const Milestone = mongoose.model('Milestone');

  const reject = (statusCode, message) => {
    throw Object.assign(new Error(message), { statusCode });
  };

  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      // Penulisan pada proyek menyerialkan pembuatan rencana.
      // __v adalah field versi bawaan Mongoose.
      const project = await Project.findOneAndUpdate(
        {
          _id: value.project,
          manager: req.admin._id,
        },
        { $inc: { __v: 1 } },
        { new: true, session }
      ).lean();

      if (!project) {
        reject(404, 'Proyek tidak ditemukan dalam cakupan akses Anda.');
      }

      const existing = await Milestone.exists({
        project: project._id,
      }).session(session);

      if (existing) {
        reject(409, 'Rencana milestone proyek sudah tersedia.');
      }

      const contract = await Contract.findById(project.contract)
        .session(session)
        .lean();

      if (!contract || contract.status !== 'agreed') {
        reject(409, 'Kontrak proyek harus sudah disepakati.');
      }

      const terms = new Map();

      for (const term of contract.billingTerms || []) {
        const amount = currency(term.amount);

        if (
          !term.code ||
          terms.has(term.code) ||
          !Number.isSafeInteger(amount.intValue) ||
          amount.intValue <= 0
        ) {
          reject(409, 'Termin kontrak belum valid.');
        }

        terms.set(term.code, amount.intValue);
      }

      if (terms.size === 0) {
        reject(409, 'Kontrak belum memiliki termin pembayaran.');
      }

      const allocations = new Map();
      const documents = [];

      for (const item of value.milestones) {
        if (
          item.dueDate < project.startDate ||
          item.dueDate > project.endDate
        ) {
          reject(400, 'Tanggal milestone harus dalam periode proyek.');
        }

        if (!terms.has(item.billingTermCode)) {
          reject(400, 'Termin milestone tidak tersedia dalam kontrak.');
        }

        const amount = currency(item.billingAmount);

        if (
          !Number.isSafeInteger(amount.intValue) ||
          amount.intValue <= 0
        ) {
          reject(400, 'Nilai penagihan milestone tidak valid.');
        }

        const allocated =
          (allocations.get(item.billingTermCode) || 0) +
          amount.intValue;

        if (!Number.isSafeInteger(allocated)) {
          reject(400, 'Alokasi penagihan melampaui batas perhitungan.');
        }

        allocations.set(item.billingTermCode, allocated);

        documents.push({
          project: project._id,
          code: item.code,
          name: item.name,
          dueDate: item.dueDate,
          progressWeight: item.progressWeight,
          billingTermCode: item.billingTermCode,
          billingAmount: amount.value,
          status: 'planned',
          approvalStatus: 'draft',
          evidence: [],
        });
      }

      for (const [code, amount] of terms) {
        if (allocations.get(code) !== amount) {
          reject(400, 'Alokasi milestone harus sesuai setiap termin kontrak.');
        }
      }

      const totalTerms = [...terms.values()].reduce(
        (sum, amount) => sum + amount,
        0
      );

      if (
        !Number.isSafeInteger(totalTerms) ||
        totalTerms !== currency(contract.contractValue).intValue
      ) {
        reject(409, 'Total termin tidak sesuai nilai kontrak.');
      }

      result = await Milestone.create(documents, { session });
    });

    return res.status(201).json({
      success: true,
      result,
      message: 'Rencana milestone berhasil dibuat.',
    });
  } catch (err) {
    if (err.statusCode || err.code === 11000) {
      return res.status(err.statusCode || 409).json({
        success: false,
        result: null,
        message: err.code === 11000
          ? 'Kode milestone proyek sudah digunakan.'
          : err.message,
      });
    }

    throw err;
  } finally {
    await session.endSession();
  }
};