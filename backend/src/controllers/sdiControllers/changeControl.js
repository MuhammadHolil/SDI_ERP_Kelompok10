const mongoose = require('mongoose');
const Joi = require('joi');
const currency = require('currency.js');

const objectId = Joi.string().hex().length(24).required();

const lineSchema = Joi.object({
  category: objectId,
  description: Joi.string().trim().max(500).required(),
  quantity: Joi.number()
    .positive().precision(3).strict().required(),
  unit: Joi.string().trim().max(50).required(),
  unitCost: Joi.number()
    .min(0).precision(2).strict().required(),
}).unknown(false);

const submitSchema = Joi.object({
  type: Joi.string().valid('budget', 'scope').required(),
  reason: Joi.string().trim().min(1).max(1500).required(),
  impact: Joi.string().trim().min(1).max(1500).required(),
  reference: Joi.string().trim().min(1).max(300).required(),

  lines: Joi.when('type', {
    is: 'budget',
    then: Joi.array().items(lineSchema).min(1).max(200).required(),
    otherwise: Joi.forbidden(),
  }),

  scope: Joi.when('type', {
    is: 'scope',
    then: Joi.string().trim().min(10).max(5000).required(),
    otherwise: Joi.forbidden(),
  }),
}).unknown(false);

const reviewSchema = Joi.object({
  decision: Joi.string()
    .valid('approved', 'rejected').required(),
  notes: Joi.string().trim().min(1).max(1500).required(),
}).unknown(false);

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

const validId = (id) =>
  typeof id === 'string' && /^[a-fA-F0-9]{24}$/.test(id);

const isManagement = (admin) =>
  admin.businessRoles?.includes('management');

const scopeFilter = (admin) =>
  isManagement(admin) ? {} : { manager: admin._id };

function handleError(err, res) {
  if (err.code === 11000) {
    return res.status(409).json({
      success: false,
      result: null,
      message:
        'Pengajuan sejenis masih menunggu keputusan atau versi anggaran sudah berubah.',
    });
  }

  if ([400, 403, 404, 409].includes(err.status)) {
    return res.status(err.status).json({
      success: false,
      result: null,
      message: err.message,
    });
  }

  throw err;
}

async function calculateBudget(lines, session) {
  const { error, value } = Joi.array()
    .items(lineSchema)
    .min(1)
    .max(200)
    .required()
    .validate(lines);

  if (error) fail(400, 'Rincian anggaran belum valid.');

  const ids = [
    ...new Set(value.map((line) => line.category.toLowerCase())),
  ];

  const count = await mongoose.model('CostCategory')
    .countDocuments({
      _id: { $in: ids },
      active: true,
    })
    .session(session);

  if (count !== ids.length) {
    fail(400, 'Kategori anggaran harus tersedia dan aktif.');
  }

  let total = currency(0);

  const calculatedLines = value.map((line) => {
    const amount = currency(line.unitCost).multiply(line.quantity);
    total = total.add(amount);

    if (
      !Number.isSafeInteger(amount.intValue) ||
      !Number.isSafeInteger(total.intValue)
    ) {
      fail(400, 'Nominal anggaran melebihi batas perhitungan.');
    }

    return { ...line, amount: amount.value };
  });

  if (total.value <= 0) {
    fail(400, 'Total anggaran harus lebih dari nol.');
  }

  return {
    lines: calculatedLines,
    total: total.value,
  };
}

exports.read = async function read(req, res) {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: 'ID proyek tidak valid.',
    });
  }

  const project = await mongoose.model('Project')
    .findOne({
      _id: req.params.id,
      ...scopeFilter(req.admin),
    })
    .lean();

  if (!project) {
    return res.status(404).json({
      success: false,
      message: 'Proyek tidak ditemukan dalam cakupan akses Anda.',
    });
  }

  const contract = await mongoose.model('Contract')
    .findById(project.contract)
    .select('code scope currentVersion currency contractValue')
    .lean();

  const budget = await mongoose.model('ProjectBudget')
    .findOne({
      project: project._id,
      isCurrent: true,
      approvalStatus: 'established',
    })
    .lean();

  const categories = await mongoose.model('CostCategory')
    .find({ active: true })
    .select('code name')
    .sort({ code: 1 })
    .lean();

  const requests = await mongoose.model('ChangeRequest')
    .find({ project: project._id })
    .populate('requestedBy', 'name')
    .populate('decidedBy', 'name')
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  return res.status(200).json({
    success: true,
    result: { project, contract, budget, categories, requests },
  });
};

