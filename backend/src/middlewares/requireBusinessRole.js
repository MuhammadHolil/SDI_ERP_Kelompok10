module.exports = function requireBusinessRole(...allowedRoles) {
  return function (req, res, next) {
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

    const roles = Array.isArray(user.businessRoles)
      ? user.businessRoles
      : [];

    const permitted = allowedRoles.some((role) =>
      roles.includes(role)
    );

    if (!permitted) {
      return res.status(403).json({
        success: false,
        result: null,
        message: 'Peran Anda tidak memiliki izin untuk fitur ini.',
      });
    }

    return next();
  };
};