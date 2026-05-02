/**
 * Ticket térmico 80 mm (admin): ajustes en localStorage + impresión HTML/CSS
 * (lienzo horizontal rotado 90° dentro del rollo vertical).
 */
var LS_TICKET_ROLLO_CM = 'esteticaRomina_ticketRolloCm';
var LS_TICKET_GIRO = 'esteticaRomina_ticketGiro';
var adminThermalTicketCtx = null;

function getTicketRolloCm() {
  try {
    const v = parseFloat(localStorage.getItem(LS_TICKET_ROLLO_CM));
    if (Number.isFinite(v) && v >= 5 && v <= 50) return v;
  } catch (e) {}
  return 15.5;
}

function setTicketRolloCm(cm) {
  try {
    localStorage.setItem(LS_TICKET_ROLLO_CM, String(cm));
  } catch (e) {}
}

function getTicketGiro() {
  try {
    return String(localStorage.getItem(LS_TICKET_GIRO) || '').trim();
  } catch (e) {
    return '';
  }
}

function setTicketGiro(s) {
  try {
    localStorage.setItem(LS_TICKET_GIRO, String(s || ''));
  } catch (e) {}
}

function registerAdminThermalTicketContext(ctx) {
  adminThermalTicketCtx = ctx || null;
}

function closeAdminGrupoDetalleModal() {
  closeMo('mo-admin-grupo');
  adminThermalTicketCtx = null;
}

function formatFechaTicketDMA(fechaISO) {
  if (!fechaISO || fechaISO.length < 10) return '—';
  const [y, m, d] = fechaISO.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

function formatoMonedaTicketSinCentavos(n) {
  const r = Math.round(Number(n) || 0);
  return '$' + r.toLocaleString('es-MX', { maximumFractionDigits: 0 });
}

function thermalEsc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Palabra destacada tipo “ROMINA” a partir del nombre de la empresa en config. */
function nombreHeroMarcaTicket() {
  const raw = typeof cfg !== 'undefined' && cfg && cfg.nombreEmpresa ? String(cfg.nombreEmpresa).trim() : 'Estética Romina';
  const p = raw.split(/\s+/).filter(Boolean);
  if (!p.length) return 'ROMINA';
  if (p.length >= 2) return p[p.length - 1].toUpperCase();
  return p[0].toUpperCase();
}

function openTicketThermalSettingsModal() {
  const inpCm = document.getElementById('tkt-roll-cm');
  const inpG = document.getElementById('tkt-giro');
  if (inpCm) inpCm.value = String(getTicketRolloCm());
  if (inpG) inpG.value = getTicketGiro();
  openMo('mo-ticket-thermal');
}

function saveTicketThermalSettings() {
  const cm = parseFloat(document.getElementById('tkt-roll-cm')?.value);
  if (!Number.isFinite(cm) || cm < 5 || cm > 50) {
    if (typeof showToast === 'function') showToast('bad', 'La longitud debe estar entre 5 y 50 cm.');
    else alert('La longitud debe estar entre 5 y 50 cm.');
    return;
  }
  setTicketRolloCm(cm);
  setTicketGiro(document.getElementById('tkt-giro')?.value || '');
  closeMo('mo-ticket-thermal');
  if (typeof showToast === 'function') showToast('ok', '✅ Ajustes de impresión guardados en este dispositivo.');
}

function buildThermalTicketHtml(opts) {
  const alto = opts.altoMm;
  const fecha = thermalEsc(opts.fechaTxt);
  const hero = thermalEsc(opts.heroMarca);
  const sub = thermalEsc(opts.subtitulo);
  const emp = thermalEsc(opts.empleada);
  const mon = thermalEsc(opts.montoTxt);
  return (
    '<div id="ticket-contenedor" class="ticket-wrapper" style="--alto-total:' +
    alto +
    'mm">' +
    '<div class="ticket-horizontal">' +
    '<div class="separador-grueso" aria-hidden="true"></div>' +
    '<div class="seccion-marca">' +
    '<span id="resFecha" class="texto-fecha">' +
    fecha +
    '</span>' +
    '<h1 class="texto-romina">' +
    hero +
    '</h1>' +
    '<span class="texto-estetica">' +
    sub +
    '</span>' +
    '</div>' +
    '<div class="separador-grueso" aria-hidden="true"></div>' +
    '<div class="seccion-cobro">' +
    '<div class="caja-atiende">' +
    '<span class="texto-atiende">ATIENDE: <strong id="resEmp">' +
    emp +
    '</strong></span>' +
    '<div class="linea-subrayado" aria-hidden="true"></div>' +
    '</div>' +
    '<h1 id="resMon" class="texto-monto">' +
    mon +
    '</h1>' +
    '</div>' +
    '<div class="thermal-ticket-feed" aria-hidden="true"></div>' +
    '</div></div>'
  );
}

function printAdminGrupoThermalTicket() {
  if (!adminThermalTicketCtx) {
    if (typeof showToast === 'function') showToast('bad', 'No hay datos de turno. Abre «Ver detalles» en un grupo.');
    return;
  }
  const ctx = adminThermalTicketCtx;
  const fechaTxt = formatFechaTicketDMA(ctx.fechaISO);
  const empleada = String(ctx.empleadaNombre || '—').toUpperCase();
  const montoTxt = formatoMonedaTicketSinCentavos(ctx.totalComisionEmpleada);
  const heroMarca = nombreHeroMarcaTicket();
  const giro = getTicketGiro();
  const subtitulo = giro ? giro.toUpperCase() : 'ESTÉTICA PROFESIONAL';
  const altoMm = getTicketRolloCm() * 10;

  const host = document.getElementById('tkt-print');
  if (!host) {
    if (typeof showToast === 'function') showToast('bad', 'No se encontró el contenedor de impresión.');
    return;
  }

  host.innerHTML = buildThermalTicketHtml({
    altoMm,
    fechaTxt,
    heroMarca,
    subtitulo,
    empleada,
    montoTxt,
  });

  const onAfter = function () {
    window.removeEventListener('afterprint', onAfter);
    if (host.querySelector('.ticket-wrapper')) host.innerHTML = '';
  };
  window.addEventListener('afterprint', onAfter);

  setTimeout(function () {
    try {
      window.print();
    } catch (e) {
      if (typeof showToast === 'function') showToast('bad', 'No se pudo abrir el diálogo de impresión.');
    }
  }, 350);

  if (typeof showToast === 'function') {
    showToast('ok', '✅ Listo: diseño horizontal (rotado). Revisa la vista previa e imprime en 80 mm.');
  }
}