exports.submit = async function submit(req, res) {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: 'ID proyek tidak valid.',
    });
  }

  const validation = submitSchema.validate(req.body);

  if (validation.error) {
    return res.status(400).json({
      success: false,
      message: 'Isian pengajuan belum lengkap atau tidak valid.',
    });
  }

  const value = validation.value;
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const Project = mongoose.model('Project');
      const Contract = mongoose.model('Contract');
      const Budget = mongoose.model('ProjectBudget');

      const project = await Project.findOne({
        _id: req.params.id,
        manager: req.admin._id,
      }).session(session).lean();

      if (!project) {
        fail(404, 'Proyek tidak ditemukan dalam cakupan akses Anda.');
      }

      const contract = await Contract.findById(project.contract)
        .session(session).lean();

      if (!contract || contract.status !== 'agreed') {
        fail(409, 'Kontrak harus sudah agreed.');
      }

      let before;
      let proposed;

      if (value.type === 'budget') {
        const budget = await Budget.findOne({
          project: project._id,
          isCurrent: true,
          approvalStatus: 'established',
        }).session(session).lean();

        if (!budget) fail(409, 'Anggaran berlaku belum tersedia.');

        if (budget.currency !== contract.currency) {
          fail(409, 'Mata uang anggaran berbeda dari kontrak.');
        }

        proposed = {
          ...(await calculateBudget(value.lines, session)),
          currency: budget.currency,
        };

        before = {
          budgetId: budget._id,
          version: budget.version,
          total: budget.total,
          currency: budget.currency,
          lines: budget.lines,
        };
      } else {
        const projectCount = await Project.countDocuments({
          contract: contract._id,
        }).session(session);

        if (projectCount !== 1) {
          fail(
            409,
            'Perubahan lingkup untuk kontrak lintas proyek belum didukung.'
          );
        }

        if (value.scope === contract.scope) {
          fail(400, 'Lingkup usulan sama dengan lingkup berlaku.');
        }

        before = {
          contractId: contract._id,
          version: contract.currentVersion,
          scope: contract.scope,
        };

        proposed = { scope: value.scope };
      }

      [result] = await mongoose.model('ChangeRequest').create(
        [{
          project: project._id,
          type: value.type,
          reason: value.reason,
          impact: value.impact,
          reference: value.reference,
          before,
          proposed,
          status: 'submitted',
          requestedBy: req.admin._id,
        }],
        { session }
      );
    });

    return res.status(201).json({
      success: true,
      result,
      message: 'Pengajuan tersimpan. Data berlaku belum berubah.',
    });
  } catch (err) {
    return handleError(err, res);
  } finally {
    await session.endSession();
  }
};

