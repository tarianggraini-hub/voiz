// backend/config/db.js
const mysql = require('mysql2');
require('dotenv').config();

const connection = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  multipleStatements: true,
  ssl: { rejectUnauthorized: false }, // ← tambah di sini
});

connection.connect((err) => {
  if (err) {
    console.error('Gagal konek database: ' + err.message);
    return;
  }
  console.log('Berhasil terhubung ke database MySQL ✅');
  autoMigrate();
});

function autoMigrate() {
  const sql = `
    CREATE TABLE IF NOT EXISTS users (
      id            INT UNSIGNED     AUTO_INCREMENT PRIMARY KEY,
      nama          VARCHAR(120)     NOT NULL,
      email         VARCHAR(180)     NOT NULL UNIQUE,
      password_hash VARCHAR(255)     NOT NULL,
      nim           VARCHAR(20)      NULL,
      prodi         VARCHAR(100)     NULL,
      role          ENUM('mahasiswa','admin','pimpinan') NOT NULL DEFAULT 'mahasiswa',
      is_active     TINYINT(1)       NOT NULL DEFAULT 1,
      created_at    DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS kategori (
      id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      nama      VARCHAR(80)  NOT NULL UNIQUE,
      icon      VARCHAR(10)  NOT NULL DEFAULT '📌',
      warna     VARCHAR(20)  NOT NULL DEFAULT '#6366f1',
      deskripsi TEXT         NULL
    ) ENGINE=InnoDB;

    INSERT IGNORE INTO kategori (nama, icon, warna, deskripsi) VALUES
      ('Akademik',  '📖', '#6366f1', 'Perkuliahan, kurikulum, dosen, ujian'),
      ('Fasilitas', '🏢', '#f59e0b', 'Gedung, lab, toilet, parkir, wifi'),
      ('Sosial',    '👥', '#10b981', 'Kegiatan mahasiswa, organisasi, lingkungan'),
      ('Keuangan',  '💸', '#ef4444', 'UKT, beasiswa, biaya administrasi'),
      ('Lainnya',   '📌', '#8b5cf6', 'Aspirasi di luar kategori utama');

    CREATE TABLE IF NOT EXISTS aspirasi (
      id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id      INT UNSIGNED NULL,
      kategori_id  INT UNSIGNED NOT NULL,
      judul        VARCHAR(200) NOT NULL,
      isi          TEXT         NOT NULL,
      is_anonim    TINYINT(1)   NOT NULL DEFAULT 0,
      status       ENUM('menunggu','diterima','diproses','selesai','ditolak') NOT NULL DEFAULT 'menunggu',
      prioritas    ENUM('rendah','sedang','tinggi') NOT NULL DEFAULT 'sedang',
      vote_count   INT UNSIGNED NOT NULL DEFAULT 0,
      created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id)     REFERENCES users(id)    ON DELETE SET NULL,
      FOREIGN KEY (kategori_id) REFERENCES kategori(id) ON DELETE RESTRICT
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS votes (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      aspirasi_id INT UNSIGNED NOT NULL,
      user_id     INT UNSIGNED NOT NULL,
      created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_vote (aspirasi_id, user_id),
      FOREIGN KEY (aspirasi_id) REFERENCES aspirasi(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id)     REFERENCES users(id)    ON DELETE CASCADE
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS status_log (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      aspirasi_id INT UNSIGNED NOT NULL,
      admin_id    INT UNSIGNED NULL,
      status_lama VARCHAR(20)  NULL,
      status_baru VARCHAR(20)  NOT NULL,
      catatan     TEXT         NULL,
      created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (aspirasi_id) REFERENCES aspirasi(id) ON DELETE CASCADE,
      FOREIGN KEY (admin_id)    REFERENCES users(id)    ON DELETE SET NULL
    ) ENGINE=InnoDB;

    CREATE TABLE IF NOT EXISTS notifikasi (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id     INT UNSIGNED NOT NULL,
      aspirasi_id INT UNSIGNED NULL,
      judul       VARCHAR(200) NOT NULL,
      pesan       TEXT         NOT NULL,
      is_read     TINYINT(1)   NOT NULL DEFAULT 0,
      created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id)     REFERENCES users(id)    ON DELETE CASCADE,
      FOREIGN KEY (aspirasi_id) REFERENCES aspirasi(id) ON DELETE SET NULL
    ) ENGINE=InnoDB;

    INSERT IGNORE INTO users (nama, email, password_hash, role) VALUES
      ('Admin Voiz', 'admin@voiz.id',
       '$2b$12$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
       'admin');
  `;

  connection.query(sql, (err) => {
    if (err) {
      console.error('Migration gagal: ' + err.message);
      return;
    }
    console.log('Migration selesai, semua tabel siap ✅');
  });
}

module.exports = connection;
