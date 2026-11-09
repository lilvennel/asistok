import { S, acts, forms, html, raw, $, get, post, render, toast, closeModal, openModal, api, applyTheme, toggleDark, money, esc, copyText, getCookieConsent, setCookieConsent, hasCookieDecision, applyCookieConsent } from './util.js';
import { renderOwner } from './owner.js';
import { renderEmployee, renderMark } from './employee.js';
import { renderAdmin } from './admin.js';

/** Entrada por URL: /admin = negocio · /app|/marcar = empleados · subdominio del cliente */
function pathEntryMode() {
  const p = location.pathname || '';
  if (p === '/admin' || p.startsWith('/admin/') || /\/t\/[^/]+\/admin/.test(p)) return 'admin';
  if (p === '/app' || p.startsWith('/app/') || p === '/marcar' || p.startsWith('/marcar/') || /\/t\/[^/]+\/(app|marcar)/.test(p)) return 'employee';
  return 'auto';
}
function pathTenantSlug() {
  const m = location.pathname.match(/^\/t\/([a-z0-9-]+)/i);
  if (m) return m[1].toLowerCase();
  const host = location.hostname || '';
  const parts = host.split('.');
  // ferreteria.asistok.app → ferreteria (si no es www)
  if (parts.length >= 3 && parts[0] !== 'www') return parts[0].toLowerCase();
  return null;
}

import { renderDisplay } from './display.js';

const q = new URLSearchParams(location.search);
let cleanUrl = () => history.replaceState(null, '', '/');

// ---------- Eventos globales (delegación; sin handlers inline por la CSP) ----------
document.addEventListener('click', async (e) => {
  if (e.target.id === 'modal') return closeModal();
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = acts[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  try { await fn(el, e); } catch (err) { fail(err); }
});
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const btn = f.querySelector('button[type=submit]');
  btn && (btn.disabled = true);
  try { await forms[f.dataset.form](Object.fromEntries(new FormData(f)), f); } catch (err) { fail(err); }
  finally { btn && (btn.disabled = false); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  const rb = (e.key === 'Enter' || e.key === ' ') && e.target.closest?.('[role=button][data-act]');
  if (rb && rb === e.target) { e.preventDefault(); rb.click(); }
});
document.addEventListener('input', (e) => { const el = e.target.closest('[data-input]'); if (el) acts[el.dataset.input]?.(el, e); });
document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (el) acts[el.dataset.change]?.(el, e); });

export function fail(err) {
  if (!err.status) console.error(err);
  if (err.status === 401) { S.me = null; showAuth(); return toast('Tu sesión venció. Ingresá de nuevo.'); }
  // Rol cambiado o sin permiso: re-evaluar sesión (evita panel colgado en bucle)
  if (err.status === 403 && (err.code === 'FORBIDDEN' || err.code === 'ACCOUNT_DISABLED')) {
    toast(err.message || 'No tenés permiso para esto');
    boot();
    return;
  }
  if (['PAYMENT_REQUIRED', 'TENANT_SUSPENDED', 'TENANT_INACTIVE', 'ACCOUNT_DISABLED'].includes(err.code)) { boot(); return; }
  if (err.code === 'MUST_CHANGE_PW') { boot(); return; }
  toast(err.message || 'Ocurrió un error');
}

// ---------- Pantalla de acceso ----------
const eyeless = (id, label, type = 'text', extra = '') => html`<div class="form-group"><label for="${id}">${label}</label><input id="${id}" name="${id}" type="${type}" ${raw(extra)}></div>`;

let authTab = 'login';

/** Formulario + panel de login (para re-render parcial sin mover el scroll) */
function buildAuthPanel(message) {
  const c = S.cfg || {};
  const reg = authTab === 'reg', forgot = authTab === 'forgot';
  const loginForm = forgot ? html`
    <form data-form="forgot"><p class="muted mb">Ingresá tu email y te enviamos un link para elegir una nueva contraseña.</p>
      ${eyeless('f-email', 'Email', 'email', 'required autocomplete="email"')}
      <button class="btn btn-primary btn-block" type="submit">Enviar link</button>
      <p class="sa-link" style="text-align:center;margin-top:12px"><a href="#" data-act="auth-tab" data-tab="login">← Volver</a></p></form>`
  : reg ? html`
    <form data-form="register">
      ${eyeless('business', 'Nombre del negocio', 'text', 'required minlength="2" maxlength="80" autocomplete="organization"')}
      ${eyeless('email', 'Email', 'email', 'required autocomplete="email"')}
      ${eyeless('password', 'Contraseña (mínimo 8 caracteres)', 'password', 'required minlength="8" autocomplete="new-password"')}
      <div class="form-group"><label for="plan_tier">Plan</label><select id="plan_tier" name="plan_tier">
        <option value="esencial">Esencial</option>
        <option value="pro">Pro</option>
        <option value="completo">Completo (multi-sucursal + recibos)</option></select></div>
      <div class="form-group"><label for="plan">Facturación</label><select id="plan" name="plan">
        <option value="sub">Suscripción mensual</option>
        <option value="once">Pago único (de por vida)</option></select></div>
      ${eyeless('coupon', 'Código de descuento (opcional)', 'text', 'autocomplete="off" style="text-transform:uppercase"')}
      <p class="muted" style="font-size:.85rem;margin-bottom:10px">Incluye hasta ${c.free_employees ?? 40} empleados.</p>
      <div class="reg-trial-card" role="note">
        <div class="reg-trial-card__icon" aria-hidden="true">✦</div>
        <div>
          <div class="reg-trial-card__title">1 mes gratis en Esencial</div>
          <p class="reg-trial-card__text">Con <strong>suscripción mensual</strong> del plan Esencial, Mercado Pago pide un medio de pago y <strong>no cobra</strong> hasta que termine la prueba. Pro, Completo y pago único se cobran al activar.</p>
        </div>
      </div>
      <label class="terms-check" style="display:flex;gap:10px;align-items:flex-start;margin:12px 0 8px">
        <input type="checkbox" name="accept_terms" value="1" required style="margin-top:3px;width:18px;height:18px;flex-shrink:0">
        <span class="muted" style="font-size:.85rem;line-height:1.4">Leí y acepto los <a href="/terminos" target="_blank" rel="noopener">Términos y condiciones</a>.</span>
      </label>
      <label class="terms-check" style="display:flex;gap:10px;align-items:flex-start;margin:0 0 16px">
        <input type="checkbox" name="accept_privacy" value="1" required style="margin-top:3px;width:18px;height:18px;flex-shrink:0">
        <span class="muted" style="font-size:.85rem;line-height:1.4">Leí y acepto la <a href="/privacidad" target="_blank" rel="noopener">Política de privacidad</a>.</span>
      </label>
      <p class="muted" style="font-size:.8rem;margin:-8px 0 12px">Al registrarte te enviamos un email para <strong>confirmar tu dirección</strong>. Sin eso no podés pagar ni activar el negocio.</p>
      ${turnstileSlot()}
      <button class="btn btn-primary btn-block" type="submit">Crear cuenta y continuar al pago</button>
    </form>`
  : html`
    <form data-form="login">
      ${eyeless('email', 'Email', 'email', 'required autocomplete="username"')}
      ${eyeless('password', 'Contraseña', 'password', 'required autocomplete="current-password"')}
      <a class="login-link" href="#" data-act="auth-tab" data-tab="forgot">¿Olvidaste tu contraseña?</a>
      ${turnstileSlot()}
      <button class="btn btn-primary btn-block" type="submit">Ingresar</button>
    </form>`;
  return html`
    <div class="login-panel">
      <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:16px">
        <div class="logo-mark" aria-hidden="true"></div><strong style="font-size:1.15rem;font-weight:800">AsistOK</strong>
      </div>
      <h2>${forgot ? 'Recuperar contraseña' : reg ? 'Crear cuenta' : 'Iniciar sesión'}</h2>
      <p class="sub">${forgot ? 'Te enviamos un link al email' : reg ? 'Empezá en minutos' : 'Dueño o empleado'}</p>
      ${message ? html`<div class="alert alert-ok">${message}</div>` : ''}
      ${forgot ? '' : html`<div class="login-tabs" role="tablist" style="margin-bottom:14px">
        <button type="button" class="${reg ? '' : 'active'}" data-act="auth-tab" data-tab="login">Iniciar sesión</button>
        <button type="button" class="${reg ? 'active' : ''}" data-act="auth-tab" data-tab="reg">Registrarse</button></div>`}
      ${loginForm}
    </div>`;
}



