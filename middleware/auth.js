const authMiddleware = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  req.userId = req.session.userId;
  next();
};

export default authMiddleware;
