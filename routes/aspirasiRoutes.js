// backend/routes/aspirasiRoutes.js
// GET    /api/aspirasi           — list semua (publik)
// POST   /api/aspirasi           — kirim aspirasi (login)
// GET    /api/aspirasi/saya      — aspirasi milik sendiri (login)
// GET    /api/aspirasi/:id       — detail + riwayat status
// GET    /api/kategori           — daftar kategori

const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

// ── GET /api/kategori ──────────────────────────────────────
router.get('/kategori', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM kategori ORDER BY id');
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[kategori]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── GET /api/aspirasi — list dengan filter & pagination ─────
router.get('/', async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 10, 50);
  const offset = (page - 1) * limit;
  const kategoriId = req.query.kategori_id || null;
  const status = req.query.status || null;
  const q = req.query.q || null;

  try {
    const where = ['1=1'];
    const params = [];

    if (kategoriId) {
      where.push('a.kategori_id = ?');
      params.push(kategoriId);
    }
    if (status) {
      where.push('a.status = ?');
      params.push(status);
    }
    if (q) {
      where.push('(a.judul LIKE ? OR a.isi LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }

    const sql = where.join(' AND ');

    const [rows] = await pool.query(
      `SELECT
         a.id, a.judul, a.isi, a.is_anonim, a.status,
         a.prioritas, a.vote_count, a.created_at,
         k.nama  AS kategori_nama,
         k.icon  AS kategori_icon,
         k.warna AS kategori_warna,
         IF(a.is_anonim=1, 'Anonim', u.nama) AS pengirim
       FROM aspirasi a
       JOIN kategori k ON k.id = a.kategori_id
       LEFT JOIN users u ON u.id = a.user_id
       WHERE ${sql}
       ORDER BY a.vote_count DESC, a.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM aspirasi a WHERE ${sql}`,
      params
    );

    return res.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[aspirasi list]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── GET /api/aspirasi/saya ─────────────────────────────────
router.get('/saya', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         a.id, a.judul, a.status, a.prioritas,
         a.vote_count, a.is_anonim, a.created_at,
         k.nama AS kategori_nama,
         k.icon AS kategori_icon,
         k.warna AS kategori_warna
       FROM aspirasi a
       JOIN kategori k ON k.id = a.kategori_id
       WHERE a.user_id = ?
       ORDER BY a.created_at DESC`,
      [req.user.id]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[aspirasi saya]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── GET /api/aspirasi/:id — detail ────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         a.*,
         k.nama  AS kategori_nama,
         k.icon  AS kategori_icon,
         k.warna AS kategori_warna,
         IF(a.is_anonim=1, 'Anonim', u.nama) AS pengirim
       FROM aspirasi a
       JOIN kategori k ON k.id = a.kategori_id
       LEFT JOIN users u ON u.id = a.user_id
       WHERE a.id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Aspirasi tidak ditemukan.' });
    }

    const [logs] = await pool.query(
      `SELECT sl.status_lama, sl.status_baru, sl.catatan, sl.created_at,
              IFNULL(u.nama, 'Sistem') AS oleh
       FROM status_log sl
       LEFT JOIN users u ON u.id = sl.admin_id
       WHERE sl.aspirasi_id = ?
       ORDER BY sl.created_at ASC`,
      [req.params.id]
    );

    return res.json({ success: true, data: { ...rows[0], riwayat: logs } });
  } catch (err) {
    console.error('[aspirasi detail]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── POST /api/aspirasi — kirim aspirasi ───────────────────
router.post(
  '/',
  verifyToken,
  [
    body('judul')
      .trim()
      .notEmpty()
      .isLength({ max: 200 })
      .withMessage('Judul wajib diisi (maks 200 karakter).'),
    body('isi').trim().notEmpty().withMessage('Isi aspirasi wajib diisi.'),
    body('kategori_id').isInt({ min: 1 }).withMessage('Pilih kategori yang valid.'),
    body('is_anonim').isBoolean(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, errors: errors.array() });
    }

    const { judul, isi, kategori_id, is_anonim } = req.body;
    const userId = is_anonim ? null : req.user.id;

    try {
      const [result] = await pool.query(
        'INSERT INTO aspirasi (user_id, kategori_id, judul, isi, is_anonim) VALUES (?,?,?,?,?)',
        [userId, kategori_id, judul, isi, is_anonim ? 1 : 0]
      );

      // Catat log status awal
      await pool.query(
        "INSERT INTO status_log (aspirasi_id, status_baru, catatan) VALUES (?, 'menunggu', 'Aspirasi dikirim.')",
        [result.insertId]
      );

      // Notifikasi ke semua admin
      const [admins] = await pool.query(
        "SELECT id FROM users WHERE role = 'admin' AND is_active = 1"
      );
      if (admins.length > 0) {
        const vals = admins.map((a) => [
          a.id,
          result.insertId,
          'Aspirasi Baru Masuk',
          `"${judul}" menunggu peninjauan.`,
        ]);
        await pool.query('INSERT INTO notifikasi (user_id, aspirasi_id, judul, pesan) VALUES ?', [
          vals,
        ]);
      }

      return res.status(201).json({
        success: true,
        message: 'Aspirasi berhasil dikirim!',
        id: result.insertId,
      });
    } catch (err) {
      console.error('[aspirasi post]', err);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  }
);

module.exports = router;