function turnstileSlot() {
  const key = S.cfg?.turnstile_site_key;
  if (!key) return '';
  return html`<div class="form-group ts-wrap"><div class="cf-turnstile" data-sitekey="${key}" data-theme="auto"></div>
    <input type="hidden" name="turnstile_token" id="ts-token" value=""></div>`;
}
function loadTurnstile() {
  const key = S.cfg?.turnstile_site_key;
  if (!key) return;
  window.__tsToken = '';
  window.__onTs = (tok) => { window.__tsToken = tok; const el = document.getElementById('ts-token'); if (el) el.value = tok; };
  if (!document.getElementById('cf-ts-script')) {
    const s = document.createElement('script');
    s.id = 'cf-ts-script';
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => {
      document.querySelectorAll('.cf-turnstile').forEach((el) => {
        if (el.dataset.rendered) return;
        el.dataset.rendered = '1';
        try { window.turnstile.render(el, { sitekey: key, callback: window.__onTs }); } catch {}
      });
    };
    document.head.appendChild(s);
  } else if (window.turnstile) {
    document.querySelectorAll('.cf-turnstile').forEach((el) => {
      if (el.dataset.rendered) return;
      el.dataset.rendered = '1';
      try { window.turnstile.render(el, { sitekey: key, callback: window.__onTs }); } catch {}
    });
  }
}
export async function showAuth(message, opts = {}) {
  const _preserveScroll = !!opts.preserveScroll;
  // Refrescar precios/textos si la landing ya estaba abierta
  if (!opts.skipCfg) {
    try { S.cfg = await get('/api/public/config'); } catch {}
  }
  const c = S.cfg || {}, h = c.hero || {}, ct = c.contact || {};
  const reg = authTab === 'reg', forgot = authTab === 'forgot';
  // Solo se muestra WhatsApp si el Super Admin cargó un link real (Inicio web → Contacto): no hay número de ejemplo.
  const waHref = ct.wa_link || '';
  const wa = waHref ? html`<a href="${waHref}" target="_blank" rel="noopener">${ct.wa_label || 'WhatsApp'}</a>` : '';
  const loginForm = forgot ? html`
    <form data-form="forgot"><p class="muted mb">Ingresá tu email y te enviamos un link para elegir una nueva contraseña.</p>
      ${eyeless('f-email', 'Email', 'email', 'required autocomplete="email"')}
      <button class="btn btn-primary btn-block" type="submit">Enviar link</button>
      <p class="sa-link" style="text-align:center;margin-top:12px"><a href="#" data-act="auth-tab" data-tab="login">← Volver</a></p></form>`
  : reg ? html`
    <form data-form="register">
      ${eyeless('business', 'Nombre del negocio', 'text', 'required minlength="2" maxlength="80" autocomplete="organization"')}
      ${eyeless('email', 'Email', 'email', 'required autocomplete="email"')}
      ${eyeless('password', 'Contraseña (mínimo 8 caracteres)', 'password', 'required minlength="8" autocomplete="new-password"')}
      <div class="form-group"><label for="plan_tier">Plan</label><select id="plan_tier" name="plan_tier">
        <option value="esencial">Esencial</option>
        <option value="pro">Pro</option>
        <option value="completo">Completo (multi-sucursal + recibos)</option></select></div>
      <div class="form-group"><label for="plan">Facturación</label><select id="plan" name="plan">
        <option value="sub">Suscripción mensual</option>
        <option value="once">Pago único (de por vida)</option></select></div>
      ${eyeless('coupon', 'Código de descuento (opcional)', 'text', 'autocomplete="off" style="text-transform:uppercase"')}
      <p class="muted" style="font-size:.85rem;margin-bottom:10px">Incluye hasta ${c.free_employees ?? 40} empleados.</p>
      <div class="reg-trial-card" role="note">
        <div class="reg-trial-card__icon" aria-hidden="true">✦</div>
        <div>
          <div class="reg-trial-card__title">1 mes gratis en Esencial</div>
          <p class="reg-trial-card__text">Con <strong>suscripción mensual</strong> del plan Esencial, Mercado Pago pide un medio de pago y <strong>no cobra</strong> hasta que termine la prueba. Pro, Completo y pago único se cobran al activar.</p>
        </div>
      </div>
      <label class="terms-check" style="display:flex;gap:10px;align-items:flex-start;margin:12px 0 8px">
        <input type="checkbox" name="accept_terms" value="1" required style="margin-top:3px;width:18px;height:18px;flex-shrink:0">
        <span class="muted" style="font-size:.85rem;line-height:1.4">Leí y acepto los <a href="/terminos" target="_blank" rel="noopener">Términos y condiciones</a>.</span>
      </label>
      <label class="terms-check" style="display:flex;gap:10px;align-items:flex-start;margin:0 0 16px">
        <input type="checkbox" name="accept_privacy" value="1" required style="margin-top:3px;width:18px;height:18px;flex-shrink:0">
        <span class="muted" style="font-size:.85rem;line-height:1.4">Leí y acepto la <a href="/privacidad" target="_blank" rel="noopener">Política de privacidad</a>.</span>
      </label>
      <p class="muted" style="font-size:.8rem;margin:-8px 0 12px">Al registrarte te enviamos un email para <strong>confirmar tu dirección</strong>. Sin eso no podés pagar ni activar el negocio.</p>
      ${turnstileSlot()}
      <button class="btn btn-primary btn-block" type="submit">Crear cuenta y continuar al pago</button>
    </form>`
  : html`
    <form data-form="login">
      ${eyeless('email', 'Email', 'email', 'required autocomplete="username"')}
      ${eyeless('password', 'Contraseña', 'password', 'required autocomplete="current-password"')}
      <a class="login-link" href="#" data-act="auth-tab" data-tab="forgot">¿Olvidaste tu contraseña?</a>
      ${turnstileSlot()}
      <button class="btn btn-primary btn-block" type="submit">Ingresar</button>
    </form>`;

  render(html`
  <div class="ok-landing">
    ${c.payments.demo ? html`<div class="demo-banner">MODO DE PRUEBA · los pagos son simulados</div>` : ''}
    <header class="nav">
      <div class="wrap nav-inner">
        <a class="logo" href="#" data-act="go-home"><div class="logo-mark" aria-hidden="true"></div><span class="logo-text" style="font-weight:800">AsistOK</span></a>
        <nav class="nav-links">
          <a href="#producto">Producto</a>
          <a href="#soporte">Soporte</a>
          <a href="#pricing">Precios</a>
          <a href="#login" data-act="scroll-login">Ingresar</a>
        </nav>
        <div class="nav-actions">
          <button class="btn btn-outline" type="button" data-act="scroll-login">Iniciar sesión</button>
          <button class="btn btn-primary" type="button" data-act="go-register">Probar ahora</button>
        </div>
      </div>
    </header>

    <section class="hero">
      <div class="wrap grid-2">
        <div>
          <span class="hero-pill">GPS + QR · horas claras · Mercado Pago</span>
          <h1 style="margin-top:14px">Dejá la planilla.<br>Controlá quién está<br><span class="h1-last">y <span id="tw-text" class="tw-inline">recuperá tiempo</span><span class="tw-dots" aria-hidden="true">...</span></span></h1>
          <p>AsistOK es el control de asistencia online para tu negocio: marcación simple desde el celular, ubicación del local, horas y extras claras. Fácil desde el primer día.</p>
          <div class="hero-cta">
            <button class="btn btn-primary" type="button" data-act="go-register">Probar ahora</button>
            <button class="btn btn-outline" type="button" data-act="go-pricing">Ver planes</button>
            <a class="hero-link" href="#producto">Cómo funciona →</a>
          </div>
          <p class="hero-trial"><span class="hero-trial-pill">1 mes gratis</span><span class="hero-trial-txt">Plan Esencial · después se cobra el mes · cancelás cuando quieras</span></p>
          <div class="stats">
            <div class="stat"><b>QR + GPS</b><span>Marca en el local</span></div>
            <div class="stat"><b>Horas claras</b><span>Normales y extras</span></div>
            <div class="stat"><b>Avisos</b><span>Tarde, zona, permisos</span></div>
            <div class="stat"><b>Mercado Pago</b><span>Cobro simple</span></div>
          </div>
        </div>
        <div class="mock">
          <div class="mock-top"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span style="margin-left:8px">Panel en vivo · demo</span><span class="live-dot" title="En vivo"></span></div>
          <div class="mock-body live-demo" id="live-demo">
            <div class="live-jornada-card">
              <div class="muted" style="font-size:.7rem;letter-spacing:.04em;font-weight:700">MI JORNADA · HOY</div>
              <div style="font-size:1.15rem;font-weight:800;margin:4px 0">08:00 — 17:00</div>
              <div class="muted" style="font-size:.78rem">Entrada registrada: <span class="live-in">08:02</span></div>
              <div class="live-j-box">
                <div class="muted" style="font-size:.75rem">Tiempo trabajado</div>
                <div class="live-worked" style="font-size:1.25rem;font-weight:800">04 h 15 min</div>
                <div class="muted" style="font-size:.7rem">Ejemplo ilustrativo · datos simulados</div>
              </div>
              <div class="row between" style="margin-top:8px"><span class="pill pill-g live-pulse">En jornada</span><span class="live-ticker muted" style="font-size:.72rem">hace un momento</span></div>
            </div>
            <div class="live-row" style="margin-top:10px"><span>María López · caja</span><span class="pill pill-g">En jornada</span></div>
            <div class="live-row"><span>Diego Ruiz · depósito</span><span class="pill pill-e">Extra</span></div>
            <div class="live-row" style="border:0"><span>Horas del mes</span><strong class="live-num" style="color:#0f766e">164 h</strong></div>
          </div>
        </div>
      </div>
    </section>

    <section class="section reviews-section" id="valoraciones">
      <div class="wrap rev-wrap">
        <div class="rev-head">
          <span class="tag">Clientes</span>
          <span class="rev-head-title">Lo que dicen quienes usan AsistOK</span>
        </div>
      </div>
      <div class="rev-marquee" aria-label="Valoraciones">
        <div class="rev-track" id="reviews-grid"></div>
      </div>
    </section>

    <section class="section" id="login">
      <div class="wrap">
        <div class="login-panel">
          <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:16px">
            <div class="logo-mark" aria-hidden="true"></div><strong style="font-size:1.15rem;font-weight:800">AsistOK</strong>
          </div>
          <h2>${forgot ? 'Recuperar contraseña' : reg ? 'Crear cuenta' : 'Iniciar sesión'}</h2>
          <p class="sub">${forgot ? 'Te enviamos un link al email' : reg ? 'Empezá en minutos' : 'Dueño o empleado'}</p>
          ${message ? html`<div class="alert alert-ok">${message}</div>` : ''}
          ${forgot ? '' : html`<div class="login-tabs" role="tablist" style="margin-bottom:14px">
            <button type="button" class="${reg ? '' : 'active'}" data-act="auth-tab" data-tab="login">Iniciar sesión</button>
            <button type="button" class="${reg ? 'active' : ''}" data-act="auth-tab" data-tab="reg">Registrarse</button></div>`}
          ${loginForm}
        </div>
      </div>
    </section>

    <section class="section reveal-on-scroll" id="producto">
      <div class="wrap">
        <div class="section-head">
          <span class="tag">01 · Producto</span>
          <h2>Todo lo que necesitás, sin complicaciones</h2>
          <p class="lead">Marcación, horas, permisos y reportes en un solo lugar. Pensado para el local real.</p>
        </div>
        <div class="grid-3">
          <article class="feat-card"><div class="feat-icon feat-icon--mark" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="2"/><circle cx="12" cy="18" r="1"/></svg></div><h3 style="margin-bottom:8px">Marcación simple</h3><p class="muted">Desde el celular, con ubicación del local. Sin escanear si no querés.</p></article>
          <article class="feat-card"><div class="feat-icon feat-icon--clock" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></div><h3 style="margin-bottom:8px">Horas y extras</h3><p class="muted">Normales, extras y feriados. Reportes listos para Excel.</p></article>
          <article class="feat-card"><div class="feat-icon feat-icon--bell" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></svg></div><h3 style="margin-bottom:8px">Avisos al dueño</h3><p class="muted">Llegó tarde, no marcó salida o intento fuera de zona.</p></article>
          <article class="feat-card"><div class="feat-icon feat-icon--leave" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 7V3m8 4V3M3 11h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M9 15l2 2 4-4"/></svg></div><h3 style="margin-bottom:8px">Permisos y vacaciones</h3><p class="muted">Pedidos de día libre o vacaciones, con aprobación del dueño o RRHH. Recibos PDF en el plan Completo.</p></article>
          <article class="feat-card"><div class="feat-icon feat-icon--shop" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l1-4h16l1 4"/><path d="M4 9h16v11H4z"/><path d="M9 22V12h6v10"/></svg></div><h3 style="margin-bottom:8px">Multi-sucursal</h3><p class="muted">Cada local con su ubicación, QR y empleados (plan Completo).</p></article>
          <article class="feat-card"><div class="feat-icon feat-icon--pay" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg></div><h3 style="margin-bottom:8px">Mercado Pago</h3><p class="muted">Suscripción o pago único. Activás y listo.</p></article>
        </div>
      </div>
    </section>



    <section class="section reveal-on-scroll" id="panel-admin">
      <div class="wrap">
        <div class="section-head">
          <span class="tag">El panel de administración</span>
          <h2>Del fichaje a la liquidación, en un solo lugar</h2>
          <p class="lead">Todo lo que hoy armás con planillas, listo cuando lo necesitás. Tocá cada sección:</p>
        </div>
        <div class="demo-admin">
          <div class="demo-admin-list" role="tablist">
            <button type="button" class="demo-admin-item on" data-act="demo-admin" data-k="asis">
              <strong>Asistencia del día</strong>
              <span>Quién está, quién llegó tarde y quién falta.</span>
            </button>
            <button type="button" class="demo-admin-item" data-act="demo-admin" data-k="liq">
              <strong>Horas y liquidación</strong>
              <span>Normales, extras y export para sueldos.</span>
            </button>
            <button type="button" class="demo-admin-item" data-act="demo-admin" data-k="perm">
              <strong>Permisos y certificados</strong>
              <span>Pedidos del equipo y documentos en la ficha.</span>
            </button>
            <button type="button" class="demo-admin-item" data-act="demo-admin" data-k="aviso">
              <strong>Avisos automáticos</strong>
              <span>Tarde, sin salida, fuera de zona.</span>
            </button>
          </div>
          <div class="demo-admin-screen" id="demo-admin-screen">
            <div class="demo-win demo-win-light">
              <div class="demo-win-bar"><span></span><span></span><span></span><em>Panel en vivo · demo</em><i>tunegocio.asistok.app/admin</i></div>
              <div class="demo-win-body" id="demo-admin-body">
                <div class="demo-kpis">
                  <div><b>14</b><span>Trabajando</span></div>
                  <div class="warn"><b>2</b><span>Llegada tarde</span></div>
                  <div class="bad"><b>1</b><span>Ausentes</span></div>
                  <div><b>4</b><span>De franco</span></div>
                </div>
                <table class="demo-tbl">
                  <thead><tr><th>Empleado</th><th>Sucursal</th><th>Entrada</th><th>Estado</th></tr></thead>
                  <tbody>
                    <tr><td>Martina G.</td><td>Centro</td><td>07:58</td><td><span class="pill-g">En jornada</span></td></tr>
                    <tr><td>Lucas P.</td><td>Norte</td><td>08:17</td><td><span class="pill-w">+17 min</span></td></tr>
                    <tr><td>Sofía R.</td><td>Centro</td><td>08:01</td><td><span class="pill-g">En jornada</span></td></tr>
                    <tr><td>Tomás A.</td><td>Norte</td><td>—</td><td><span class="pill-x">Vacaciones</span></td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section reveal-on-scroll" id="incluye" style="background:#fff">
      <div class="wrap">
        <div class="section-head">
          <span class="tag">Todo lo que incluye</span>
          <h2>Pensado para negocios de verdad</h2>
          <p class="lead">Turnos partidos, gente que cubre francos, rotativos y varias sucursales. Lo que pasa en el día a día.</p>
        </div>
        <div class="domain-banner">
          <div class="domain-banner-ico domain-banner-logo" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="#0f766e" stroke-width="2"/><path d="M12 7v5l3 2" stroke="#0f766e" stroke-width="2" stroke-linecap="round"/></svg>
          </div>
          <div class="domain-banner-body">
            <div class="domain-brand-row"><span class="domain-brand">AsistOK</span></div>
            <strong>Tu propio sistema, con tu marca</strong>
            <p>No entrás a una plataforma genérica: tus empleados entran en tunegocio.asistok.app/app y vos en /admin, con tu logo. Y tu información vive en una base separada, que es tuya.</p>
            <div class="domain-chip">tunegocio.asistok.app</div>
          </div>
        </div>
        <div class="grid-3 mt">
          <article class="feat-card"><h3 style="margin-bottom:8px">Multi-sucursal</h3><p class="muted">Cada local con su zona GPS y su equipo (plan Completo).</p></article>
          <article class="feat-card"><h3 style="margin-bottom:8px">Roles claros</h3><p class="muted">Dueño, encargado, RRHH y contador (solo reportes, sin marcar).</p></article>
          <article class="feat-card"><h3 style="margin-bottom:8px">Corrección de marcas</h3><p class="muted">Si falló el GPS o se olvidó la salida, el dueño carga o corrige la marca.</p></article>
          <article class="feat-card"><h3 style="margin-bottom:8px">Reportes listos</h3><p class="muted">CSV, JSON e impresión PDF para el contador o la liquidación.</p></article>
          <article class="feat-card"><h3 style="margin-bottom:8px">Permisos y certs</h3><p class="muted">Día libre, vacaciones y certificados en la ficha de cada uno.</p></article>
          <article class="feat-card"><h3 style="margin-bottom:8px">Avisos que llegan</h3><p class="muted">Tarde, sin salida, fuera de zona y pedidos del equipo.</p></article>
        </div>
      </div>
    </section>

    <section class="section reveal-on-scroll" id="soporte">
      <div class="wrap">
        <div class="support">
          <span class="tag" style="background:rgba(255,255,255,.15);color:#fff">02 · Soporte</span>
          <h2 style="margin-top:12px">Estamos cuando el local está abierto</h2>
          <p class="lead">Ayuda humana por WhatsApp. Te guiamos con la ubicación, los empleados y la primera marca.</p>
          <div class="support-grid">
            <div class="support-item"><b>Respuesta rápida</b><span>En días hábiles, en el horario en que más lo necesitás.</span></div>
            <div class="support-item"><b>WhatsApp real</b><span>Hablás con una persona, no con un bot infinito.</span></div>
            <div class="support-item"><b>Hecho en Argentina</b><span>Entendemos feriados, LCT y el día a día del local.</span></div>
            <div class="support-item"><b>Puesta en marcha</b><span>Te ayudamos a cargar el local y a marcar la primera vez.</span></div>
          </div>
          ${waHref ? html`<div class="support-cta"><a class="btn-wa" href="${waHref}" target="_blank" rel="noopener">Escribinos por WhatsApp</a><span class="hint">Lun–Vie · horario comercial</span></div>` : ''}
        </div>
      </div>
    </section>

    <section class="section reveal-on-scroll" id="pricing">
      <div class="wrap" style="text-align:center">
        <div class="section-head">
          <span class="tag">03 · Planes simples</span>
          <h2>Elegí tu plan</h2>
          <p class="lead" style="margin-left:auto;margin-right:auto">Cada plan incluye una cantidad de empleados. Si el equipo crece, sumás extras o módulos sin cambiar de plan de golpe.</p>
          <p class="price-trust">Sin permanencia · cancelás cuando quieras · pagos con Mercado Pago</p>
        </div>
        <div class="billing" role="tablist" style="display:inline-flex;background:#e2e8f0;padding:4px;border-radius:999px;margin-bottom:28px">
          <button type="button" class="on" id="btn-m" data-act="bill-mode" data-mode="m" style="border:0;background:transparent;padding:8px 16px;border-radius:999px;font-weight:700;cursor:pointer">Mensual</button>
          <button type="button" id="btn-y" data-act="bill-mode" data-mode="y" style="border:0;background:transparent;padding:8px 16px;border-radius:999px;font-weight:700;cursor:pointer;color:#64748b">Pago único <span style="color:#059669;font-size:.75rem">mejor valor</span></button>
        </div>
        <div class="grid-3" style="text-align:left">
          <div class="price-card">
            <span class="price-trial-pill">1 mes gratis</span>
            <h3>Esencial</h3>
            <div class="price" data-m="${c.prices.esencial_m ?? c.prices.sub}" data-y="${c.prices.esencial_y ?? c.prices.once}">${money(c.prices.esencial_m ?? c.prices.sub)} <small>/ mes</small></div>
            <p class="muted" style="font-size:.8rem"><strong>${c.free_employees ?? 40} empleados sin cargo extra</strong> · 1 sucursal<br><span style="font-size:.75rem">Desde el 41: ${money(c.prices.extra)} c/u (pago único). Mismo cupo y precio de extra en todos los planes.</span></p>
            <ul>
              <li>Marcación panel + GPS</li>
              <li>QR opcional en el local</li>
              <li>Horas normales y extras (50% / 100%)</li>
              <li>Reportes y export CSV / PDF</li>
              <li>Notificaciones al dueño</li>
              <li>Legajo digital básico</li>
            </ul>
            <button class="btn btn-primary btn-block" type="button" data-act="pick-plan" data-tier="esencial" data-plan-billing data-billing="sub">Probar Esencial</button>
            <p class="price-trial-note muted" style="font-size:.72rem;text-align:center;margin-top:10px;line-height:1.35">Prueba 1 mes · después se cobra el plan · cancelás cuando quieras</p>
          </div>
          <div class="price-card featured">
            <span class="badge" style="position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:#4f46e5;color:#fff;font-size:.72rem;font-weight:800;padding:4px 10px;border-radius:999px">Más elegido</span>
            <h3>Pro</h3>
            <div class="price" data-m="${c.prices.pro_m ?? 55000}" data-y="${c.prices.pro_y ?? 450000}">${money(c.prices.pro_m ?? 55000)} <small>/ mes</small></div>
            <p class="muted" style="font-size:.8rem"><strong>Todo Esencial</strong> + herramientas de RRHH<br><span style="font-size:.75rem">${c.free_employees ?? 40} empleados sin cargo extra · desde el 41: ${money(c.prices.extra)} c/u</span></p>
            <ul>
              <li><strong>Todo lo de Esencial</strong></li>
              <li>Permisos, vacaciones y licencias</li>
              <li>Cierre automático de jornada</li>
              <li>Roles encargado / RRHH / contador</li>
              <li>Prioridad de soporte</li>
            </ul>
            <button class="btn btn-primary btn-block" style="background:#fff;color:#0b1220" type="button" data-act="pick-plan" data-tier="pro" data-plan-billing data-billing="sub">Activar Pro</button>
          </div>
          <div class="price-card">
            <h3>Completo</h3>
            <div class="price" data-m="${c.prices.completo_m ?? 70000}" data-y="${c.prices.completo_y ?? 560000}">${money(c.prices.completo_m ?? 70000)} <small>/ mes</small></div>
            <p class="muted" style="font-size:.8rem"><strong>Todo Pro</strong> + multi-sucursal y recibos<br><span style="font-size:.75rem">${c.free_employees ?? 40} empleados sin cargo extra · desde el 41: ${money(c.prices.extra)} c/u</span></p>
            <ul>
              <li><strong>Todo lo de Pro</strong></li>
              <li>Multi-sucursal (varios locales)</li>
              <li>Recibos de sueldo + firma del empleado</li>
              <li>Ideal para 2 o más sucursales</li>
            </ul>
            <button class="btn btn-primary btn-block" type="button" data-act="pick-plan" data-tier="completo" data-plan-billing data-billing="sub">Activar Completo</button>
          </div>
        </div>
        <div class="addons" style="text-align:left;margin-top:28px;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px">
          <h3 style="font-size:1rem;margin-bottom:10px">Módulos y extras (pago único)</h3>
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid #e2e8f0;font-size:.92rem"><span>Multi-sucursal</span><strong>${money(c.prices.mod_suc)}</strong></div>
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid #e2e8f0;font-size:.92rem"><span>Recibos de sueldo</span><strong>${money(c.prices.mod_rec)}</strong></div>
          <div style="display:flex;justify-content:space-between;padding:10px 0;border-top:1px solid #e2e8f0;font-size:.92rem;gap:12px"><span>Empleado extra <span class="muted" style="font-size:.8rem">(los primeros ${c.free_employees ?? 40} no se pagan aparte · mismo cupo en todos los planes)</span></span><strong style="white-space:nowrap">${money(c.prices.extra)} c/u</strong></div>
        </div>
      </div>
    </section>


    <section class="section sav-section reveal-on-scroll" id="tiempo">
      <div class="wrap sav-grid">
        <div>
          <h2 class="sav-title">Mirá cuánto tiempo recuperás</h2>
          <p class="muted sav-lead"><strong style="color:#0f766e">Dejá de perder horas en planillas.</strong> Contanos cómo trabajás y estimamos cuánto tiempo te devuelve AsistOK al mes.</p>
          <div class="sav-control">
            <div class="row between"><span class="muted">Empleados</span><strong id="sav-emp-val">8</strong></div>
            <input id="sav-emp" type="range" min="2" max="40" value="8" data-input="sav-recalc">
          </div>
          <div class="sav-control">
            <div class="row between"><span class="muted">Días que abrís por semana</span></div>
            <div class="sav-days" role="group">
              <button type="button" data-act="sav-days" data-d="5">5 días</button>
              <button type="button" class="on" data-act="sav-days" data-d="6">6 días</button>
              <button type="button" data-act="sav-days" data-d="7">7 días</button>
            </div>
          </div>
        </div>
        <div class="sav-result">
          <div class="muted">Por mes recuperás</div>
          <div class="sav-hours"><span id="sav-h">24</span><span class="sav-h-unit">h</span></div>
          <p class="muted" id="sav-sub">Son 3 jornadas de 8 horas para dedicarle a tu negocio.</p>
          <div class="sav-rows">
            <div class="sav-row"><span>Armar planilla / revisar marcas</span><span class="sav-old" id="sav-o1">45 min</span><span class="sav-new" id="sav-n1">5 min</span></div>
            <div class="sav-row"><span>Calcular horas y extras</span><span class="sav-old" id="sav-o2">40 min</span><span class="sav-new" id="sav-n2">3 min</span></div>
            <div class="sav-row"><span>Avisos de tarde y faltas</span><span class="sav-old" id="sav-o3">25 min</span><span class="sav-new" id="sav-n3">2 min</span></div>
          </div>
          <p class="muted" style="font-size:.78rem;margin-top:10px">Tiempo por día, a mano vs. con AsistOK. Estimación orientativa.</p>
          <button class="btn btn-primary btn-block mt" type="button" data-act="go-register">Recuperar mi tiempo</button>
        </div>
      </div>
    </section>
<section class="section reveal-on-scroll" id="faq">
      <div class="wrap" style="max-width:720px;margin:0 auto">
        <div class="section-head">
          <span class="tag">04 · Dudas</span>
          <h2>Preguntas frecuentes</h2>
        </div>
        <details class="faq-highlight"><summary>¿Hay prueba gratis?</summary><p>Sí, en el <strong>plan Esencial con suscripción mensual</strong>: 1 mes de prueba. Mercado Pago pide un medio de pago y <strong>no cobra</strong> hasta que termine la prueba. Pro, Completo y pago único se cobran al activar.</p></details><details><summary>¿Necesito instalar una app de la tienda?</summary><p>No. AsistOK funciona en el navegador del celular o la PC. Podés “Agregar a inicio” como atajo, pero no hace falta bajar nada de Play Store o App Store.</p></details><details><summary>¿Hace falta un QR en la puerta?</summary><p>No es obligatorio. El empleado puede marcar desde su panel con la ubicación activada. El QR es opcional si preferís control en la entrada o una pantalla fija.</p></details><details><summary>¿Qué incluye cada plan?</summary><p><strong>Esencial:</strong> marcación (panel/GPS/QR), horas y extras, reportes, notificaciones y legajo (1 sucursal, 40 empleados). <strong>Pro:</strong> todo Esencial + permisos/vacaciones, cierre automático y roles de gestión. <strong>Completo:</strong> todo Pro + multi-sucursal y recibos con firma. Empleados extra: mismo precio en todos los planes (pago único).</p></details><details><summary>¿Quién puede marcar asistencia?</summary><p>Empleados, encargados, RRHH y contadores. El dueño administra el negocio. Los roles de gestión (encargado, RRHH, contador) también marcan si trabajan en el local.</p></details><details><summary>¿Qué pasa cuando termina la prueba?</summary><p>Mercado Pago intenta el cobro del plan. Si se aprueba, seguís con el servicio. Si falla el pago o cancelaste, la cuenta pasa a pendiente de pago: el dueño puede regularizar; el equipo queda sin acceso hasta entonces. Los datos no se borran.</p></details><details><summary>¿Y si no hay luz o se corta internet?</summary><p>Con el celular y datos móviles pueden marcar. Si no hay red, el dueño puede corregir marcas a mano desde el panel.</p></details><details><summary>¿Puedo exportar horas para sueldos?</summary><p>Sí. Desde Reportes (incluidos ya en Esencial) exportás el período. Sirve como apoyo para armar liquidaciones; no reemplaza el consejo de tu contador.</p></details>
      </div>
    </section>

    <footer class="ok-foot">
      <div class="wrap ok-foot-inner">
        <div class="ok-foot-brand">
          <div class="ok-foot-logo"><div class="logo-mark" aria-hidden="true"></div><span>AsistOK</span></div>
          <p class="ok-foot-lead">Control de asistencia para negocios en Argentina.</p>
          <p class="ok-disclaimer">Herramienta de apoyo: los registros y documentos son responsabilidad de cada empleador. No reemplaza la LCT ni obligaciones laborales. El GPS se usa solo al marcar.</p>
        </div>
        <div class="ok-foot-cols">
          <div class="ok-foot-col">
            <div class="ok-foot-h">Producto</div>
            <a href="#producto">Características</a>
            <a href="#precios">Precios</a>
            <a href="#soporte">Soporte</a>
          </div>
          <div class="ok-foot-col">
            <div class="ok-foot-h">Legal</div>
            <a href="/privacidad">Privacidad</a>
            <a href="/terminos">Términos</a>
            <a href="/estado">Estado del servicio</a>
            <a href="#" data-act="cookies-open">Preferencias de cookies</a>
          </div>
          <div class="ok-foot-col ok-foot-contact">
            <div class="ok-foot-h">Contacto</div>
            <div class="ok-foot-contact-list">
              ${ct.email ? html`<a class="ok-foot-contact-item" href="mailto:${ct.email}"><span class="oci">✉</span><span>${ct.email}</span></a>` : html`<a class="ok-foot-contact-item" href="mailto:hola@asistok.app"><span class="oci">✉</span><span>hola@asistok.app</span></a>`}
              ${waHref ? html`<a class="ok-foot-contact-item" href="${waHref}" target="_blank" rel="noopener"><span class="oci">💬</span><span>${ct.wa_label || 'WhatsApp'}</span></a>` : ''}
              ${ct.instagram ? html`<a class="ok-foot-contact-item" href="${String(ct.instagram).startsWith('http') ? ct.instagram : 'https://instagram.com/' + String(ct.instagram).replace(/^@/, '')}" target="_blank" rel="noopener"><span class="oci">◎</span><span>${String(ct.instagram).startsWith('http') ? 'Instagram' : '@' + String(ct.instagram).replace(/^@/, '')}</span></a>` : ''}
            </div>
          </div>
        </div>
      </div>
      <div class="wrap ok-foot-bottom">
        <span>© ${new Date().getFullYear()} AsistOK · Todos los derechos reservados</span>
        <span class="ok-foot-bottom-tag">${ct.tagline || ct.copy || 'Hecho para negocios de Argentina'}</span>
      </div>
    </footer>
    <a class="wa-fab" href="${waHref || '#soporte'}" ${waHref ? raw('target="_blank" rel="noopener"') : ''} title="WhatsApp" aria-label="WhatsApp">
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
      <span>WhatsApp</span>
    </a>
  </div>`, { preserveScroll: _preserveScroll });
  ensureCookieUI();
  try { if (document.getElementById('demo-admin-body')) startDemoAdminRotate(); } catch {}

  if (reg && typeof window !== 'undefined') {
    const tier = window.__pickTier, bill = window.__pickBilling;
    if (tier) { const s = document.getElementById('plan_tier'); if (s) s.value = tier; }
    if (bill) { const s = document.getElementById('plan'); if (s) s.value = bill; }
  }
  initLandingEffects();
  if (typeof loadTurnstile === 'function') loadTurnstile();
  startLandingCfgPoll();
}

