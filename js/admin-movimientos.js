/**
 * Administrar Datos: acordeón por día, edición contextual (histórico vs venta/corte).
 */
var adminDrillFilter = null;
var adminMovEditId = null;

function setAdminWeekDrilldown(monthKey, weekNum) {
  const mk = normalizeMonthYYYYMM(monthKey) || monthKey;
  adminDrillFilter = { monthKey: mk, weekNum: parseInt(weekNum, 10) };
}

function clearAdminDrillFilter() {
  adminDrillFilter = null;
  const b = document.getElementById('adm-drill-banner');
  if (b) b.style.display = 'none';
  loadAdminMovimientos();
}

function adminTipoVentaLabel(v) {
  if (v.tipo === 'historico_diario') return 'Histórico';
  if (v.cantidad != null && Number(v.cantidad) > 0) return 'Corte línea';
  return 'Venta rápida';
}

function adminTipoBadgeClass(tipoTxt) {
  if (tipoTxt === 'Histórico') return 'hist';
  if (tipoTxt === 'Corte línea') return 'corte';
  return 'venta';
}

function adminFormatFechaCab(fechaStr) {
  if (!fechaStr || fechaStr.length < 10) return fechaStr || '—';
  const d = new Date(fechaStr + 'T12:00:00');
  const s = d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function onAdminMesChange() {
  const m = normalizeMonthYYYYMM(document.getElementById('adm-m')?.value);
  if (adminDrillFilter && m && adminDrillFilter.monthKey !== m) adminDrillFilter = null;
  loadAdminMovimientos();
}

/** Agrupa movimientos por `fecha` (YYYY-MM-DD) y devuelve días ordenados descendente. */
function adminGroupByFecha(list) {
  const map = new Map();
  list.forEach((v) => {
    const f = (v.fecha || '').slice(0, 10);
    if (!f) return;
    if (!map.has(f)) map.set(f, []);
    map.get(f).push(v);
  });
  const days = [...map.keys()].sort((a, b) => b.localeCompare(a));
  return { map, days };
}

/** Nombres de día (índice = getDay(), 0 = domingo). */
var ADMIN_WEEKDAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function adminFechaYMDToDowIndex(fechaStr) {
  if (!fechaStr || fechaStr.length < 10) return null;
  const d = new Date(fechaStr.slice(0, 10) + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  return d.getDay();
}

/** Suma venta bruta por día de la semana en el periodo (lista ya filtrada). */
function adminTotalsPorDiaSemana(list) {
  const totals = [0, 0, 0, 0, 0, 0, 0];
  (list || []).forEach((v) => {
    const f = (v.fecha || '').slice(0, 10);
    const ix = adminFechaYMDToDowIndex(f);
    if (ix == null) return;
    totals[ix] += ventaBrutaDesdeVenta(v);
  });
  return totals;
}

/** Índices del día con mayor y menor bruto acumulado (0–6). */
function adminStrongWeakDow(totals) {
  let strongIdx = 0;
  let weakIdx = 0;
  for (let i = 1; i < 7; i++) {
    if (totals[i] > totals[strongIdx]) strongIdx = i;
    if (totals[i] < totals[weakIdx]) weakIdx = i;
  }
  const strongSum = totals[strongIdx];
  const weakSum = totals[weakIdx];
  const allZero = strongSum <= 0;
  const flat = !allZero && strongSum === weakSum;
  return { strongIdx, weakIdx, strongSum, weakSum, allZero, flat };
}

/** Bruto total por cada fecha calendario (YYYY-MM-DD). */
function adminSumsPorFecha(map, days) {
  const sums = {};
  (days || []).forEach((fecha) => {
    const dayMovs = map.get(fecha) || [];
    let sum = 0;
    dayMovs.forEach((x) => {
      sum += ventaBrutaDesdeVenta(x);
    });
    sums[fecha] = sum;
  });
  return sums;
}

/** Fecha con mayor bruto y menor bruto (>0); un solo día con ventas no muestra “peor”. */
function adminPickBestWorstFecha(sums) {
  const keys = Object.keys(sums || {}).sort();
  if (!keys.length) return { bestFecha: null, worstFecha: null };
  let bestFecha = keys[0];
  let bestSum = sums[bestFecha];
  keys.forEach((f) => {
    const s = sums[f];
    if (s > bestSum || (s === bestSum && f < bestFecha)) {
      bestSum = s;
      bestFecha = f;
    }
  });
  if (bestSum <= 0) return { bestFecha: null, worstFecha: null };
  const conVentas = keys.filter((f) => sums[f] > 0);
  if (conVentas.length <= 1) return { bestFecha, worstFecha: null };
  let worstFecha = conVentas[0];
  let worstSum = sums[worstFecha];
  conVentas.forEach((f) => {
    const s = sums[f];
    if (s < worstSum || (s === worstSum && f < worstFecha)) {
      worstSum = s;
      worstFecha = f;
    }
  });
  if (worstFecha === bestFecha) return { bestFecha, worstFecha: null };
  return { bestFecha, worstFecha };
}

function adminBadgesForFecha(fecha, bestFecha, worstFecha) {
  let html = '';
  if (fecha === bestFecha) {
    html += '<span class="adm-acc-badge adm-acc-badge--best">👑 Mayor Venta</span>';
  }
  if (worstFecha && fecha === worstFecha) {
    html += '<span class="adm-acc-badge adm-acc-badge--low">📉 Menor Venta</span>';
  }
  return html ? `<span class="adm-acc-badges">${html}</span>` : '';
}

/** Panel “Análisis del Mes” debajo del selector / sobre el acordeón. */
function renderAdminTrendsPanel(list) {
  const el = document.getElementById('adm-trends-root');
  if (!el) return;
  if (!list || !list.length) {
    el.innerHTML = '';
    el.hidden = true;
    return;
  }
  const totals = adminTotalsPorDiaSemana(list);
  const sw = adminStrongWeakDow(totals);
  if (sw.allZero) {
    el.innerHTML =
      '<div class="adm-trends-title">Análisis del Mes</div><p class="adm-trends-empty">Sin ingresos brutos en el periodo mostrado.</p>';
    el.hidden = false;
    return;
  }
  const hotName = ADMIN_WEEKDAY_NAMES[sw.strongIdx];
  const softName = ADMIN_WEEKDAY_NAMES[sw.weakIdx];
  let softMain;
  let softSub;
  if (sw.flat) {
    softMain = 'Ritmo parejo';
    softSub = 'Todos los días de la semana aportaron lo mismo en bruto. Buen equilibrio operativo.';
  } else if (sw.weakSum <= 0) {
    softMain = softName + ' — sin ventas';
    softSub = 'Día flojo del calendario; ideal para promociones, redes o capacitación.';
  } else {
    softMain = softName + ' — menor acumulado';
    softSub = 'Menor volumen bruto agrupado por ese día de la semana; buen candidato para impulsar visitas.';
  }
  el.innerHTML =
    '<div class="adm-trends-title">Análisis del Mes</div>' +
    '<div class="adm-trends-grid">' +
    '<div class="adm-trend-card adm-trend-card--hot">' +
    '<div class="adm-trend-kicker"><span class="adm-trend-ico" aria-hidden="true">🔥</span>Día más fuerte</div>' +
    '<div class="adm-trend-main">' +
    hotName +
    '</div>' +
    '<div class="adm-trend-amt">' +
    $m(sw.strongSum) +
    ' <span style="font-size:12px;font-weight:500;color:var(--text2)">bruto</span></div>' +
    '<div class="adm-trend-sub">Mayor volumen bruto acumulado en este periodo.</div>' +
    '</div>' +
    '<div class="adm-trend-card adm-trend-card--soft">' +
    '<div class="adm-trend-kicker"><span class="adm-trend-ico" aria-hidden="true">📉</span>Día más flojo</div>' +
    '<div class="adm-trend-main">' +
    softMain +
    '</div>' +
    (!sw.flat && sw.weakSum > 0
      ? '<div class="adm-trend-amt">' + $m(sw.weakSum) + ' <span style="font-size:12px;font-weight:500;color:var(--text2)">bruto</span></div>'
      : '') +
    '<div class="adm-trend-sub">' +
    softSub +
    '</div>' +
    '</div>' +
    '</div>';
  el.hidden = false;
}

function adminToggleDay(btn) {
  const item = btn.closest('.adm-acc-item');
  if (!item) return;
  const open = item.classList.toggle('open');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function renderAdminDayTableRows(dayMovs, esc) {
  return dayMovs
    .map((v) => {
      const em = emps.find((e) => e.id === v.idEmpleado);
      const tnom = v.turnoNombre || (typeof nombreTurnoPorId === 'function' ? nombreTurnoPorId(v.turnoId) : '') || '—';
      const tipoTxt = adminTipoVentaLabel(v);
      const tipoCls = adminTipoBadgeClass(tipoTxt);
      const concepto = v.servicio || '—';
      return `<tr>
        <td><span class="adm-badge adm-${tipoCls}">${esc(tipoTxt)}</span></td>
        <td>${esc(em?.nombre || '—')}</td>
        <td>${esc(tnom)}</td>
        <td>${esc(concepto)}</td>
        <td><strong>${$m(ventaBrutaDesdeVenta(v))}</strong></td>
        <td>
          <button type="button" class="btn btn-s btn-sm" data-doc-id="${v.id}" onclick="openAdminEdit(this.dataset.docId)">Editar</button>
          <button type="button" class="btn btn-bad btn-sm" data-doc-id="${v.id}" onclick="deleteAdminMov(this.dataset.docId)">Eliminar</button>
        </td>
      </tr>`;
    })
    .join('');
}

async function loadAdminMovimientos() {
  const root = document.getElementById('adm-accordion-root');
  const inp = document.getElementById('adm-m');
  if (!root || !inp) return;
  let m = normalizeMonthYYYYMM(inp.value) || curMonth();
  if (inp.value !== m) inp.value = m;
  const { start, end } = monthRange(m);
  const banner = document.getElementById('adm-drill-banner');
  const bannerTxt = document.getElementById('adm-drill-txt');
  const esc = typeof escapeRepHtml === 'function' ? escapeRepHtml : function (s) { return String(s || ''); };
  root.innerHTML = '<div class="adm-loading">Cargando…</div>';
  const trendsEl = document.getElementById('adm-trends-root');
  if (trendsEl) {
    trendsEl.hidden = true;
    trendsEl.innerHTML = '';
  }
  await loadEmpsCache();
  await loadTurnos();
  await loadCatsCache();
  try {
    const snap = await db.collection('ventas').where('fecha', '>=', start).where('fecha', '<=', end).orderBy('fecha', 'desc').get();
    let list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (adminDrillFilter && adminDrillFilter.monthKey === m && adminDrillFilter.weekNum >= 1 && adminDrillFilter.weekNum <= 4) {
      list = filtrarVentasPorSemanaMes(list, m, adminDrillFilter.weekNum);
      if (banner && bannerTxt) {
        const labels = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'];
        const dias = periodoDiasSemana(adminDrillFilter.weekNum, m);
        bannerTxt.textContent = `${labels[adminDrillFilter.weekNum - 1]} · Días ${dias} · ${list.length} movimiento(s)`;
        banner.style.display = 'flex';
      }
    } else if (banner) {
      banner.style.display = 'none';
    }
    if (!list.length) {
      renderAdminTrendsPanel([]);
      root.innerHTML = '<div class="adm-empty">Sin registros en este periodo.</div>';
      return;
    }
    const { map, days } = adminGroupByFecha(list);
    const sumsPorFecha = adminSumsPorFecha(map, days);
    const { bestFecha, worstFecha } = adminPickBestWorstFecha(sumsPorFecha);
    renderAdminTrendsPanel(list);
    root.innerHTML = days
      .map((fecha) => {
        const dayMovs = map.get(fecha) || [];
        let sum = 0;
        dayMovs.forEach((x) => (sum += ventaBrutaDesdeVenta(x)));
        const n = dayMovs.length;
        const cab = adminFormatFechaCab(fecha);
        const rows = renderAdminDayTableRows(dayMovs, esc);
        const badges = adminBadgesForFecha(fecha, bestFecha, worstFecha);
        return `<div class="adm-acc-item" data-fecha="${esc(fecha)}">
          <button type="button" class="adm-acc-head" aria-expanded="false" onclick="adminToggleDay(this)">
            <span class="adm-acc-chev" aria-hidden="true"></span>
            <span class="adm-acc-main">
              <span class="adm-acc-date">📅 ${esc(cab)}</span>
              <span class="adm-acc-meta"><span class="adm-acc-count">${n} mov.</span><span class="adm-acc-sum">${$m(sum)}</span>${badges}</span>
            </span>
          </button>
          <div class="adm-acc-panel">
            <div class="adm-acc-panel-inner">
              <div class="tbl-wrap">
                <table class="adm-inner-tbl">
                  <thead><tr><th>Tipo</th><th>Empleada</th><th>Turno</th><th>Servicio / concepto</th><th>Monto</th><th>Acciones</th></tr></thead>
                  <tbody>${rows}</tbody>
                </table>
              </div>
            </div>
          </div>
        </div>`;
      })
      .join('');
  } catch (e) {
    console.error('loadAdminMovimientos', e);
    renderAdminTrendsPanel([]);
    root.innerHTML = `<div class="adm-empty adm-empty-err">Error: ${esc(e.message)}</div>`;
  }
}

function openAdminEdit(docId) {
  if (!docId) return;
  adminMovEditId = docId;
  db.collection('ventas')
    .doc(docId)
    .get()
    .then(async (doc) => {
      if (!doc.exists) {
        alert('El registro ya no existe.');
        return;
      }
      const v = doc.data();
      if (v.tipo === 'historico_diario') {
        await loadTurnos();
        openAdminHistModal(doc.id, v);
      } else {
        await loadTurnos();
        await loadCatsCache();
        openAdminVentaModal(doc.id, v);
      }
    })
    .catch((e) => alert('Error al cargar: ' + e.message));
}

function openAdminHistModal(id, v) {
  document.getElementById('adm-h-id').value = id;
  document.getElementById('adm-h-fecha-lbl').value = adminFormatFechaCab(v.fecha || '');
  const utilForm =
    v.montoEsBruto === true
      ? v.utilidadNegocio != null
        ? Number(v.utilidadNegocio)
        : (Number(v.monto) || 0) - (Number(v.comisionMonto) || 0)
      : Number(v.monto) || 0;
  document.getElementById('adm-h-monto').value = Number.isFinite(utilForm) ? String(utilForm) : '';
  document.getElementById('adm-h-com').value = v.comisionMonto != null ? String(v.comisionMonto) : '';
  fillTurnoSelect('adm-h-turno', v.turnoId || '');
  adminRecalcHistPreview();
  openMo('mo-admin-hist');
}

function adminRecalcHistPreview() {
  const utilEst = parseFloat(document.getElementById('adm-h-monto').value) || 0;
  const el = document.getElementById('adm-h-util');
  if (el) el.value = utilEst.toFixed(2);
}

async function saveAdminHist() {
  const id = document.getElementById('adm-h-id').value;
  const utilEst = parseFloat(document.getElementById('adm-h-monto').value);
  const com = parseFloat(document.getElementById('adm-h-com').value) || 0;
  if (!id) return;
  if (Number.isNaN(utilEst) || utilEst <= 0) {
    showToast('bad', '❌ Ingresa el monto que corresponde a la estética (mayor a 0).');
    return;
  }
  if (Number.isNaN(com) || com < 0) {
    showToast('bad', '❌ Comisión inválida (0 o más).');
    return;
  }
  if (!turnoSeleccionValido('adm-h-turno')) {
    showToast('bad', '❌ Selecciona un turno.');
    return;
  }
  const bruto = utilEst + com;
  const pct = bruto > 0 ? Math.round((com / bruto) * 10000) / 100 : 0;
  const turno = readTurnoFromSelect('adm-h-turno');
  try {
    await db.collection('ventas').doc(id).update({
      monto: bruto,
      comisionMonto: com,
      comisionPct: pct,
      utilidadNegocio: utilEst,
      montoEsBruto: true,
      turnoId: turno.turnoId,
      turnoNombre: turno.turnoNombre,
      ts: firebase.firestore.FieldValue.serverTimestamp(),
    });
    closeMo('mo-admin-hist');
    await loadAdminMovimientos();
    if (typeof curSec !== 'undefined' && curSec === 'cierre' && typeof loadCierreResumenMes === 'function') await loadCierreResumenMes();
    if (typeof curSec !== 'undefined' && curSec === 'reportes' && typeof loadReportes === 'function') loadReportes();
  } catch (e) {
    showToast('bad', '❌ ' + e.message);
  }
}

function openAdminVentaModal(id, v) {
  const esCorte = v.cantidad != null && Number(v.cantidad) > 0;
  document.getElementById('adm-v-ttl').textContent = esCorte ? 'Editar corte por línea' : 'Editar venta rápida';
  document.getElementById('adm-v-id').value = id;
  document.getElementById('adm-v-fecha').value = (v.fecha || '').slice(0, 10);
  loadEmpsSelect('adm-v-emp');
  document.getElementById('adm-v-emp').value = v.idEmpleado || '';
  loadCatSelect('adm-v-serv');
  const sel = document.getElementById('adm-v-serv');
  const sid = v.idServicio || '';
  if (sid && !cats.find((c) => c.id === sid)) {
    const o = document.createElement('option');
    o.value = sid;
    o.textContent = (v.servicio || '(Servicio)') + ' — catálogo';
    o.dataset.precio = String(v.monto != null ? v.monto : 0);
    o.dataset.com = String(v.comisionPct != null ? v.comisionPct : 0);
    o.dataset.nombre = v.servicio || '';
    sel.appendChild(o);
  }
  if (sid) sel.value = sid;
  fillTurnoSelect('adm-v-turno', v.turnoId || '');
  document.getElementById('adm-v-monto').value = v.monto != null ? String(v.monto) : '';
  const pct = parseFloat(v.comisionPct) || 0;
  document.getElementById('adm-v-pct').value = String(pct);
  const cantEl = document.getElementById('adm-v-cant');
  if (cantEl) cantEl.value = v.cantidad != null && v.cantidad !== '' ? String(v.cantidad) : '';
  adminRecalcVentaMontos();
  openMo('mo-admin-venta');
}

function adminOnAdmVServChange() {
  const sel = document.getElementById('adm-v-serv');
  if (!sel || !sel.value) return;
  const opt = sel.options[sel.selectedIndex];
  if (!opt) return;
  const precio = parseFloat(opt.dataset.precio || 0) || 0;
  const comPct = parseFloat(opt.dataset.com || 0) || 0;
  document.getElementById('adm-v-monto').value = precio > 0 ? precio.toFixed(2) : document.getElementById('adm-v-monto').value;
  document.getElementById('adm-v-pct').value = String(comPct);
  adminRecalcVentaMontos();
}

function adminOnAdmVFechaOrEmpTurnoSync() {
  syncTurnoFromEmpleadaYFecha(
    document.getElementById('adm-v-emp')?.value || '',
    document.getElementById('adm-v-fecha')?.value || '',
    'adm-v-turno',
    'adm-v-turno-descanso-hint'
  );
}

function adminOnAdmVEmpChange() {
  adminOnAdmVFechaOrEmpTurnoSync();
}

function adminRecalcVentaMontos() {
  const monto = parseFloat(document.getElementById('adm-v-monto').value) || 0;
  const pct = parseFloat(document.getElementById('adm-v-pct').value) || 0;
  const comisionMonto = (monto * pct) / 100;
  const utilidadNegocio = monto - comisionMonto;
  const cEl = document.getElementById('adm-v-com');
  const uEl = document.getElementById('adm-v-util');
  if (cEl) cEl.value = comisionMonto.toFixed(2);
  if (uEl) uEl.value = utilidadNegocio.toFixed(2);
}

async function saveAdminVenta() {
  const id = document.getElementById('adm-v-id').value;
  const fecha = document.getElementById('adm-v-fecha').value.trim();
  const catSel = document.getElementById('adm-v-serv');
  const catId = catSel.value;
  const opt = catSel.options[catSel.selectedIndex];
  const servNom =
    (opt && opt.dataset && opt.dataset.nombre && String(opt.dataset.nombre).trim()) ||
    (opt && opt.textContent ? opt.textContent.split('(')[0].split('—')[0].trim() : '') ||
    '';
  const eid = document.getElementById('adm-v-emp').value;
  const monto = parseFloat(document.getElementById('adm-v-monto').value);
  const pct = parseFloat(document.getElementById('adm-v-pct').value) || 0;
  if (!id || !fecha || !catId || !eid) {
    showToast('bad', '❌ Completa fecha, servicio y empleada.');
    return;
  }
  if (Number.isNaN(monto) || monto < 0) {
    showToast('bad', '❌ Monto inválido.');
    return;
  }
  if (!turnoSeleccionValido('adm-v-turno')) {
    showToast('bad', '❌ Selecciona un turno.');
    return;
  }
  const comisionMonto = (monto * pct) / 100;
  const utilidadNegocio = monto - comisionMonto;
  const turno = readTurnoFromSelect('adm-v-turno');
  const cantStr = document.getElementById('adm-v-cant')?.value;
  const cantNum = cantStr ? parseFloat(cantStr) : NaN;
  const payload = {
    fecha,
    idEmpleado: eid,
    servicio: servNom,
    idServicio: catId,
    monto,
    comisionPct: pct,
    comisionMonto,
    utilidadNegocio,
    turnoId: turno.turnoId,
    turnoNombre: turno.turnoNombre,
    ts: firebase.firestore.FieldValue.serverTimestamp(),
  };
  if (!Number.isNaN(cantNum) && cantNum > 0) payload.cantidad = cantNum;
  else payload.cantidad = firebase.firestore.FieldValue.delete();
  try {
    await db.collection('ventas').doc(id).update(payload);
    closeMo('mo-admin-venta');
    await loadAdminMovimientos();
    if (typeof curSec !== 'undefined' && curSec === 'cierre' && typeof loadCierreResumenMes === 'function') await loadCierreResumenMes();
    if (typeof curSec !== 'undefined' && curSec === 'reportes' && typeof loadReportes === 'function') loadReportes();
  } catch (e) {
    showToast('bad', '❌ ' + e.message);
  }
}

async function deleteAdminMov(docId) {
  if (!docId) return;
  if (!confirm('¿Eliminar este movimiento de forma permanente? Esta acción no se puede deshacer.')) return;
  try {
    await db.collection('ventas').doc(docId).delete();
    await loadAdminMovimientos();
    if (typeof curSec !== 'undefined' && curSec === 'cierre' && typeof loadCierreResumenMes === 'function') await loadCierreResumenMes();
    if (typeof curSec !== 'undefined' && curSec === 'reportes' && typeof loadReportes === 'function') loadReportes();
  } catch (e) {
    alert('Error al eliminar: ' + e.message);
  }
}
