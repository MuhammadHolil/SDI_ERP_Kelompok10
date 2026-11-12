const mongoose = require('mongoose');
const Joi = require('joi');
const path = require('path');
const { randomUUID } = require('crypto');

const Expense = mongoose.model('Expense');
const ProjectAccess = mongoose.model('ProjectAccess');

const idSchema = Joi.string()
  .pattern(/^[a-fA-F0-9]{24}$/)
  .required();

const fail = (status, message) => {
  const error = new Error(message);
  error.status = status;
  throw error;
};

// Dijalankan sebelum middleware menerima berkas.
exports.authorize = async (req, res, next) => {
  const { error, value } = idSchema.validate(req.params.id);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'ID pengeluaran tidak valid.',
    });
  }

  const expense = await Expense.findOne({
    _id: value,
    createdBy: req.admin._id,
  }).lean();

  if (!expense) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Pengeluaran tidak ditemukan dalam cakupan akses Anda.',
    });
  }

  const access = await ProjectAccess.exists({
    project: expense.project,
    teamMembers: req.admin._id,
  });

  if (!access) {
    return res.status(404).json({
      success: false,
      result: null,
      message: 'Pengeluaran tidak ditemukan dalam cakupan akses Anda.',
    });
  }

  if (expense.approvalStatus !== 'draft') {
    return res.status(409).json({
      success: false,
      result: null,
      message: 'Bukti hanya dapat ditambahkan pada expense draft.',
    });
  }

  if ((expense.evidence || []).length >= 5) {
    return res.status(409).json({
      success: false,
      result: null,
      message: 'Maksimal lima bukti untuk setiap expense.',
    });
  }

  req.expenseEvidenceTarget = {
    id: expense._id,
    project: expense.project,
  };

  next();
};

exports.upload = async (req, res) => {
  const bucket = new mongoose.mongo.GridFSBucket(
    mongoose.connection.db,
    { bucketName: 'expenseEvidence' }
  );

  const fileId = new mongoose.Types.ObjectId();

  const originalName = path.basename(
    path.win32.basename(req.file.originalname)
  ).slice(0, 200);

  const storedName = randomUUID();
  let session;

  try {
    const stream = bucket.openUploadStreamWithId(
      fileId,
      storedName,
      {
        contentType: req.file.mimetype,
        metadata: {
          expense: req.expenseEvidenceTarget.id,
          uploadedBy: req.admin._id,
          originalName,
        },
      }
    );

    await new Promise((resolve, reject) => {
      stream.once('error', reject);
      stream.once('finish', resolve);
      stream.end(req.file.buffer);
    });

    session = await mongoose.startSession();
    let result;

    await session.withTransaction(async () => {
      // Periksa ulang keanggotaan saat menghubungkan bukti.
      const access = await ProjectAccess.findOneAndUpdate(
        {
          project: req.expenseEvidenceTarget.project,
          teamMembers: req.admin._id,
        },
        {
          $inc: { __v: 1 },
        },
        {
          new: true,
          session,
        }
      ).lean();

      if (!access) {
        fail(404, 'Pengeluaran tidak ditemukan dalam cakupan akses Anda.');
      }

      result = await Expense.findOneAndUpdate(
        {
          _id: req.expenseEvidenceTarget.id,
          project: req.expenseEvidenceTarget.project,
          createdBy: req.admin._id,
          approvalStatus: 'draft',
          'evidence.4': { $exists: false },
        },
        {
          $push: {
            evidence: {
              fileId,
              originalName,
              mimeType: req.file.mimetype,
              size: req.file.size,
              uploadedBy: req.admin._id,
              uploadedAt: new Date(),
            },
          },
        },
        {
          new: true,
          runValidators: true,
          session,
        }
      );

      if (!result) {
        fail(
          409,
          'Expense telah berubah atau jumlah bukti sudah mencapai batas.'
        );
      }
    });

    return res.status(201).json({
      success: true,
      result: {
        expense: result._id,
        approvalStatus: result.approvalStatus,
        evidence: result.evidence,
      },
      message: 'Bukti pengeluaran berhasil disimpan.',
    });
  } catch (err) {
    // Hapus berkas gagal hanya jika dipastikan tidak terhubung.
    // Jika pemeriksaan database gagal, pertahankan berkas agar
    // bukti yang mungkin sudah tersimpan tidak ikut terhapus.
    try {
      const linked = await Expense.exists({
        'evidence.fileId': fileId,
      });

      if (!linked) {
        await bucket.delete(fileId);
      }
    } catch (cleanupError) {
      // Pembersihan berkas dapat diperiksa kembali kemudian.
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
    if (session) {
      await session.endSession();
    }
  }
};