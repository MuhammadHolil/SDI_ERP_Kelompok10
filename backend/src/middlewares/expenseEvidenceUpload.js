const multer = require('multer');
const path = require('path');

const MAX_FILE_SIZE = 5 * 1024 * 1024;

const allowedTypes = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
    fields: 0,
    parts: 1,
  },

  fileFilter: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const expectedType = allowedTypes[extension];

    if (!expectedType || file.mimetype !== expectedType) {
      const error = new Error(
        'Gunakan berkas PDF, PNG, JPG, atau JPEG dengan tipe yang sesuai.'
      );

      error.status = 400;
      return callback(error);
    }

    callback(null, true);
  },
}).single('file');

const matchesSignature = (buffer, mimeType) => {
  if (mimeType === 'application/pdf') {
    return (
      buffer.length >= 5 &&
      buffer.subarray(0, 5).toString('ascii') === '%PDF-'
    );
  }

  if (mimeType === 'image/png') {
    const signature = Buffer.from([
      0x89, 0x50, 0x4e, 0x47,
      0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    return (
      buffer.length >= signature.length &&
      buffer.subarray(0, signature.length).equals(signature)
    );
  }

  if (mimeType === 'image/jpeg') {
    return (
      buffer.length >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff
    );
  }

  return false;
};

module.exports = function expenseEvidenceUpload(req, res, next) {
  upload(req, res, (error) => {
    if (error) {
      const tooLarge = error.code === 'LIMIT_FILE_SIZE';

      return res.status(tooLarge ? 413 : 400).json({
        success: false,
        result: null,
        message: tooLarge
          ? 'Ukuran bukti maksimal 5 MB.'
          : error.status === 400
            ? error.message
            : 'Kirim tepat satu berkas melalui kolom file, tanpa kolom tambahan.',
      });
    }

    if (!req.file || req.file.size === 0) {
      return res.status(400).json({
        success: false,
        result: null,
        message: 'Berkas bukti wajib diunggah dan tidak boleh kosong.',
      });
    }

    if (!matchesSignature(req.file.buffer, req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        result: null,
        message: 'Isi awal berkas tidak sesuai dengan tipe yang diizinkan.',
      });
    }

    next();
  });
};