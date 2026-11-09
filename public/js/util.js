// Utilidades compartidas. Todo el HTML se arma con html`...` que escapa por defecto (anti-XSS).
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(s);
const val = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(val).join('') : v === false || v == null ? '' : esc(v));
export const html = (strs, ...vals) => new Raw(strs.reduce((a, s, i) => a + s + (i < vals.length ? val(vals[i]) : ''), ''));

export const S = { cfg: null, me: null, markCode: null }; // estado global
export const acts = {};   // data-act="nombre"  -> click
export const forms = {};  // data-form="nombre" -> submit
export const $ = (sel, root = document) => root.querySelector(sel);

export async function api(method, url, body) {
  let res;
  try {
    res = await fetch(url, { method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  } catch { const e = new Error('No hay conexión con el servidor. Revisá tu internet.'); e.code = 'NETWORK'; throw e; }
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  if (!res.ok) { const e = new Error(data?.message || 'Ocurrió un error'); e.code = data?.error; e.status = res.status; e.data = data; throw e; }
  return data;
}
export const get = (u) => api('GET', u);
export const post = (u, b) => api('POST', u, b || {});
export const patch = (u, b) => api('PATCH', u, b || {});

export function render(content, opts = {}) {
  const preserve = !!(opts && opts.preserveScroll);
  const y = preserve ? window.scrollY : 0;
  $('#app').innerHTML = content.toString();
  if (preserve) {
    // Evita el salto a top al cambiar login/registro
    window.scrollTo(0, y);
    requestAnimationFrame(() => {
      window.scrollTo(0, y);
      requestAnimationFrame(() => window.scrollTo(0, y));
    });
  } else {
    window.scrollTo(0, 0);
  }
}
export function patchEl(sel, content) { const el = $(sel); if (el) el.innerHTML = content.toString(); }

let toastTimer;
export function toast(msg, ms = 3500) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
export function openModal(content, opts = {}) {
  const body = $('#modal-body');
  const modal = $('#modal');
  if (!body || !modal) return;
  body.innerHTML = content.toString();
  modal.classList.add('show');
  const full = !!(opts && opts.full) || !!body.querySelector('.doc-preview-modal');
  modal.classList.toggle('modal-full', full);
  const f = body.querySelector('input,select,button,[data-act="close-modal"]');
  f?.focus();
}
export function closeModal() {
  const modal = $('#modal');
  if (modal) {
    modal.classList.remove('show', 'modal-full');
  }
  const body = $('#modal-body');
  if (body) body.innerHTML = '';
}

export const money = (n) => '$ ' + Number(n || 0).toLocaleString('es-AR');
const TZ = 'America/Argentina/Buenos_Aires';
// Horas en formato 24 h (13:00), sin a. m. / p. m., para que no haya ambigüedad en los horarios
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ });
export const fmtDateTime = (ts) => new Date(ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ });
export const fmtDay = (iso) => {
  if (iso == null || iso === '') return '';
  if (typeof iso === 'number') {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    const y = d.toLocaleString('en-CA', { timeZone: TZ, year: 'numeric' });
    const m = d.toLocaleString('en-CA', { timeZone: TZ, month: '2-digit' });
    const day = d.toLocaleString('en-CA', { timeZone: TZ, day: '2-digit' });
    // en-CA month/day order is YYYY-MM-DD parts via toLocaleDateString
    const s = d.toLocaleDateString('en-CA', { timeZone: TZ });
    return s.split('-').reverse().join('/');
  }
  const s = String(iso);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10).split('-').reverse().join('/');
  if (/^\d+$/.test(s)) return fmtDay(Number(s));
  return s;
};
export const holKind = (k) => ({ feriado: 'Feriado', no_laborable: 'No laborable', laborable: 'Laborable' }[k] || (k ? String(k).replace(/_/g, ' ') : ''));
export const fmtH = (h) => `${Number(h || 0).toLocaleString('es-AR', { maximumFractionDigits: 1 })} h`;
export const todayAR = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const periodLabel = (p) => { const [y, m] = p.split('-'); return `${MESES[+m - 1]} ${y}`; };
export function periodOptions(selected, n = 12) {
  const [y0, m0] = todayAR().split('-').map(Number);
  const out = [];
  for (let i = 0; i < n; i++) { const d = new Date(Date.UTC(y0, m0 - 1 - i, 1)); const p = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; out.push(html`<option value="${p}" ${p === selected ? raw('selected') : ''}>${periodLabel(p)}</option>`); }
  return out;
}

