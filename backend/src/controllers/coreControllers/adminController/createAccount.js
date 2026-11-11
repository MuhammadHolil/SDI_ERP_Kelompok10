const mongoose = require('mongoose');
const Joi = require('joi');
const bcrypt = require('bcryptjs');
const { randomBytes } = require('crypto');

const allowedRoles = [
  'sales',
  'project_manager',
  'expert',
  'project_team',
  'expense_approver',
  'management',
  'finance',
];

const schema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().min(12).max(128).required(),
  businessRoles: Joi.array()
    .items(Joi.string().valid(...allowedRoles))
    .min(1)
    .max(allowedRoles.length)
    .unique()
    .required(),
});

module.exports = async function createAccount(req, res) {
  const { error, value } = schema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Periksa nama, email, password, dan peran pengguna.',
    });
  }

  // bcrypt membatasi masukan sampai 72 byte, termasuk salt tambahan.
  const salt = randomBytes(16).toString('hex');

  if (Buffer.byteLength(salt + value.password, 'utf8') > 72) {
    return res.status(400).json({
      success: false,
      result: null,
      message: 'Password terlalu panjang. Gunakan maksimal 40 byte.',
    });
  }

  const Admin = mongoose.model('Admin');
  const AdminPassword = mongoose.model('AdminPassword');

  const existing = await Admin.exists({ email: value.email });

  if (existing) {
    return res.status(409).json({
      success: false,
      result: null,
      message: 'Email sudah digunakan.',
    });
  }

  const passwordHash = await bcrypt.hash(salt + value.password, 10);
  const session = await mongoose.startSession();

  let account;

  try {
    await session.withTransaction(async () => {
      const users = await Admin.create(
        [{
          name: value.name,
          email: value.email,
          enabled: true,
          role: 'member',
          businessRoles: value.businessRoles,
        }],
        { session }
      );

      account = users[0];

      await AdminPassword.create(
        [{
          user: account._id,
          salt,
          password: passwordHash,
          emailVerified: false,
        }],
        { session }
      );
    });

    return res.status(201).json({
      success: true,
      result: {
        _id: account._id,
        name: account.name,
        email: account.email,
        role: account.role,
        businessRoles: account.businessRoles,
      },
      message: 'Akun pengguna berhasil dibuat.',
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        result: null,
        message: 'Email sudah digunakan.',
      });
    }

    throw err;
  } finally {
    await session.endSession();
  }
};