exports.review = async function review(req, res) {
  if (!validId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: 'ID pengajuan tidak valid.',
    });
  }

  const validation = reviewSchema.validate(req.body);

  if (validation.error) {
    return res.status(400).json({
      success: false,
      message: 'Keputusan dan catatan wajib diisi.',
    });
  }

  const value = validation.value;
  const session = await mongoose.startSession();
  let result;

  try {
    await session.withTransaction(async () => {
      const ChangeRequest = mongoose.model('ChangeRequest');
      const Project = mongoose.model('Project');
      const Contract = mongoose.model('Contract');
      const Budget = mongoose.model('ProjectBudget');

      const change = await ChangeRequest.findById(req.params.id)
        .session(session).lean();

      if (!change) fail(404, 'Pengajuan tidak ditemukan.');

      if (change.status !== 'submitted') {
        fail(409, 'Pengajuan sudah diputuskan.');
      }

      if (String(change.requestedBy) === String(req.admin._id)) {
        fail(403, 'Pengaju tidak boleh menyetujui atau menolak pengajuannya sendiri.');
      }

      const project = await Project.findById(change.project)
        .session(session).lean();

      if (
        !project ||
        String(project.manager) !== String(change.requestedBy)
      ) {
        fail(409, 'Pengelola proyek berubah. Pengajuan perlu diperiksa ulang.');
      }

      if (value.decision === 'approved') {
        const contract = await Contract.findById(project.contract)
          .session(session).lean();

        if (!contract || contract.status !== 'agreed') {
          fail(409, 'Kontrak tidak lagi memenuhi persyaratan.');
        }

        if (change.type === 'budget') {
          const current = await Budget.findOne({
            project: project._id,
            isCurrent: true,
            approvalStatus: 'established',
          }).session(session).lean();

          if (
            !current ||
            String(current._id) !== String(change.before.budgetId) ||
            current.version !== change.before.version
          ) {
            fail(409, 'Anggaran berlaku berubah. Buat pengajuan baru.');
          }

          if (current.currency !== contract.currency) {
            fail(409, 'Mata uang anggaran tidak sesuai kontrak.');
          }

          const cleanLines = change.proposed.lines.map((line) => ({
            category: String(line.category),
            description: line.description,
            quantity: line.quantity,
            unit: line.unit,
            unitCost: line.unitCost,
          }));

          const calculated = await calculateBudget(cleanLines, session);

          const latest = await Budget.findOne({
            project: project._id,
          }).sort({ version: -1 }).session(session).lean();

          const old = await Budget.updateOne(
            { _id: current._id, isCurrent: true },
            { $set: { isCurrent: false } },
            { session }
          );

          if (old.modifiedCount !== 1) {
            fail(409, 'Anggaran berubah saat diproses.');
          }

          await Budget.create(
            [{
              project: project._id,
              changeRequest: change._id,
              version: latest.version + 1,
              currency: current.currency,
              total: calculated.total,
              lines: calculated.lines,
              approvalStatus: 'established',
              isCurrent: true,
            }],
            { session }
          );
        } else {
          const count = await Project.countDocuments({
            contract: contract._id,
          }).session(session);

          if (
            count !== 1 ||
            String(contract._id) !== String(change.before.contractId) ||
            contract.currentVersion !== change.before.version ||
            contract.scope !== change.before.scope
          ) {
            fail(409, 'Kontrak berubah. Buat pengajuan baru.');
          }

          const updated = await Contract.updateOne(
            {
              _id: contract._id,
              currentVersion: change.before.version,
              scope: change.before.scope,
            },
            {
              $set: { scope: change.proposed.scope },
              $inc: {
                currentVersion: 1,
                billingRevision: 1,
              },
              $push: {
                revisions: {
                  action: 'scope_change_approved',
                  version: contract.currentVersion + 1,
                  previousScope: contract.scope,
                  scope: change.proposed.scope,
                  changeRequest: change._id,
                  reference: change.reference,
                  recordedBy: req.admin._id,
                  recordedAt: new Date(),
                },
              },
            },
            { session, runValidators: true }
          );

          if (updated.modifiedCount !== 1) {
            fail(409, 'Kontrak berubah saat diproses.');
          }

          // Lingkup berubah: milestone belum ditagihkan
          // harus diverifikasi ulang. Riwayat Approval tetap disimpan.
          await mongoose.model('Milestone').updateMany(
            {
              project: project._id,
              billingInvoice: null,
              status: 'completed',
              approvalStatus: 'approved',
            },
            {
              $set: {
                status: 'planned',
                approvalStatus: 'draft',
                verification: null,
              },
              $inc: { __v: 1 },
            },
            { session }
          );
        }
      }

      result = await ChangeRequest.findOneAndUpdate(
        { _id: change._id, status: 'submitted' },
        {
          $set: {
            status: value.decision,
            decidedBy: req.admin._id,
            decisionNotes: value.notes,
            decidedAt: new Date(),
          },
        },
        { new: true, session, runValidators: true }
      );

      if (!result) fail(409, 'Pengajuan sudah berubah.');
    });

    return res.status(200).json({
      success: true,
      result,
      message:
        value.decision === 'approved'
          ? 'Perubahan disetujui dan diberlakukan.'
          : 'Perubahan ditolak. Data berlaku tetap dipertahankan.',
    });
  } catch (err) {
    return handleError(err, res);
  } finally {
    await session.endSession();
  }
};