// backend/routes/votingRoutes.js
// POST /api/voting/:id  — toggle vote (upvote / unvote)
// GET  /api/voting/:id  — cek status vote user

const express = require('express');
const pool = require('../config/db');
const { verifyToken } = require('../middleware/authMiddleware');

const router = express.Router();

// ── Toggle vote ────────────────────────────────────────────
router.post('/:id', verifyToken, async (req, res) => {
  const aspirasiId = parseInt(req.params.id);
  const userId = req.user.id;

  try {
    // Cek aspirasi ada
    const [[asp]] = await pool.query('SELECT id FROM aspirasi WHERE id = ?', [aspirasiId]);
    if (!asp) {
      return res.status(404).json({ success: false, message: 'Aspirasi tidak ditemukan.' });
    }

    // Cek sudah vote?
    const [[existing]] = await pool.query(
      'SELECT id FROM votes WHERE aspirasi_id = ? AND user_id = ?',
      [aspirasiId, userId]
    );

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      let action, vote_count;

      if (existing) {
        // UNVOTE
        await conn.query('DELETE FROM votes WHERE aspirasi_id = ? AND user_id = ?', [
          aspirasiId,
          userId,
        ]);
        await conn.query(
          'UPDATE aspirasi SET vote_count = GREATEST(vote_count-1, 0) WHERE id = ?',
          [aspirasiId]
        );
        action = 'unvoted';
      } else {
        // VOTE
        await conn.query('INSERT INTO votes (aspirasi_id, user_id) VALUES (?,?)', [
          aspirasiId,
          userId,
        ]);
        await conn.query('UPDATE aspirasi SET vote_count = vote_count+1 WHERE id = ?', [
          aspirasiId,
        ]);
        action = 'voted';
      }

      await conn.commit();

      const [[row]] = await pool.query('SELECT vote_count FROM aspirasi WHERE id = ?', [
        aspirasiId,
      ]);
      vote_count = row.vote_count;

      return res.json({ success: true, action, vote_count });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('[voting]', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── Cek status vote ────────────────────────────────────────
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT id FROM votes WHERE aspirasi_id = ? AND user_id = ?', [
      req.params.id,
      req.user.id,
    ]);
    return res.json({ success: true, voted: !!row });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;
