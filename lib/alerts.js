'use strict';
const cfg = require('./config');
const { all } = require('./db');
const mailer = require('./mailer');
const fc = require('./fieldcrypto');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Notifica por email (Resend) al dueño y, si includeHr, a RRHH activos.
 * Opcional: WhatsApp vía ALERT_WHATSAPP_URL.
 */
function ownerWhatsAppLink(tenantId, title, detail) {
  try {
    const { get, getSetting } = require('./db');
    const t = get('SELECT * FROM tenants WHERE id=?', tenantId);
    let phone = (t && t.owner_whatsapp) || '';
    if (!phone) {
      const contact = getSetting('contact', null) || {};
      const wa = String(contact.wa_link || '');
      const m = wa.match(/(\d{8,15})/);
      if (m) phone = m[1];
    }
    phone = String(phone || '').replace(/\D/g, '');
    if (!phone) return null;
    const text = encodeURIComponent((title || 'AsistOK') + (detail ? '\n' + detail : '') + '\n(Abrí el panel AsistOK → Notificaciones)');
    return 'https://wa.me/' + phone + '?text=' + text;
  } catch { return null; }
}

function notifyOwner(tenantId, { title, detail, includeHr = true } = {}) {
  try {
    const roles = includeHr ? "('owner','hr')" : "('owner')";
    const recipients = all(
      `SELECT email, name, role FROM users WHERE tenant_id=? AND role IN ${roles} AND status='active'`,
      tenantId
    );
    const seen = new Set();
    const wa = ownerWhatsAppLink(tenantId, title, detail);
    for (const o of recipients) {
      const email = fc.decryptEmail(o.email) || o.email;
      if (!email || !String(email).includes('@')) continue;
      const key = String(email).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const waLine = wa ? `<p><a href="${esc(wa)}">Abrir aviso en WhatsApp</a></p>` : '';
      const html = `<p><strong>${esc(title)}</strong></p><p>${esc(detail || '')}</p>${waLine}<p style="color:#64748b;font-size:13px">AsistOK · aviso automático. Revisá el panel → Notificaciones.</p>`;
      mailer.sendMail(email, `[AsistOK] ${title}`, html);
    }
    if (cfg.ALERT_WHATSAPP_URL) {
      const text = encodeURIComponent(title + (detail ? ' — ' + detail : ''));
      const url = cfg.ALERT_WHATSAPP_URL.includes('{text}')
        ? cfg.ALERT_WHATSAPP_URL.replace('{text}', text)
        : cfg.ALERT_WHATSAPP_URL + (cfg.ALERT_WHATSAPP_URL.includes('?') ? '&' : '?') + 'text=' + text;
      fetch(url, { method: 'GET', signal: AbortSignal.timeout(8000) }).catch(() => {});
    }
  } catch (e) {
    console.error('[alerts]', e.message);
  }
}

module.exports = { notifyOwner, ownerWhatsAppLink };
