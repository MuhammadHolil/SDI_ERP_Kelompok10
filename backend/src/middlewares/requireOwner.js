module.exports = function requireOwner(req, res, next) {
  const user = req.admin;

  if (!user) {
    return res.status(401).json({
      success: false,
      result: null,
      message: 'Silakan login terlebih dahulu.',
    });
  }

  if (!user.enabled || user.removed) {
    return res.status(403).json({
      success: false,
      result: null,
      message: 'Akun tidak aktif.',
    });
  }

  if (user.role !== 'owner') {
    return res.status(403).json({
      success: false,
      result: null,
      message: 'Hanya administrator yang dapat melakukan tindakan ini.',
    });
  }

  return next();
};