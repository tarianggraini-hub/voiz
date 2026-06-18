// backend/routes/adminRoutes.js
// PATCH /api/admin/aspirasi/:id/status  — update status
// GET   /api/admin/stats                — statistik dashboard
// GET   /api/admin/aspirasi             — semua aspirasi (admin view)
// GET   /api/admin/notifikasi           — notifikasi admin
// PATCH /api/admin/notifikasi/:id/read  — tandai terbaca

const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();
const guard = [verifyToken, requireRole('admin', 'pimpinan')];

// ── Update status aspirasi ─────────────────────────────────
router.patch(
  '/aspirasi/:id/status',
  [
    ...guard,
    body('status')
      .isIn(['diterima', 'diproses', 'selesai', 'ditolak'])
      .withMessage('Status tidak valid.'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ success: false, errors: errors.array() });
    }

    const { status, catatan, prioritas } = req.body;
    const { id } = req.params;

    try {
      const [[asp]] = await pool.query('SELECT status, user_id, judul FROM aspirasi WHERE id = ?', [
        id,
      ]);
      if (!asp) {
        return res.status(404).json({ success: false, message: 'Aspirasi tidak ditemukan.' });
      }

      // Update status (dan prioritas jika ada)
      if (prioritas) {
        await pool.query('UPDATE aspirasi SET status=?, prioritas=? WHERE id=?', [
          status,
          prioritas,
          id,
        ]);
      } else {
        await pool.query('UPDATE aspirasi SET status=? WHERE id=?', [status, id]);
      }

      // Log
      await pool.query(
        'INSERT INTO status_log (aspirasi_id, admin_id, status_lama, status_baru, catatan) VALUES (?,?,?,?,?)',
        [id, req.user.id, asp.status, status, catatan || null]
      );

      // Notifikasi ke pengirim (kalau bukan anonim)
      if (asp.user_id) {
        const label = {
          diterima: 'Diterima',
          diproses: 'Sedang Diproses',
          selesai: 'Selesai',
          ditolak: 'Ditolak',
        };
        await pool.query(
          'INSERT INTO notifikasi (user_id, aspirasi_id, judul, pesan) VALUES (?,?,?,?)',
          [
            asp.user_id,
            id,
            `Aspirasi ${label[status]}`,
            `Aspirasi "${asp.judul}" sekarang berstatus: ${label[status]}.${catatan ? ' Catatan: ' + catatan : ''}`,
          ]
        );
      }

      return res.json({ success: true, message: 'Status berhasil diperbarui.' });
    } catch (err) {
      console.error('[admin status]', err);
      return res.status(500).json({ success: false, message: 'Server error.' });
    }
  }
);

// ── Statistik dashboard ────────────────────────────────────
router.get('/stats', guard, async (_req, res) => {
  try {
    const [statusStats] = await pool.query(
      'SELECT status, COUNT(*) AS total FROM aspirasi GROUP BY status'
    );
    const [kategoriStats] = await pool.query(
      `SELECT k.nama, k.warna, COUNT(a.id) AS total
       FROM kategori k LEFT JOIN aspirasi a ON a.kategori_id = k.id
       GROUP BY k.id ORDER BY total DESC`
    );
    const [tren] = await pool.query(
      `SELECT DATE_FORMAT(created_at,'%Y-%m') AS bulan, COUNT(*) AS total
       FROM aspirasi WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
       GROUP BY bulan ORDER BY bulan`
    );
    const [topVote] = await pool.query(
      `SELECT a.id, a.judul, a.vote_count, k.nama AS kategori
       FROM aspirasi a JOIN kategori k ON k.id=a.kategori_id
       ORDER BY a.vote_count DESC LIMIT 5`
    );
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM aspirasi');
    const [[{ totalUser }]] = await pool.query(
      "SELECT COUNT(*) AS totalUser FROM users WHERE role='mahasiswa'"
    );

    return res.json({
      success: true,
      data: { statusStats, kategoriStats, tren, topVote, total, totalUser },
    });
  } catch (err) {
    console.error('[admin stats]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── Semua aspirasi (admin view) ────────────────────────────
router.get('/aspirasi', guard, async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 15, 50);
  const offset = (page - 1) * limit;
  const status = req.query.status || null;

  try {
    const where = ['1=1'];
    const params = [];
    if (status) {
      where.push('a.status = ?');
      params.push(status);
    }
    const sql = where.join(' AND ');

    const [rows] = await pool.query(
      `SELECT a.id, a.judul, a.status, a.prioritas, a.vote_count,
              a.is_anonim, a.created_at,
              k.nama AS kategori_nama, k.warna AS kategori_warna,
              IF(a.is_anonim=1,'Anonim',u.nama) AS pengirim,
              IF(a.is_anonim=1,NULL,u.email) AS email_pengirim
       FROM aspirasi a
       JOIN kategori k ON k.id=a.kategori_id
       LEFT JOIN users u ON u.id=a.user_id
       WHERE ${sql}
       ORDER BY FIELD(a.status,'menunggu','diterima','diproses','selesai','ditolak'),
                a.vote_count DESC, a.created_at DESC
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
    console.error('[admin aspirasi]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── Notifikasi ─────────────────────────────────────────────
router.get('/notifikasi', verifyToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, aspirasi_id, judul, pesan, is_read, created_at FROM notifikasi WHERE user_id=? ORDER BY created_at DESC LIMIT 30',
      [req.user.id]
    );
    const [[{ unread }]] = await pool.query(
      'SELECT COUNT(*) AS unread FROM notifikasi WHERE user_id=? AND is_read=0',
      [req.user.id]
    );
    return res.json({ success: true, data: rows, unread });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

router.patch('/notifikasi/:id/read', verifyToken, async (req, res) => {
  try {
    await pool.query('UPDATE notifikasi SET is_read=1 WHERE id=? AND user_id=?', [
      req.params.id,
      req.user.id,
    ]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
