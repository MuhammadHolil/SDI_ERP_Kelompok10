const requireOwner = require('./requireOwner');

module.exports = function requireOwnerForWrite(req, res, next) {
  const readMethods = ['GET', 'HEAD', 'OPTIONS'];

  if (readMethods.includes(req.method)) {
    return next();
  }

  return requireOwner(req, res, next);
};