export function applyTheme() {
  const color = (typeof S !== 'undefined' && S.me && S.me.tenant && S.me.tenant.theme)
    ? S.me.tenant.theme
    : '#0f766e';
  document.documentElement.style.setProperty('--theme', color);
  // Modo oscuro solo dentro de paneles (logueado). La landing / login siempre claro.
  const loggedIn = !!(typeof S !== 'undefined' && S.me && S.me.user);
  let preferDark = false;
  try { preferDark = localStorage.getItem('ap-dark') === '1'; } catch (e) {}
  const dark = loggedIn && preferDark;
  if (dark) {
    document.documentElement.setAttribute('data-theme', 'dark');
    if (document.body) document.body.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
    if (document.body) document.body.removeAttribute('data-theme');
  }
}
export function toggleDark() {
  const loggedIn = !!(typeof S !== 'undefined' && S.me && S.me.user);
  if (!loggedIn) return; // no oscuro en inicio público
  let dark = false;
  try { dark = localStorage.getItem('ap-dark') === '1'; } catch (e) {}
  dark = !dark;
  try { localStorage.setItem('ap-dark', dark ? '1' : '0'); } catch (e) {}
  applyTheme();
}



/** Comprime imágenes grandes (JPG/PNG/WebP) antes de subir; PDF no se toca. */
export function compressImage(file, opts = {}) {
  const maxW = opts.maxW || 1600;
  const quality = opts.quality || 0.82;
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (!w || !h) { URL.revokeObjectURL(url); return resolve(file); }
        if (w > maxW) { h = Math.round(h * (maxW / w)); w = maxW; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => {
          if (!blob) return resolve(file);
          const name = (file.name || 'foto').replace(/\.(png|webp|heic|jpeg|jpg)$/i, '') + '.jpg';
          resolve(new File([blob], name, { type: 'image/jpeg' }));
        }, 'image/jpeg', quality);
      } catch (e) {
        URL.revokeObjectURL(url);
        resolve(file);
      }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/** Lee archivo a base64. Imágenes > ~400 KB se comprimen (menos espacio en disco). */
export const fileToBase64 = async (file) => {
  if (!file) throw new Error('Elegí un archivo');
  let f = file;
  const isImg = (file.type || '').startsWith('image/');
  if (isImg && file.size > 400 * 1024) {
    f = await compressImage(file, { maxW: 1600, quality: 0.82 });
  }
  if (f.size > 5 * 1024 * 1024) throw new Error('El archivo supera los 5 MB');
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(new Error('No se pudo leer el archivo'));
    r.readAsDataURL(f);
  });
};
export const copyText = async (t) => { try { await navigator.clipboard.writeText(t); toast('Copiado'); } catch { toast('Copialo manualmente: ' + t, 6000); } };

export const badge = (state) => {
  const m = {
    jornada: ['jornada', 'En jornada'], extra: ['extra', 'Extra'], fuera: ['fuera', 'Fuera'],
    active: ['activo', 'Activo'], past_due: ['fallido', 'Pago vencido'], suspended: ['suspend', 'Suspendido'],
    pending_payment: ['fallido', 'Sin pagar'], pending: ['fallido', 'Pendiente'],
    disabled: ['suspend', 'Deshabilitado'], approved: ['activo', 'Aprobado'], rejected: ['suspend', 'Rechazado'],
    answered: ['activo', 'Respondida'], review: ['fallido', 'En revisión'], conforme: ['activo', 'Conforme'],
    desconforme: ['suspend', 'Disconforme'], ok: ['activo', 'OK'],
  };
  const [cls, label] = m[state] || ['fuera', state];
  return html`<span class="badge b-${cls}">${label}</span>`;
};


// ---------- Preferencias de cookies (Ley 25.326 / transparencia) ----------
const COOKIE_KEY = 'asistok_cookie_prefs';
export function getCookieConsent() {
  try {
    const raw = localStorage.getItem(COOKIE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
export function setCookieConsent(prefs) {
  const v = {
    necessary: true,
    analytics: !!prefs.analytics,
    marketing: !!prefs.marketing,
    at: Date.now(),
  };
  try { localStorage.setItem(COOKIE_KEY, JSON.stringify(v)); } catch {}
  return v;
}
export function hasCookieDecision() {
  return !!getCookieConsent();
}
/** AsistOK hoy solo usa cookies necesarias de sesión. Analíticas/marketing quedan guardadas por si se activan más adelante. */
export function applyCookieConsent() {
  const c = getCookieConsent();
  if (!c) return;
  // Hooks futuros: si se integra GA / Meta Pixel, condicionar acá.
  window.__asistokCookies = c;
}
