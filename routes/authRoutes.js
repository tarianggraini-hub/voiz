// backend/routes/authRoutes.js
// ─────────────────────────────────────────────────────────────
//  POST /api/auth/register  — daftar akun baru
//  POST /api/auth/login     — login & dapat token
//  GET  /api/auth/me        — ambil profil user login
// ─────────────────────────────────────────────────────────────

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const pool = require('../config/db');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

// ── Helper: buat JWT token ────────────────────────────────
const buatToken = (user) =>
  jwt.sign(
    { id: user.id, nama: user.nama, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

// ============================================================
//  REGISTER
// ============================================================
router.post(
  '/register',
  [
    body('nama').trim().notEmpty().withMessage('Nama wajib diisi.'),
    body('email').isEmail().normalizeEmail().withMessage('Format email tidak valid.'),
    body('password').isLength({ min: 6 }).withMessage('Password minimal 6 karakter.'),
    body('nim').optional().trim(),
    body('prodi').optional().trim(),
  ],
  async (req, res) => {
    // Cek validasi
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, errors: errors.array() });
    }

    const { nama, email, password, nim, prodi } = req.body;

    try {
      // Cek apakah email sudah terdaftar
      const [cek] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
      if (cek.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'Email sudah terdaftar. Silakan login.',
        });
      }

      // Hash password
      const hash = await bcrypt.hash(password, 12);

      // Simpan user baru
      const [result] = await pool.query(
        'INSERT INTO users (nama, email, password_hash, nim, prodi) VALUES (?,?,?,?,?)',
        [nama, email, hash, nim || null, prodi || null]
      );

      const user = { id: result.insertId, nama, email, role: 'mahasiswa' };
      const token = buatToken(user);

      return res.status(201).json({
        success: true,
        message: 'Registrasi berhasil! Selamat datang di Voiz.',
        token,
        user: { ...user, nim: nim || null, prodi: prodi || null },
      });
    } catch (err) {
      console.error('[register]', err);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  }
);

// ============================================================
//  LOGIN
// ============================================================
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Format email tidak valid.'),
    body('password').notEmpty().withMessage('Password wajib diisi.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;

    try {
      // Cari user berdasarkan email
      const [rows] = await pool.query(
        `SELECT id, nama, email, password_hash, role,
                nim, prodi, is_active
         FROM users WHERE email = ?`,
        [email]
      );

      if (rows.length === 0) {
        return res.status(401).json({
          success: false,
          message: 'Email atau password salah.',
        });
      }

      const user = rows[0];

      // Cek akun aktif
      if (!user.is_active) {
        return res.status(403).json({
          success: false,
          message: 'Akun kamu dinonaktifkan oleh admin.',
        });
      }

      // Cek password
      const cocok = await bcrypt.compare(password, user.password_hash);
      if (!cocok) {
        return res.status(401).json({
          success: false,
          message: 'Email atau password salah.',
        });
      }

      const token = buatToken(user);

      return res.json({
        success: true,
        message: 'Login berhasil!',
        token,
        user: {
          id: user.id,
          nama: user.nama,
          email: user.email,
          role: user.role,
          nim: user.nim,
          prodi: user.prodi,
        },
      });
    } catch (err) {
      console.error('[login]', err);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  }
);

// ============================================================
//  GET PROFIL — /api/auth/me
// ============================================================
router.get('/me', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, nama, email, role, nim, prodi, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'User tidak ditemukan.',
      });
    }

    return res.json({ success: true, user: rows[0] });
  } catch (err) {
    console.error('[me]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
