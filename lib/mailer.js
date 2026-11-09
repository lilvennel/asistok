'use strict';
const cfg = require('./config');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Enmascara destinatario en logs: j***@dominio.com */
const mask = (to) => {
  const [u, d] = String(to || '').split('@');
  return d ? `${(u || '').slice(0, 1)}***@${d}` : '***';
};

const MAX_ATTEMPTS = 5;

function dbApi() {
  try { return require('./db'); } catch { return null; }
}

function ensureTable() {
  const db = dbApi();
  if (!db) return;
  try {
    db.db.exec(`CREATE TABLE IF NOT EXISTS mail_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      to_addr TEXT NOT NULL,
      subject TEXT NOT NULL,
      html TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      next_at INTEGER NOT NULL,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      sent_at INTEGER
    )`);
  } catch (_) {}
}

async function deliver(to, subject, html) {
  if (!cfg.RESEND_API_KEY) {
    if (cfg.STRICT) {
      console.warn(`[mail] Sin RESEND_API_KEY: no se envió a ${mask(to)}. Contenido no registrado.`);
    } else {
      const plain = String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200);
      console.log(`[mail:dev] Para: ${mask(to)} | Asunto: ${subject} | ${plain}…`);
    }
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${cfg.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: cfg.MAIL_FROM, to: [to], subject, html }),
  });
  if (!res.ok) {
    throw new Error('Email: proveedor respondió ' + res.status);
  }
  return true;
}

function wrapHtml(title, bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden">
<tr><td style="background:#0f766e;padding:16px 20px;color:#fff;font-weight:700;font-size:18px">AsistOK</td></tr>
<tr><td style="padding:24px 20px">
  <h1 style="margin:0 0 12px;font-size:18px;color:#0f172a">${title}</h1>
  <div style="font-size:15px;line-height:1.55;color:#334155">${bodyHtml}</div>
  <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">AsistOK · mensaje automático, no responder a este correo.</p>
</td></tr></table></td></tr></table></body></html>`;
}

/**
 * Encola en SQLite (persiste al reiniciar) e intenta enviar.
 */
function sendMail(to, subject, html) {
  ensureTable();
  const db = dbApi();
  const now = Date.now();
  let id = null;
  if (db) {
    try {
      const r = db.run(
        'INSERT INTO mail_queue(to_addr,subject,html,attempts,next_at,created_at) VALUES(?,?,?,?,?,?)',
        String(to || ''), String(subject || ''), String(html || ''), 0, now, now
      );
      id = Number(r.lastInsertRowid);
    } catch (e) {
      console.error('[mail] no se pudo encolar', e.message);
    }
  }
  // Compatible con callers que hacen sendMail(...).catch(...)
  return processQueue().then(() => ({ queued: true, id })).catch(() => ({ queued: true, id }));
}

let processing = false;
async function processQueue() {
  if (processing) return;
  processing = true;
  try {
    ensureTable();
    const db = dbApi();
    if (!db) return;
    const now = Date.now();
    let rows = [];
    try {
      rows = db.all(
        'SELECT * FROM mail_queue WHERE sent_at IS NULL AND attempts < ? AND next_at <= ? ORDER BY id LIMIT 20',
        MAX_ATTEMPTS, now
      );
    } catch { return; }
    for (const row of rows) {
      try {
        const ok = await deliver(row.to_addr, row.subject, row.html);
        if (ok || !cfg.RESEND_API_KEY) {
          // en dev sin key también marcamos para no reintentar eterno
          db.run('UPDATE mail_queue SET sent_at=?, last_error=NULL WHERE id=?', Date.now(), row.id);
        }
      } catch (e) {
        const attempts = (row.attempts || 0) + 1;
        const backoff = Math.min(60 * 60e3, 30e3 * Math.pow(2, attempts)); // 30s, 60s, 120s...
        db.run(
          'UPDATE mail_queue SET attempts=?, next_at=?, last_error=? WHERE id=?',
          attempts, Date.now() + backoff, String(e.message || 'error').slice(0, 200), row.id
        );
        console.warn('[mail] reintento', attempts, mask(row.to_addr), e.message);
      }
    }
    // Limpieza: mails enviados de hace más de 14 días
    try { db.run('DELETE FROM mail_queue WHERE sent_at IS NOT NULL AND sent_at < ?', Date.now() - 14 * 864e5); } catch {}
  } finally {
    processing = false;
  }
}

// Procesar cada minuto
setInterval(() => { processQueue().catch(() => {}); }, 60e3).unref();

module.exports = { sendMail, wrapHtml, esc, mask, processQueue };