let heroTimer;
function startHero() {
  clearInterval(heroTimer);
  const slides = [...document.querySelectorAll('.hero-slide')];
  if (slides.length < 2) return;
  let i = 0;
  heroTimer = setInterval(() => { if (!document.querySelector('.hero-slide')) return clearInterval(heroTimer); slides[i].classList.remove('active'); i = (i + 1) % slides.length; slides[i].classList.add('active'); }, 6000);
}
/** ¿El bloque #login ya está a la vista? (evita scroll inútil) */
function isLoginInView() {
  const login = document.getElementById('login');
  if (!login) return false;
  const r = login.getBoundingClientRect();
  const vh = window.innerHeight || 600;
  // Visible si el panel está en pantalla (no hace falta scrollear)
  return r.top < vh * 0.75 && r.bottom > vh * 0.2;
}

function scrollToLogin(force = false) {
  const login = document.getElementById('login');
  if (!login) return;
  // Aunque sea "force" (Probar ahora / Iniciar sesión), no mueve si ya estás en el login
  if (isLoginInView()) return;
  login.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function scrollToLoginIfNeeded() { scrollToLogin(false); }

/** Mantiene el panel login en el mismo lugar visual tras re-render (cambio de pestaña) */
function keepLoginPinned(topBefore) {
  const pin = () => {
    const login = document.getElementById('login');
    if (!login || topBefore == null) return;
    const delta = login.getBoundingClientRect().top - topBefore;
    if (Math.abs(delta) > 1) window.scrollBy(0, delta);
  };
  pin();
  requestAnimationFrame(() => {
    pin();
    requestAnimationFrame(pin);
  });
}


const DEMO_ADMIN = {
  asis: `<div class="demo-kpis"><div><b>14</b><span>Trabajando</span></div><div class="warn"><b>2</b><span>Llegada tarde</span></div><div class="bad"><b>1</b><span>Ausentes</span></div><div><b>4</b><span>De franco</span></div></div>
    <table class="demo-tbl"><thead><tr><th>Empleado</th><th>Sucursal</th><th>Entrada</th><th>Estado</th></tr></thead><tbody>
    <tr><td>Martina G.</td><td>Centro</td><td>07:58</td><td><span class="pill-g">En jornada</span></td></tr>
    <tr><td>Lucas P.</td><td>Norte</td><td>08:17</td><td><span class="pill-w">+17 min</span></td></tr>
    <tr><td>Sofía R.</td><td>Centro</td><td>08:01</td><td><span class="pill-g">En jornada</span></td></tr>
    <tr><td>Tomás A.</td><td>Norte</td><td>—</td><td><span class="pill-x">Vacaciones</span></td></tr></tbody></table>`,
  liq: `<div class="demo-kpis"><div><b>280</b><span>Horas</span></div><div><b>9,5</b><span>Extras</span></div><div class="ok"><b>$ 1,4M</b><span>Bruto ej.</span></div></div>
    <table class="demo-tbl"><thead><tr><th>Empleado</th><th>Hs</th><th>Extras</th><th>Bruto*</th></tr></thead><tbody>
    <tr><td>Martina G.</td><td>88</td><td>6</td><td>$ 417.100</td></tr>
    <tr><td>Lucas P.</td><td>80</td><td>—</td><td>$ 344.000</td></tr>
    <tr><td>Sofía R.</td><td>72</td><td>3,5</td><td>$ 332.175</td></tr></tbody></table>
    <p class="demo-note">*Ejemplo ilustrativo. El valor lo define cada negocio.</p>`,
  perm: `<table class="demo-tbl"><thead><tr><th>Empleado</th><th>Pedido</th><th>Estado</th></tr></thead><tbody>
    <tr><td>Ana P.</td><td>Día libre 10/10</td><td><span class="pill-g">Aprobado</span></td></tr>
    <tr><td>Diego R.</td><td>Vacaciones dic.</td><td><span class="pill-w">Pendiente</span></td></tr>
    <tr><td>María L.</td><td>Cert. médico</td><td><span class="pill-g">En ficha</span></td></tr></tbody></table>`,
  aviso: `<table class="demo-tbl"><thead><tr><th>Aviso</th><th>Detalle</th></tr></thead><tbody>
    <tr><td>Llegó tarde</td><td>Lucas P. · +17 min</td></tr>
    <tr><td>Sin salida</td><td>Camila D. · jornada abierta</td></tr>
    <tr><td>Fuera de zona</td><td>Intento a 320 m del local</td></tr></tbody></table>`,
};
const DEMO_KEYS = ['asis', 'liq', 'perm', 'aviso'];
let _demoAdminTimer = null;
let _demoAdminIdx = 0;
function setDemoAdmin(k, userClick) {
  const body = document.getElementById('demo-admin-body');
  if (!body) return;
  body.innerHTML = DEMO_ADMIN[k] || DEMO_ADMIN.asis;
  document.querySelectorAll('.demo-admin-item').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
  _demoAdminIdx = Math.max(0, DEMO_KEYS.indexOf(k));
  if (userClick) startDemoAdminRotate();
}
function startDemoAdminRotate() {
  if (_demoAdminTimer) clearInterval(_demoAdminTimer);
  _demoAdminTimer = setInterval(() => {
    if (!document.getElementById('demo-admin-body')) { clearInterval(_demoAdminTimer); _demoAdminTimer = null; return; }
    _demoAdminIdx = (_demoAdminIdx + 1) % DEMO_KEYS.length;
    setDemoAdmin(DEMO_KEYS[_demoAdminIdx], false);
  }, 4500);
}
acts['demo-admin'] = (el) => setDemoAdmin(el.dataset.k || 'asis', true);


acts['go-home'] = async () => {
  authTab = 'login';
  if (!document.querySelector('.ok-landing')) {
    await showAuth(undefined, { skipCfg: true });
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
// Cambio Iniciar sesión / Registrarse / Olvidé: sin scroll (ancla el panel)
acts['auth-tab'] = async (el) => {
  const tab = el.dataset.tab || 'login';
  if (authTab === tab && document.querySelector('.login-panel')) return;
  authTab = tab;
  const panel = document.querySelector('.ok-landing .login-panel');
  // Solo cambia el panel: no re-renderiza la landing → cero scroll
  if (panel) {
    const topBefore = panel.getBoundingClientRect().top;
    const y = window.scrollY;
    panel.outerHTML = buildAuthPanel().toString();
    const pin = () => {
      const p2 = document.querySelector('.ok-landing .login-panel');
      if (!p2) { window.scrollTo(0, y); return; }
      const delta = p2.getBoundingClientRect().top - topBefore;
      if (Math.abs(delta) > 0.5) window.scrollBy(0, delta);
    };
    pin();
    requestAnimationFrame(() => { pin(); requestAnimationFrame(pin); });
    if (typeof loadTurnstile === 'function') loadTurnstile();
    if (authTab === 'reg' && typeof window !== 'undefined') {
      const tier = window.__pickTier, bill = window.__pickBilling;
      if (tier) { const s = document.getElementById('plan_tier'); if (s) s.value = tier; }
      if (bill) { const s = document.getElementById('plan'); if (s) s.value = bill; }
    }
    return;
  }
  await showAuth(undefined, { skipCfg: true, preserveScroll: true });
};
// CTAs: scrollean solo si el login NO está a la vista
acts['go-register'] = async () => {
  authTab = 'reg';
  if (document.querySelector('.ok-landing .login-panel')) {
    const panel = document.querySelector('.ok-landing .login-panel');
    panel.outerHTML = buildAuthPanel().toString();
    if (typeof loadTurnstile === 'function') loadTurnstile();
    if (typeof window !== 'undefined') {
      const tier = window.__pickTier, bill = window.__pickBilling;
      if (tier) { const s = document.getElementById('plan_tier'); if (s) s.value = tier; }
      if (bill) { const s = document.getElementById('plan'); if (s) s.value = bill; }
    }
  } else if (!document.getElementById('login')) {
    await showAuth(undefined, { skipCfg: true });
  }
  setTimeout(() => scrollToLogin(true), 40);
};
function bindLandingNavGlass() {
  const nav = document.querySelector('.ok-landing .nav');
  if (!nav) return;
  if (nav.dataset.glassBound) {
    nav.classList.toggle('nav-scrolled', window.scrollY > 8);
    return;
  }
  nav.dataset.glassBound = '1';
  const onScroll = () => nav.classList.toggle('nav-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}
acts['go-pricing'] = () => {
  document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
acts['bill-mode'] = (el) => {
  const mode = el.dataset.mode;
  document.getElementById('btn-m')?.classList.toggle('on', mode === 'm');
  document.getElementById('btn-y')?.classList.toggle('on', mode === 'y');
  document.querySelectorAll('.price[data-m]').forEach((node) => {
    const v = mode === 'm' ? node.dataset.m : node.dataset.y;
    const label = mode === 'm' ? '/ mes' : ' pago único';
    node.innerHTML = '$ ' + Number(v).toLocaleString('es-AR') + ' <small>' + label + '</small>';
  });
  document.querySelectorAll('[data-plan-billing]').forEach((b) => {
    b.dataset.billing = mode === 'y' ? 'once' : 'sub';
    // Solo Esencial tiene trial en mensual
    if (b.dataset.tier === 'esencial') b.textContent = mode === 'm' ? 'Probar Esencial' : 'Activar Esencial';
  });
  document.querySelectorAll('.price-trial-pill, .price-trial-note').forEach((n) => {
    n.style.display = mode === 'm' ? '' : 'none';
  });
};
acts['pick-plan'] = async (el) => {
  authTab = 'reg';
  window.__pickTier = el.dataset.tier || 'esencial';
  window.__pickBilling = el.dataset.billing || 'sub';
  await showAuth(undefined, { skipCfg: true });
  setTimeout(() => scrollToLogin(true), 80);
};
acts['scroll-login'] = async () => {
  authTab = 'login';
  if (document.querySelector('.ok-landing .login-panel')) {
    document.querySelector('.ok-landing .login-panel').outerHTML = buildAuthPanel().toString();
    if (typeof loadTurnstile === 'function') loadTurnstile();
  } else if (!document.getElementById('login')) {
    await showAuth(undefined, { skipCfg: true });
  }
  setTimeout(() => scrollToLogin(true), 40);
};


forms.login = async (v) => {
  const r = await post('/api/auth/login', { email: v.email, password: v.password, turnstile_token: v.turnstile_token || window.__tsToken || '' });
  S.me = null; await boot();
};
forms.register = async (v) => {
  if (!v.accept_terms) throw Object.assign(new Error('Tenés que aceptar los Términos y condiciones'), { status: 400 });
  if (!v.accept_privacy) throw Object.assign(new Error('Tenés que aceptar la Política de privacidad'), { status: 400 });
  await post('/api/auth/register', { ...v, accept_terms: true, accept_privacy: true, turnstile_token: v.turnstile_token || window.__tsToken || '' });
  await boot();
};
forms.forgot = async (v) => { await post('/api/auth/forgot', { email: v.email }); authTab = 'login'; await showAuth('Si el email existe, te enviamos un link para recuperar tu contraseña.'); };
acts['boot-retry'] = () => location.reload();
acts.logout = async () => { await post('/api/auth/logout'); S.me = null; S.markCode = null; authTab = 'login'; cleanUrl(); applyTheme(); await showAuth(); };
acts.dark = () => { toggleDark(); };

// ---------- Cambio de contraseña ----------
export function changePasswordScreen(forced) {
  const body = html`<form data-form="chpw">
    <h2 style="font-size:1.1rem;margin-bottom:6px">${forced ? 'Elegí tu contraseña' : 'Cambiar contraseña'}</h2>
    ${forced ? html`<p class="muted mb">Por seguridad tenés que reemplazar la contraseña temporal que te dio tu empleador antes de continuar.</p>` : ''}
    ${eyeless('current', forced ? 'Contraseña temporal' : 'Contraseña actual', 'password', 'required autocomplete="current-password"')}
    ${eyeless('password', 'Nueva contraseña (mínimo 8)', 'password', 'required minlength="8" autocomplete="new-password"')}
    ${forced ? html`
      <label class="terms-check" style="display:flex;gap:10px;align-items:flex-start;margin:12px 0 8px">
        <input type="checkbox" name="accept_terms" value="1" required style="margin-top:3px;width:18px;height:18px;flex-shrink:0">
        <span class="muted" style="font-size:.85rem;line-height:1.4">Leí y acepto los <a href="/terminos" target="_blank" rel="noopener">Términos y condiciones</a>.</span>
      </label>
      <label class="terms-check" style="display:flex;gap:10px;align-items:flex-start;margin:0 0 16px">
        <input type="checkbox" name="accept_privacy" value="1" required style="margin-top:3px;width:18px;height:18px;flex-shrink:0">
        <span class="muted" style="font-size:.85rem;line-height:1.4">Leí y acepto la <a href="/privacidad" target="_blank" rel="noopener">Política de privacidad</a>.</span>
      </label>` : ''}
    <button class="btn btn-primary btn-block" type="submit">Guardar</button>
    ${forced ? html`<button class="btn btn-outline btn-block mt" type="button" data-act="logout">Cerrar sesión</button>` : html`<button class="btn btn-outline btn-block mt" type="button" data-act="close-modal">Cancelar</button>`}</form>`;
  if (forced) render(html`<div class="page-center"><div class="card form-card">${body}</div></div>`); else openModal(body);
}
forms.chpw = async (v) => {
  if (S.me?.user?.must_change_pw) {
    if (!v.accept_terms) throw Object.assign(new Error('Tenés que aceptar los Términos y condiciones'), { status: 400 });
    if (!v.accept_privacy) throw Object.assign(new Error('Tenés que aceptar la Política de privacidad'), { status: 400 });
  }
  await post('/api/auth/password', {
    current: v.current,
    password: v.password,
    accept_terms: !!v.accept_terms,
    accept_privacy: !!v.accept_privacy,
  });
  closeModal();
  toast('Contraseña actualizada');
  await boot();
};
acts['close-modal'] = () => closeModal();
acts['change-pw'] = () => changePasswordScreen(false);

// ---------- Pago ----------
function paymentScreen(statusMsg) {
  const { tenant, prices } = S.me;
  const base = tenant.plan === 'once' ? prices.once : prices.sub;
  const pct = tenant.discount_months > 0 || tenant.plan === 'once' ? tenant.discount_pct : 0;
  const total = Math.round(base * (1 - pct / 100));
  const demo = S.cfg.payments.demo;
  render(html`<div class="page-center"><div class="form-card card">
    <h2 style="font-size:1.1rem;margin-bottom:4px">Activá tu cuenta</h2>
    <p class="muted mb">${tenant.name}</p>
    ${statusMsg ? html`<div class="alert alert-warn">${statusMsg}</div>` : ''}
    ${S.cfg.email_verification && !S.me.user.email_verified ? html`<div class="alert alert-warn">Antes de pagar tenés que confirmar tu email: te enviamos un link a ${S.me.user.email}. <button class="link" type="button" data-act="resend-verify">Reenviar email</button></div>` : ''}
    ${tenant.status === 'past_due' ? html`<div class="alert alert-warn">Tu suscripción no está al día. Regularizá el pago para volver a usar el panel.</div>` : ''}
    <div class="summary">
      <div class="summary-row"><span>${tenant.plan === 'once' ? 'Licencia pago único' : 'Suscripción mensual'}</span><span>${money(base)}</span></div>
      ${pct ? html`<div class="summary-row"><span>Descuento ${pct}%${tenant.discount_months && tenant.plan === 'sub' ? ` (${tenant.discount_months} meses)` : ''}</span><span>− ${money(base - total)}</span></div>` : ''}
      <div class="summary-row summary-total"><span>Total${tenant.plan === 'sub' ? ' (primer mes)' : ''}</span><strong>${money(total)}</strong></div></div>
    <div class="secure-note"><span>🔒</span><div>Pago procesado por <strong>Mercado Pago</strong>. No guardamos datos de tu tarjeta.</div></div>
    ${tenant.plan === 'sub' && (tenant.plan_tier || 'esencial') === 'esencial' ? html`
    <p class="muted mb" style="font-size:.88rem;line-height:1.45">🎁 <strong>1 mes de prueba gratis</strong> en plan Esencial. Mercado Pago pide un medio de pago y <strong>no cobra nada</strong> hasta que termine. Si cancelás antes, no se debita.</p>
    <button class="btn btn-mp btn-block" data-act="checkout" data-kind="plan" type="button">${demo ? 'Activar prueba (modo demo)' : 'Probar 1 mes gratis con Mercado Pago'}</button>` : html`
    <button class="btn btn-mp btn-block" data-act="checkout" data-kind="plan" type="button">${demo ? 'Pagar (modo prueba)' : 'Pagar con Mercado Pago'}</button>`}
    <button class="btn btn-outline btn-block mt" data-act="logout" type="button">Cerrar sesión</button>
  </div></div>`);
}
export async function startCheckout(kind, qty, tier) {
  const r = await post('/api/pay/checkout', { kind, qty, tier });
  if (r.demo) { location.href = r.url; return; }
  if (r.url) { location.href = r.url; return; }
  toast(r.note || 'No se pudo iniciar el pago');
}
acts.checkout = (el) => startCheckout(el.dataset.kind, el.dataset.qty ? Number(el.dataset.qty) : undefined, el.dataset.tier);

function demoPayScreen(ref) {
  render(html`<div class="demo-banner">MODO DE PRUEBA · no se cobra nada</div><div class="page-center"><div class="form-card card" style="text-align:center">
    <div class="mp-logo-big">Mercado Pago</div><p class="muted mb">Simulación de checkout</p>
    <button class="btn btn-mp btn-block" data-act="demo-pay" data-ref="${ref}" type="button">Pagar ahora</button>
    <button class="btn btn-outline btn-block mt" data-act="demo-cancel" type="button">Cancelar</button></div></div>`);
}
acts['demo-pay'] = async (el) => { await post('/api/pay/demo-confirm', { ref: el.dataset.ref }); cleanUrl(); q.delete('demo_pay'); toast('Pago aprobado'); await boot(); };
acts['demo-cancel'] = () => { cleanUrl(); location.reload(); };

// ---------- Cookies (banner + preferencias) ----------
function cookiePrefsModal() {
  const c = getCookieConsent() || { analytics: false, marketing: false };
  openModal(html`<div class="row between mb"><h3 style="margin:0">Preferencias de cookies</h3><button class="btn btn-outline btn-sm" data-act="close-modal" type="button" aria-label="Cerrar">✕</button></div>
    <p class="muted mb" style="font-size:.88rem;line-height:1.45">Elegí qué categorías de cookies querés permitir. Podés cambiar esta decisión cuando quieras desde el enlace <strong>Preferencias de cookies</strong> en el pie de página.</p>
    <div class="cookie-cat">
      <div class="row between"><strong>Necesarias</strong><span class="muted" style="font-size:.8rem">Siempre activas</span></div>
      <p class="muted" style="font-size:.82rem;margin-top:4px">Imprescindibles para el funcionamiento del sitio: sesión, autenticación y seguridad. Son cookies técnicas (HttpOnly) y no se pueden desactivar.</p>
    </div>
    <div class="cookie-cat">
      <div class="row between"><strong>Analíticas</strong>
        <label class="switch"><input type="checkbox" id="ck-analytics" ${c.analytics ? raw('checked') : ''}><span class="slider"></span></label>
      </div>
      <p class="muted" style="font-size:.82rem;margin-top:4px">Hoy AsistOK <strong>no carga</strong> herramientas de medición de terceros. Si en el futuro se activan (por ejemplo para mejorar el producto), esta opción controlará si se permiten.</p>
    </div>
    <div class="cookie-cat">
      <div class="row between"><strong>Marketing</strong>
        <label class="switch"><input type="checkbox" id="ck-marketing" ${c.marketing ? raw('checked') : ''}><span class="slider"></span></label>
      </div>
      <p class="muted" style="font-size:.82rem;margin-top:4px">Hoy AsistOK <strong>no usa</strong> píxeles de publicidad (Meta, TikTok, etc.). Si se integran más adelante, esta opción decidirá si se habilitan.</p>
    </div>
    <button class="btn btn-primary btn-block mt" type="button" data-act="cookies-save">Guardar preferencias</button>
    <button class="btn btn-outline btn-block mt" type="button" data-act="cookies-reject">Rechazar todas (solo necesarias)</button>`);
}
function ensureCookieUI() {
  applyCookieConsent();
  if (hasCookieDecision()) {
    const b = document.getElementById('cookie-banner');
    if (b) b.remove();
    return;
  }
  if (document.getElementById('cookie-banner')) return;
  const bar = document.createElement('div');
  bar.id = 'cookie-banner';
  bar.className = 'cookie-banner';
  bar.innerHTML = html`<div class="cookie-banner-inner">
    <p><strong>Usamos cookies necesarias</strong> para que puedas iniciar sesión y usar AsistOK con seguridad. No cargamos analíticas ni publicidad de terceros por defecto. Podés gestionar tus preferencias.</p>
    <div class="cookie-banner-actions">
      <button type="button" class="btn btn-primary btn-sm" data-act="cookies-accept">Aceptar</button>
      <button type="button" class="btn btn-outline btn-sm" data-act="cookies-reject">Solo necesarias</button>
      <button type="button" class="btn btn-outline btn-sm" data-act="cookies-open">Preferencias</button>
    </div>
  </div>`.toString();
  document.body.appendChild(bar);
}
acts['cookies-open'] = (e) => { if (e && e.preventDefault) e.preventDefault(); cookiePrefsModal(); };
acts['cookies-accept'] = () => {
  setCookieConsent({ analytics: true, marketing: true });
  applyCookieConsent();
  document.getElementById('cookie-banner')?.remove();
  closeModal();
  toast('Preferencias guardadas');
};
acts['cookies-reject'] = () => {
  setCookieConsent({ analytics: false, marketing: false });
  applyCookieConsent();
  document.getElementById('cookie-banner')?.remove();
  closeModal();
  toast('Solo cookies necesarias');
};
acts['cookies-save'] = () => {
  const analytics = !!document.getElementById('ck-analytics')?.checked;
  const marketing = !!document.getElementById('ck-marketing')?.checked;
  setCookieConsent({ analytics, marketing });
  applyCookieConsent();
  document.getElementById('cookie-banner')?.remove();
  closeModal();
  toast('Preferencias guardadas');
};


async function statusPage() {
  let h = { ok: false };
  try { h = await get('/api/health'); } catch (e) { h = { ok: false, error: e.message }; }
  const ok = !!h.ok;
  const row = (label, status, detail) => html`<div class="st-row">
    <div class="st-row__label">${label}</div>
    <div class="st-row__right"><span class="st-pill st-pill--${status}">${status === 'ok' ? 'Operativo' : status === 'warn' ? 'Parcial' : 'Caído'}</span>
    ${detail ? html`<span class="st-detail">${detail}</span>` : ''}</div>
  </div>`;
  // Componentes reales del producto (honestos con lo que corre hoy)
  const features = [
    { name: 'Marcación (panel + GPS)', status: 'ok', note: 'Disponible' },
    { name: 'QR en puerta / pantalla', status: 'ok', note: 'Disponible' },
    { name: 'Horas, extras y reportes', status: 'ok', note: 'Disponible' },
    { name: 'Permisos y vacaciones', status: 'ok', note: 'Disponible' },
    { name: 'Multi-sucursal', status: 'ok', note: 'Plan Completo' },
    { name: 'Recibos de sueldo (PDF)', status: 'ok', note: 'Plan Completo' },
    { name: 'Importar / exportar CSV', status: 'ok', note: 'Disponible' },
    { name: 'Cobros Mercado Pago', status: h.mp ? 'ok' : 'warn', note: h.mp ? 'Conectado' : 'Sin token (modo demo o pendiente)' },
    { name: 'Emails transaccionales', status: h.mail ? 'ok' : 'warn', note: h.mail ? 'Configurado' : 'Sin proveedor de mail' },
    { name: 'App nativa en tiendas', status: 'warn', note: 'No aplica · es web / PWA' },
  ];
  render(html`<main class="status-page">
    <div class="status-page__inner">
      <a href="/" class="btn btn-outline btn-sm mb">← Volver al inicio</a>
      <div class="status-hero card ${ok ? 'status-hero--ok' : 'status-hero--down'}">
        <div class="status-hero__dot" aria-hidden="true"></div>
        <h1>Estado de AsistOK</h1>
        <p>${ok ? 'Los sistemas principales responden con normalidad.' : 'Hay un problema para llegar a la API o la base de datos.'}</p>
        <p class="muted" style="font-size:.8rem;margin:8px 0 0">Actualizado ${h.time ? new Date(h.time).toLocaleString('es-AR') : new Date().toLocaleString('es-AR')}</p>
      </div>
      <div class="card st-card">
        <h2 class="st-h">Infraestructura</h2>
        ${row('API y base de datos', h.db === 'up' ? 'ok' : 'down', h.db === 'up' ? 'Respondiendo' : (h.error || 'Sin respuesta'))}
        ${row('Mercado Pago', h.mp ? 'ok' : 'warn', h.mp ? 'Credenciales cargadas' : 'No configurado')}
        ${row('Correo (Resend)', h.mail ? 'ok' : 'warn', h.mail ? 'Listo para enviar' : 'No configurado')}
        ${row('CAPTCHA (Turnstile)', h.turnstile ? 'ok' : 'warn', h.turnstile ? 'Activo' : 'Desactivado')}
        ${row('Último backup', h.backup?.at ? (h.backup.ok === false ? 'warn' : 'ok') : 'warn', h.backup?.at ? new Date(h.backup.at).toLocaleString('es-AR') : 'Sin registro')}
      </div>
      <div class="card st-card">
        <h2 class="st-h">Funciones del producto</h2>
        <p class="muted mb" style="font-size:.82rem">Qué podés usar hoy en la plataforma (no es marketing: refleja el estado real).</p>
        ${features.map((f) => row(f.name, f.status, f.note))}
      </div>
      <p class="muted" style="font-size:.8rem;text-align:center;margin-top:16px">Si ves algo caído en tu negocio y acá figura operativo, escribinos por el canal de soporte.</p>
    </div>
  </main>`);
}
// ---------- Páginas simples ----------
async function legalPage(kind) {
  const l = await get('/api/public/legal');
  render(html`<main class="dash-body"><a href="/" class="btn btn-outline btn-sm mb">← Volver</a><div class="card"><h1 style="font-size:1.2rem;margin-bottom:10px">${kind === 'terminos' ? 'Términos y condiciones' : 'Política de privacidad'}</h1>${l.placeholder ? html`<div class="alert alert-warn mb">Texto provisional: todavía no es la versión definitiva y puede cambiar.</div>` : ''}<div class="legal">${raw(kind === 'terminos' ? l.terms_html : l.privacy_html)}</div></div></main>`);
}
async function joinPage(slug) {
  let t; try { t = await get('/api/public/tenant/' + encodeURIComponent(slug)); } catch (e) { return render(html`<div class="page-center"><div class="card form-card"><p>${e.message}</p><a href="/" class="btn btn-outline btn-block mt">Ir al inicio</a></div></div>`); }
  render(html`<div class="page-center"><div class="card form-card"><h2 style="font-size:1.1rem">Sumate a ${t.name}</h2>
    <p class="muted mb">Completá tus datos. Tu empleador tiene que autorizarte antes de que puedas marcar asistencia.</p>
    <form data-form="join" data-slug="${t.slug}">
      ${eyeless('name', 'Nombre y apellido', 'text', 'required minlength="2" autocomplete="name"')}
      ${eyeless('email', 'Email', 'email', 'required autocomplete="email"')}
      ${eyeless('password', 'Contraseña (mínimo 8)', 'password', 'required minlength="8" autocomplete="new-password"')}
      <button class="btn btn-primary btn-block" type="submit">Solicitar acceso</button></form></div></div>`);
}
forms.join = async (v, f) => { await post('/api/public/join/' + f.dataset.slug, v); render(html`<div class="page-center"><div class="card form-card" style="text-align:center"><div class="success-icon">✓</div><h2 style="font-size:1.1rem">Solicitud enviada</h2><p class="muted mt">${S.cfg.email_verification ? 'Te enviamos un email para confirmar tu dirección: abrí el link. ' : ''}Cuando tu empleador te autorice vas a poder ingresar con tu email y contraseña.</p></div></div>`); };

// H2: confirmación de email desde el link del correo
async function verifyPage(token) {
  render(html`<div class="page-center"><div class="card form-card" style="text-align:center"><p class="muted">Confirmando tu email…</p></div></div>`);
  try {
    await post('/api/auth/verify-email', { token });
    cleanUrl(); q.delete('verify');
    render(html`<div class="page-center"><div class="card form-card" style="text-align:center"><div class="success-icon">✓</div><h2 style="font-size:1.1rem">¡Email confirmado!</h2><p class="muted mt">Ya podés seguir. Si pediste acceso a un negocio, avisale a tu empleador que te autorice.</p><a href="/" class="btn btn-primary btn-block mt">Continuar</a></div></div>`);
  } catch (e) {
    render(html`<div class="page-center"><div class="card form-card" style="text-align:center"><h2 style="font-size:1.1rem">No pudimos confirmar tu email</h2><p class="muted mt">${e.message}</p><a href="/" class="btn btn-outline btn-block mt">Ir al inicio</a></div></div>`);
  }
}
acts['resend-verify'] = async () => { await post('/api/auth/resend-verification'); toast('Te enviamos el email de confirmación. Revisá tu bandeja (y la carpeta de spam).', 6000); };

function resetPage(token) {
  render(html`<div class="page-center"><div class="card form-card"><h2 style="font-size:1.1rem;margin-bottom:10px">Nueva contraseña</h2>
    <form data-form="reset" data-token="${token}">${eyeless('password', 'Nueva contraseña (mínimo 8)', 'password', 'required minlength="8" autocomplete="new-password"')}
    <button class="btn btn-primary btn-block" type="submit">Guardar</button></form></div></div>`);
}
forms.reset = async (v, f) => { await post('/api/auth/reset', { token: f.dataset.token, password: v.password }); cleanUrl(); authTab = 'login'; await showAuth('Listo. Ya podés ingresar con tu nueva contraseña.'); };

// ---------- Sugerencias y reportes (dueño y empleado) ----------
acts['feedback-open'] = (el) => openModal(html`<h3 style="margin-bottom:4px">Reportar un problema o enviar una idea</h3><p class="muted mb">Lo lee el equipo de AsistOK. No hace falta que sea perfecto.</p>
  <form data-form="feedback" data-ctx="${el.dataset.ctx || ''}">
    <div class="form-group"><label for="fb-kind">¿Qué querés contarnos?</label><select id="fb-kind" name="kind"><option value="problem">Tuve un problema</option><option value="idea">Tengo una idea</option></select></div>
    <div class="form-group"><label for="fb-subject">Título corto</label><input id="fb-subject" name="subject" required minlength="3" maxlength="120"></div>
    <div class="form-group"><label for="fb-body">Detalle (qué pasó o qué te gustaría)</label><textarea id="fb-body" name="body" required minlength="10" maxlength="2000" rows="5"></textarea></div>
    <button class="btn btn-primary btn-block" type="submit">Enviar</button><button class="btn btn-outline btn-block mt" type="button" data-act="close-modal">Cancelar</button></form>`);
forms.feedback = async (v, f) => { await post('/api/feedback', { ...v, page_context: f.dataset.ctx }); closeModal(); toast('¡Gracias! Recibimos tu mensaje.'); };

// ---------- Arranque ----------
async function waitPayment() {
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const me = await get('/api/auth/me'); S.me = me;
    if (me.tenant?.status === 'active') return true;
  }
  return false;
}

export function applyPortalChrome() {
  const mode = pathEntryMode();
  document.body.dataset.entry = mode;
  const slug = pathTenantSlug();
  if (slug) document.body.dataset.tenantSlug = slug;
  // Empleados: ocultar registro de negocios y marketing pesado si existe
  if (mode === 'employee') {
    document.querySelectorAll('[data-auth-tab="register"], [data-act="go-register"], .nav-cta-register').forEach((el) => {
      el.style.display = 'none';
    });
    const loginBtn = document.querySelector('[data-auth-tab="login"]');
    if (loginBtn) loginBtn.click?.();
  }
  if (mode === 'admin') {
    // solo login de personal del negocio (dueño/RRHH); registro de nuevos SaaS clientes no
    document.querySelectorAll('[data-auth-tab="register"]').forEach((el) => { el.style.display = 'none'; });
  }
}
async function boot() {
  try { applyPortalChrome(); } catch {}

  try {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  // Siempre pedir config fresca (precios, textos, empleados incluidos, etc.)
  try { S.cfg = await get('/api/public/config'); } catch (e) { if (!S.cfg) throw e; }
  if (path.startsWith('/pantalla/')) return renderDisplay(path.split('/')[2]);
  if (path === '/estado') { await statusPage(); return; }
  if (path === '/terminos' || path === '/privacidad') { await legalPage(path.slice(1)); ensureCookieUI(); return; }
  if (path.startsWith('/alta/')) return joinPage(path.split('/')[2]);
  if (q.get('verify')) return verifyPage(q.get('verify'));
  if (q.get('reset')) return resetPage(q.get('reset'));
  const mk = path.startsWith('/m/') ? path.slice(3) : null;
  if (mk) S.markCode = mk;
  if (q.get('demo_pay') && (await get('/api/auth/me')).user) return demoPayScreen(q.get('demo_pay'));

  const me = await get('/api/auth/me');
  S.me = me.user ? me : null;
  applyTheme();
  if (!S.me) { await showAuth(S.markCode ? 'Ingresá para marcar tu asistencia.' : undefined, { skipCfg: true }); ensureCookieUI(); return; }

  const { user, tenant } = S.me;
  if (user.role === 'superadmin') return renderAdmin();
  if (user.must_change_pw) return changePasswordScreen(true);
  if (tenant.status === 'suspended') return render(html`<div class="page-center"><div class="card form-card"><h2 style="font-size:1.1rem">Cuenta suspendida</h2><p class="muted mt">El acceso de ${tenant.name} está suspendido. Contactá a soporte.</p><button class="btn btn-outline btn-block mt" data-act="logout">Cerrar sesión</button></div></div>`);
  if (tenant.status !== 'active') {
    if (user.role === 'employee') return render(html`<div class="page-center"><div class="card form-card"><p>El negocio todavía no está activo. Consultá con tu empleador.</p><button class="btn btn-outline btn-block mt" data-act="logout">Cerrar sesión</button></div></div>`);
    if (q.get('pay') === 'ok' || q.get('pay') === 'pending') {
      paymentScreen('Estamos confirmando tu pago con Mercado Pago. Esto puede tardar un minuto…');
      cleanUrl(); q.delete('pay');
      if (await waitPayment()) { toast('¡Pago confirmado!'); return boot(); }
      return paymentScreen('Todavía no recibimos la confirmación. Si ya pagaste, recargá en unos minutos.');
    }
    return paymentScreen(q.get('pay') === 'fail' ? 'El pago no se completó. Podés intentarlo de nuevo.' : '');
  }
  if (q.get('pay')) { toast('Pago recibido'); cleanUrl(); q.delete('pay'); }
  if (user.role === 'owner' || user.role === 'manager' || user.role === 'hr' || user.role === 'accountant') return await renderOwner();
  if (S.markCode) return renderMark();
  return renderEmployee();
  } catch (err) {
    console.error('[boot]', err);
    const msg = (err && err.message) ? err.message : 'Error al cargar';
    render(html`<div class="page-center"><div class="card form-card">
      <h2 style="font-size:1.1rem">No se pudo cargar</h2>
      <p class="muted mt">${msg}</p>
      <p class="muted" style="font-size:.8rem">Si ves errores de Content Security Policy en la consola por utils.js / injectScript, suele ser una extensión del navegador (no AsistOK). Probá en ventana de incógnito.</p>
      <button class="btn btn-primary btn-block mt" type="button" data-act="boot-retry">Reintentar</button>
      <button class="btn btn-outline btn-block mt" data-act="logout" type="button">Cerrar sesión</button>
    </div></div>`);
  }
}


// ---------- Landing: typewriter + calculadora ----------
let _twTimer = null;
let _liveTimer = null;

function initLandingEffects() {
  bindLandingNavGlass();
  startTypewriter();
  startLiveDemo();
  loadReviews();
  bindSectionReveal();
  bindSavCalculator();
  savRecalc();
}

function bindSavCalculator() {
  const range = document.getElementById('sav-emp');
  if (!range) return;
  const run = () => savRecalc();
  // input + change + touch: en móvil a veces solo dispara uno
  range.oninput = run;
  range.onchange = run;
  range.ontouchend = run;
  range.onpointerup = run;
  // días: por si el data-act no llega
  document.querySelectorAll('.sav-days button').forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      window.__savDays = Number(btn.dataset.d) || 6;
      document.querySelectorAll('.sav-days button').forEach((b) => b.classList.toggle('on', b === btn));
      savRecalc();
    };
  });
}

function startTypewriter() {
  if (_twTimer) { clearTimeout(_twTimer); _twTimer = null; }
  const el = document.getElementById('tw-text');
  const dots = document.querySelector('.tw-dots');
  if (!el) return;
  const phrases = [
    'recuperá tiempo.',
    'ordená el equipo.',
    'evitá planillas.',
    'controlá el local.',
    'simplificá marcas.',
    'mirá las horas.',
  ];
  let pi = 0;
  let ci = 0;
  let mode = 'type'; // type | pause | erase

  const tick = () => {
    const node = document.getElementById('tw-text');
    if (!node) { _twTimer = null; return; }
    const phrase = phrases[pi];
    if (mode === 'type') {
      ci++;
      node.textContent = phrase.slice(0, ci);
      if (dots) dots.style.opacity = ci >= phrase.length ? '1' : '0';
      if (ci >= phrase.length) {
        mode = 'pause';
        _twTimer = setTimeout(tick, 2000);
        return;
      }
      _twTimer = setTimeout(tick, 45);
    } else if (mode === 'pause') {
      mode = 'erase';
      if (dots) dots.style.opacity = '0';
      _twTimer = setTimeout(tick, 200);
    } else {
      ci--;
      node.textContent = phrase.slice(0, Math.max(0, ci));
      if (ci <= 0) {
        pi = (pi + 1) % phrases.length;
        mode = 'type';
        _twTimer = setTimeout(tick, 300);
        return;
      }
      _twTimer = setTimeout(tick, 25);
    }
  };
  el.textContent = '';
  if (dots) {
    dots.textContent = '...';
    dots.style.opacity = '0';
    dots.classList.add('blink');
  }
  _twTimer = setTimeout(tick, 400);
}

function startLiveDemo() {
  if (_liveTimer) clearInterval(_liveTimer);
  const root = document.getElementById('live-demo');
  if (!root) return;
  // Estados que rotan en las 2 filas (antes solo se actualizaba la 1ª y Diego quedaba fijo en Extra)
  const pool = [
    ['María López · caja', 'pill-g', 'En jornada'],
    ['Diego Ruiz · depósito', 'pill-e', 'Extra'],
    ['Andrea Paz · atención', 'pill-x', 'Fuera'],
    ['Lucía Méndez · cocina', 'pill-g', 'En jornada'],
    ['Pablo Sosa · delivery', 'pill-x', 'Fuera'],
    ['Diego Ruiz · depósito', 'pill-g', 'En jornada'],
    ['María López · caja', 'pill-e', 'Extra'],
    ['Sofía Ríos · depósito', 'pill-g', 'En jornada'],
  ];
  let i = 0, hours = 164, extra = 2.5;
  _liveTimer = setInterval(() => {
    if (!document.getElementById('live-demo')) { clearInterval(_liveTimer); return; }
    i = (i + 1) % pool.length;
    const rows = root.querySelectorAll('.live-row');
    // Fila 0 y 1 = empleados; fila 2 = horas del mes (no tocar el label)
    if (rows[0]) {
      const [n, cls, st] = pool[i];
      rows[0].innerHTML = '<span>' + n + '</span><span class="pill ' + cls + '">' + st + '</span>';
    }
    if (rows[1]) {
      const [n2, cls2, st2] = pool[(i + 3) % pool.length];
      rows[1].innerHTML = '<span>' + n2 + '</span><span class="pill ' + cls2 + '">' + st2 + '</span>';
    }
    hours += Math.random() > 0.55 ? 0.5 : 0;
    extra = Math.round((extra + (Math.random() * 0.25 - 0.05)) * 10) / 10;
    const hn = root.querySelector('.live-num');
    const he = root.querySelector('.live-extra');
    const tickEl = root.querySelector('.live-ticker');
    if (hn) hn.textContent = Math.round(hours) + ' h';
    if (he) he.textContent = '+' + extra.toFixed(1).replace('.', ',') + ' h';
    if (tickEl) tickEl.textContent = 'hace ' + (1 + Math.floor(Math.random() * 5)) + ' min';
    const worked = root.querySelector('.live-worked');
    if (worked) {
      const totalM = 4 * 60 + 15 + Math.floor(Math.random() * 8);
      worked.textContent = Math.floor(totalM / 60) + ' h ' + (totalM % 60) + ' min';
    }
  }, 2800);
}

window.__savDays = 6;
function savRecalc() {
  const range = document.getElementById('sav-emp');
  if (!range && !document.getElementById('sav-h')) return;
  const emp = Math.max(2, Math.min(40, Number(range?.value || 8)));
  // Prefer botón activo; evita desfasaje UI vs valor
  const onBtn = document.querySelector('.sav-days button.on');
  const days = Number(onBtn?.dataset?.d || window.__savDays || 6);
  window.__savDays = days;
  const valEl = document.getElementById('sav-emp-val');
  if (valEl) valEl.textContent = String(emp);

  // Minutos por día (escalan con empleados)
  const rows = [
    { old: Math.round(12 + emp * 3.2), neu: Math.round(3 + emp * 0.2) },
    { old: Math.round(10 + emp * 2.6), neu: Math.round(2 + emp * 0.15) },
    { old: Math.round(8 + emp * 1.8),  neu: Math.round(1 + emp * 0.1) },
  ];
  const daySaved = rows.reduce((a, r) => a + Math.max(0, r.old - r.neu), 0);
  // Mes ≈ semanas del mes * días abiertos
  const weeks = 4.33;
  const monthMin = daySaved * days * weeks;
  const monthH = Math.max(1, Math.round(monthMin / 60));
  const jornadas = Math.max(1, Math.round(monthH / 8));

  const h = document.getElementById('sav-h');
  if (h) h.textContent = String(monthH);
  const sub = document.getElementById('sav-sub');
  if (sub) {
    sub.textContent = 'Son ' + jornadas + ' jornada' + (jornadas > 1 ? 's' : '') +
      ' de 8 horas · ' + emp + ' empleado' + (emp > 1 ? 's' : '') + ' · ' + days + ' días/sem.';
  }

  const fmt = (m) => {
    m = Math.max(0, Math.round(m));
    if (m >= 60) return Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
    return m + ' min';
  };
  rows.forEach((r, i) => {
    const o = document.getElementById('sav-o' + (i + 1));
    const n = document.getElementById('sav-n' + (i + 1));
    if (o) o.textContent = fmt(r.old);
    if (n) n.textContent = fmt(r.neu);
  });
}

acts['sav-days'] = (el) => {
  window.__savDays = Number(el.dataset.d) || 6;
  document.querySelectorAll('.sav-days button').forEach((b) => b.classList.toggle('on', b === el));
  savRecalc();
};
acts['sav-recalc'] = () => savRecalc();

function businessLogo(kind) {
  const icons = {
    ferreteria: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0f766e"/><path fill="#fff" d="M18 38l10-18h8l10 18h-7l-2-4H27l-2 4h-7zm11-8h6l-3-6-3 6z"/><rect x="14" y="40" width="36" height="6" rx="2" fill="#5eead4"/></svg>',
    panaderia: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#b45309"/><ellipse cx="32" cy="36" rx="18" ry="12" fill="#fde68a"/><ellipse cx="32" cy="34" rx="14" ry="8" fill="#fbbf24"/><path stroke="#b45309" stroke-width="2" fill="none" d="M22 32c3 2 6 2 10 0s7-2 10 0"/></svg>',
    cafe: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1d4ed8"/><path fill="#fff" d="M20 24h22a4 4 0 014 4v10a10 10 0 01-10 10H26a10 10 0 01-10-10V28a4 4 0 014-4zm26 6h2a6 6 0 010 12h-2"/><path fill="#93c5fd" d="M22 48h20v3H22z"/></svg>',
    taller: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#7c3aed"/><circle cx="32" cy="32" r="12" fill="none" stroke="#fff" stroke-width="4"/><circle cx="32" cy="32" r="4" fill="#c4b5fd"/><path stroke="#fff" stroke-width="3" stroke-linecap="round" d="M32 16v4M32 44v4M16 32h4M44 32h4M21 21l3 3M40 40l3 3M43 21l-3 3M24 40l-3 3"/></svg>',
    mercado: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#be123c"/><path fill="#fff" d="M18 22h28l-2 18H20L18 22zm6 22a3 3 0 100 6 3 3 0 000-6zm16 0a3 3 0 100 6 3 3 0 000-6z"/><path fill="#fda4af" d="M24 18h4v4h-4zm12 0h4v4h-4z"/></svg>',
  };
  const svg = icons[kind] || icons.ferreteria;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
const SEED_REVIEWS = [
  { stars: 5, text: 'Dejamos la planilla de Excel. En una semana el equipo marcaba solo y yo veía las horas sin pelearme con el celular.', business: 'Ferretería Martínez', author: 'Carlos M.', logo_url: businessLogo('ferreteria') },
  { stars: 5, text: 'Lo que más me sirvió fue el GPS: se terminaron las marcas desde la casa. Simple de usar para todos.', business: 'Panadería El Trigal', author: 'Lucía R.', logo_url: businessLogo('panaderia') },
  { stars: 5, text: 'Multi-sucursal nos ordenó las dos bocas. Reportes claros para pagar extras sin discusiones.', business: 'Café Norte', author: 'Diego S.', logo_url: businessLogo('cafe') },
  { stars: 5, text: 'Arrancamos por el plan Esencial. En el primer mes ya recuperamos el tiempo de armar planillas a mano.', business: 'Taller Ruedas', author: 'Ana P.', logo_url: businessLogo('taller') },
  { stars: 5, text: 'Mis encargados aprueban permisos y yo solo miro lo importante. Muy prolijo para un local chico.', business: 'Mercado La Esquina', author: 'Javier L.', logo_url: businessLogo('mercado') },
];

function renderReviewCards(list) {
  return list.map((r) => {
    const stars = '★'.repeat(r.stars || 5);
    const logo = r.logo_url
      ? '<img class="rev-logo" src="' + r.logo_url + '" alt="" loading="lazy">'
      : '<div class="rev-logo rev-logo-ph">' + String(r.business || '?').slice(0, 2).toUpperCase() + '</div>';
    const text = String(r.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const biz = String(r.business || '').replace(/</g, '&lt;');
    const author = r.author ? String(r.author).replace(/</g, '&lt;') : '';
    return '<article class="rev-chip">' +
      logo +
      '<div class="rev-chip-body">' +
      '<div class="rev-stars">' + stars + '</div>' +
      '<p class="rev-text">“' + text + '”</p>' +
      '<div class="rev-meta"><strong>' + biz + '</strong>' +
      (author ? '<span class="muted"> · ' + author + '</span>' : '') +
      '</div></div></article>';
  }).join('');
}


function bindSectionReveal() {
  const els = document.querySelectorAll('.reveal-on-scroll');
  if (!els.length) return;
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  els.forEach((el) => io.observe(el));
}

async function loadReviews() {
  const box = document.getElementById('reviews-grid');
  if (!box) return;
  let real = [];
  try {
    const { reviews } = await get('/api/public/reviews');
    if (reviews?.length) real = reviews;
  } catch { /* seed */ }
  const list = real.slice(0, 12);
  if (list.length < 5) list.push(...SEED_REVIEWS.slice(0, 5 - list.length));
  // Duplicar para loop continuo hacia la izquierda
  box.innerHTML = renderReviewCards(list) + renderReviewCards(list);
  box.style.setProperty('--rev-n', String(list.length));
}

boot().catch((e) => render(html`<p style="padding:40px;text-align:center">${e.message}</p>`));

// Landing: precios y textos se refrescan solos (poll + al volver a la pestaña)
let landingCfgTimer = null;
function startLandingCfgPoll() {
  stopLandingCfgPoll();
  const tick = async () => {
    if (S.me || !document.querySelector('.ok-landing')) return stopLandingCfgPoll();
    try {
      const cfg = await get('/api/public/config');
      const key = (c) => JSON.stringify({ p: c?.prices, f: c?.free_employees, h: c?.hero, ct: c?.contact });
      if (key(S.cfg) === key(cfg)) return;
      const y = window.scrollY;
      S.cfg = cfg;
      await showAuth(undefined, { skipCfg: true, preserveScroll: true });
      window.scrollTo(0, y);
    } catch {}
  };
  landingCfgTimer = setInterval(tick, 20000); // cada 20 s mientras la landing esté abierta
  // Primera pasada a los 5 s por si el admin cambió recién
  setTimeout(tick, 5000);
}
function stopLandingCfgPoll() {
  if (landingCfgTimer) { clearInterval(landingCfgTimer); landingCfgTimer = null; }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (S.me) return;
  if (!document.querySelector('.ok-landing')) return;
  get('/api/public/config').then(async (cfg) => {
    const key = (c) => JSON.stringify({ p: c?.prices, f: c?.free_employees });
    if (key(S.cfg) === key(cfg)) return;
    const y = window.scrollY;
    S.cfg = cfg;
    await showAuth(undefined, { skipCfg: true, preserveScroll: true });
    window.scrollTo(0, y);
  }).catch(() => {});
});


if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});


