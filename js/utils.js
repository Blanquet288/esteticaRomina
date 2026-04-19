/* Utilidades compartidas (fechas, formato, UI) */
function $m(n) {
  return '$' + parseFloat(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function today() {
  return new Date().toISOString().split('T')[0];
}
function curMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
/** Normaliza el valor de `<input type="month">` (YYYY-MM) para consultas Firestore. */
function normalizeMonthYYYYMM(m) {
  if (m == null || m === '') return '';
  const s = String(m).trim();
  const m2 = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (!m2) return '';
  const y = m2[1];
  const moNum = parseInt(m2[2], 10);
  if (moNum < 1 || moNum > 12) return '';
  const mo = String(moNum).padStart(2, '0');
  return `${y}-${mo}`;
}
/** Etiqueta legible del mes (ej. «abril de 2026») a partir de YYYY-MM. */
function formatMonthLabel(yyyyMm) {
  const n = normalizeMonthYYYYMM(yyyyMm);
  if (!n) return '—';
  const [y, mo] = n.split('-').map(Number);
  return new Date(y, mo - 1, 15).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}
function monthRange(m) {
  const n = normalizeMonthYYYYMM(m) || normalizeMonthYYYYMM(curMonth());
  const [y, mo] = n.split('-');
  const ld = new Date(+y, +mo, 0).getDate();
  return { start: `${y}-${mo}-01`, end: `${y}-${mo}-${String(ld).padStart(2, '0')}`, monthKey: n };
}
/** Inicializa todos los `<input type="month">` del sistema con el mes calendario actual. */
function initMonthInputs() {
  const ids = ['v-mf', 'g-mf', 'rep-m', 'cj-m', 'adm-m'];
  const def = curMonth();
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (!el || el.tagName !== 'INPUT' || el.type !== 'month') return;
    if (!normalizeMonthYYYYMM(el.value)) el.value = def;
  });
}
/** Notificación flotante (esquina inferior derecha). `type`: ok | bad | info | warn */
function showToast(type, msg) {
  const host = document.getElementById('toast-container');
  if (!host) return;
  const t = ['ok', 'bad', 'info', 'warn'].includes(type) ? type : 'info';
  const el = document.createElement('div');
  el.className = `toast toast-${t}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 4500);
}
function openMo(id) {
  document.getElementById(id).classList.add('open');
}
function closeMo(id) {
  document.getElementById(id).classList.remove('open');
}

/**
 * Contabilidad unificada: Venta bruta = utilidad negocio (Romina) + comisión empleada.
 * Histórico diario legado: `monto` era solo la parte de la estética; el bruto era monto+comisión.
 * Con `montoEsBruto === true`, `monto` ya es la venta bruta y `utilidadNegocio` es la parte estética.
 */
function utilidadNegocioDesdeVenta(v) {
  if (!v) return 0;
  if (v.tipo === 'historico_diario') {
    if (v.montoEsBruto === true) {
      if (v.utilidadNegocio != null && Number.isFinite(Number(v.utilidadNegocio))) return Number(v.utilidadNegocio) || 0;
      return (Number(v.monto) || 0) - (Number(v.comisionMonto) || 0);
    }
    return Number(v.monto) || 0;
  }
  if (v.utilidadNegocio != null && Number.isFinite(Number(v.utilidadNegocio))) return Number(v.utilidadNegocio) || 0;
  return (Number(v.monto) || 0) - (Number(v.comisionMonto) || 0);
}

function ventaBrutaDesdeVenta(v) {
  if (!v) return 0;
  if (v.tipo === 'historico_diario') {
    if (v.montoEsBruto === true) return Number(v.monto) || 0;
    return (Number(v.monto) || 0) + (Number(v.comisionMonto) || 0);
  }
  return Number(v.monto) || 0;
}

function comisionDesdeVenta(v) {
  return Number(v && v.comisionMonto) || 0;
}
