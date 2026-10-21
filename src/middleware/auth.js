
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({
      success: false,
      message: "Please log in to continue.",
    });
  }

  next();
}

function allowRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.session || !req.session.user) {
      return res.status(401).json({
        success: false,
        message: "Please log in to continue.",
      });
    }

    if (!allowedRoles.includes(req.session.user.role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to perform this action.",
      });
    }

    next();
  };
}

module.exports = {
  requireAuth,
  allowRoles,
};
