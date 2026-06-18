// backend/middleware/authMiddleware.js
// Verifikasi JWT dan guard role

const jwt = require('jsonwebtoken');

// Verifikasi token dari header Authorization: Bearer <token>
const verifyToken = (req, res, next) => {
  const header = req.headers['authorization'];

  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token tidak ditemukan.' });
  }

  const token = header.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, nama, email, role }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Sesi habis, silakan login ulang.' });
    }
    return res.status(401).json({ success: false, message: 'Token tidak valid.' });
  }
};

// Guard role — pakai setelah verifyToken
// Contoh: requireRole('admin') atau requireRole('admin', 'pimpinan')
const requireRole =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Belum login.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Akses ditolak. Butuh role: ${roles.join(' atau ')}.`,
      });
    }
    next();
  };

module.exports = { verifyToken, requireRole };
