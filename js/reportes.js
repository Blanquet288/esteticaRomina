/* Reportes: pestañas, tablas y gráficos (Chart.js) */
var repTab = 'ventas';
var chVentas = null,
  chGastos = null,
  chSvcs = null;
/** Ventas del mes actual (pestaña Ventas) para drill-down semanal */
var repVentasMesActuales = [];
/** Transacciones de la semana seleccionada (sin filtrar por UI) */
var repDetalleSemanaBase = [];

/** Navega a Administrar Datos con la tabla filtrada a la semana del mes de Reportes. */
function navigateRepWeekToAdmin(weekNum) {
  weekNum = parseInt(weekNum, 10);
  if (weekNum < 1 || weekNum > 4) return;
  const m = normalizeMonthYYYYMM(document.getElementById('rep-m')?.value) || curMonth();
  const adm = document.getElementById('adm-m');
  if (adm) adm.value = m;
  if (typeof setAdminWeekDrilldown === 'function') setAdminWeekDrilldown(m, weekNum);
  go('admin');
}

function switchTab(t, btn) {
  repTab = t;
  document.querySelectorAll('.tab').forEach((el) => el.classList.remove('on'));
  btn.classList.add('on');
  ['ventas', 'empleadas', 'servicios', 'gastos'].forEach((id) => {
    document.getElementById(`rt-${id}`).style.display = id === t ? 'block' : 'none';
  });
  loadReportes();
}
async function loadReportes() {
  const inp = document.getElementById('rep-m');
  let m = normalizeMonthYYYYMM(inp?.value) || curMonth();
  if (inp && inp.value !== m) inp.value = m;
  const { start, end } = monthRange(m);
  const [snapV, snapG] = await Promise.all([
    db.collection('ventas').where('fecha', '>=', start).where('fecha', '<=', end).get(),
    db.collection('gastos').where('fecha', '>=', start).where('fecha', '<=', end).get(),
  ]);
  const ventas = snapV.docs.map((d) => ({ id: d.id, ...d.data() }));
  const gastos = snapG.docs.map((d) => ({ id: d.id, ...d.data() }));
  repVentasMesActuales = ventas;
  if (repTab === 'ventas') renderChVentas(ventas);
  else if (repTab === 'empleadas') renderRepEmpsWithCurrentFilter();
  else if (repTab === 'servicios') renderRepSvcs(ventas);
  else if (repTab === 'gastos') renderRepGastos(gastos);
}
/** Día del mes 1–31 → bloque semanal 1–4 (22 en adelante = semana 4). */
function repWeekOfMonth(day) {
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  return 4;
}

function repUltimoDiaMes(monthStr) {
  const [y, mo] = monthStr.split('-');
  return new Date(+y, +mo, 0).getDate();
}

function filtrarVentasPorSemanaMes(ventas, monthStr, weekNum) {
  return ventas.filter((v) => {
    const f = v.fecha || '';
    if (f.length < 10 || f.slice(0, 7) !== monthStr) return false;
    const d = parseInt(f.slice(8, 10), 10);
    if (Number.isNaN(d)) return false;
    return repWeekOfMonth(d) === weekNum;
  });
}

/** Filtra ventas del mes; weekVal "0" = todo el mes, "1"–"4" = bloque calendario. */
function ventasDelMesEnRangoSemanal(ventas, monthStr, weekVal) {
  const inMonth = (v) => {
    const f = v.fecha || '';
    return f.length >= 10 && f.slice(0, 7) === monthStr;
  };
  if (!weekVal || weekVal === '0') return ventas.filter(inMonth);
  const wn = parseInt(weekVal, 10);
  if (wn >= 1 && wn <= 4) return filtrarVentasPorSemanaMes(ventas, monthStr, wn);
  return ventas.filter(inMonth);
}

/** Paleta reutilizable: una serie por empleada en la gráfica apilada. */
var REP_STACK_PALETTE = [
  'rgba(201,147,106,.9)',
  'rgba(91,141,238,.9)',
  'rgba(76,175,137,.9)',
  'rgba(240,160,87,.9)',
  'rgba(149,102,201,.9)',
  'rgba(224,92,107,.9)',
  'rgba(78,205,196,.9)',
  'rgba(255,218,121,.92)',
  'rgba(108,117,125,.88)',
  'rgba(255,164,116,.92)',
  'rgba(129,199,132,.9)',
  'rgba(100,181,246,.9)',
  'rgba(186,104,200,.9)',
  'rgba(255,183,77,.92)',
  'rgba(239,83,80,.88)',
  'rgba(77,182,172,.9)',
];

/**
 * Agrupa montos por semana (1–4) y por empleada: una serie por cada empleada registrada (orden por nombre).
 * @returns {{ datasets: Chart.js dataset[] }}
 */
function buildStackedVentasPorSemanaPorEmpleada(ventas, monthStr) {
  const empOrder = (emps || []).slice().sort((a, b) => String(a.nombre || '').localeCompare(String(b.nombre || '')));
  if (!empOrder.length) {
    return {
      datasets: [
        {
          label: 'Sin empleadas registradas',
          data: [0, 0, 0, 0],
          backgroundColor: 'rgba(148,163,184,.35)',
          borderWidth: 0,
          borderRadius: 10,
        },
      ],
    };
  }
  const matrix = {};
  empOrder.forEach((e) => {
    matrix[e.id] = [0, 0, 0, 0];
  });
  ventas.forEach((v) => {
    const f = v.fecha || '';
    if (f.length < 10 || f.slice(0, 7) !== monthStr) return;
    const eid = v.idEmpleado;
    if (!eid || !matrix[eid]) return;
    const d = parseInt(f.slice(8, 10), 10);
    if (Number.isNaN(d) || d < 1 || d > 31) return;
    const w = repWeekOfMonth(d) - 1;
    matrix[eid][w] += ventaBrutaDesdeVenta(v);
  });
  const datasets = empOrder.map((e, idx) => ({
    label: e.nombre || e.id,
    data: matrix[e.id].slice(),
    backgroundColor: REP_STACK_PALETTE[idx % REP_STACK_PALETTE.length],
    borderWidth: 0,
    borderRadius: 4,
    borderSkipped: false,
  }));
  return { datasets };
}

function renderRepEmpsWithCurrentFilter() {
  const m = normalizeMonthYYYYMM(document.getElementById('rep-m')?.value) || curMonth();
  const sel = document.getElementById('rep-emps-week');
  const weekVal = sel && sel.value !== undefined && sel.value !== null && sel.value !== '' ? sel.value : '0';
  const ventasFiltradas = ventasDelMesEnRangoSemanal(repVentasMesActuales || [], m, weekVal);
  renderRepEmpsTable(ventasFiltradas, weekVal);
}

function onRepEmpsWeekFilterChange() {
  if (repTab !== 'empleadas') return;
  renderRepEmpsWithCurrentFilter();
}

function renderRepEmpsTable(ventas, weekVal) {
  const tb = document.getElementById('tb-rep-emps');
  const tf = document.getElementById('tf-rep-emps');
  const st = {};
  emps.forEach((e) => {
    st[e.id] = { nombre: e.nombre, svcs: 0, total: 0, com: 0, util: 0 };
  });
  ventas.forEach((v) => {
    if (st[v.idEmpleado]) {
      st[v.idEmpleado].svcs++;
      st[v.idEmpleado].total += ventaBrutaDesdeVenta(v);
      st[v.idEmpleado].com += comisionDesdeVenta(v);
      st[v.idEmpleado].util += utilidadNegocioDesdeVenta(v);
    }
  });
  const rows = Object.values(st).sort((a, b) => b.total - a.total);
  let sumMov = 0,
    sumTot = 0,
    sumCom = 0,
    sumUtil = 0;
  rows.forEach((e) => {
    sumMov += e.svcs;
    sumTot += e.total;
    sumCom += e.com;
    sumUtil += e.util;
  });
  tb.innerHTML = rows
    .map(
      (e) =>
        `<tr><td><strong>${e.nombre}</strong></td><td>${e.svcs}</td><td>${$m(e.total)}</td><td style="color:var(--warn)">${$m(e.com)}</td><td style="color:var(--ok)">${$m(e.util)}</td></tr>`
    )
    .join('');
  const footerMap = { 1: 'Total · Semana 1 (días 1–7)', 2: 'Total · Semana 2 (días 8–14)', 3: 'Total · Semana 3 (días 15–21)', 4: 'Total · Semana 4 (días 22 al fin de mes)' };
  const footerLabel = weekVal && weekVal !== '0' ? footerMap[weekVal] || 'Total periodo' : 'Total mes';
  if (tf) {
    tf.innerHTML = `<tr><td>${footerLabel}</td><td>${sumMov}</td><td>${$m(sumTot)}</td><td style="color:var(--warn)">${$m(sumCom)}</td><td style="color:var(--ok)">${$m(sumUtil)}</td></tr>`;
  }
}

function renderRepEmps(ventas) {
  renderRepEmpsWithCurrentFilter();
}

function formatRepMesLegible(monthStr) {
  const [y, mo] = monthStr.split('-');
  if (!y || !mo) return monthStr;
  return new Date(+y, +mo - 1, 15).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' });
}

function periodoDiasSemana(weekNum, monthStr) {
  const last = repUltimoDiaMes(monthStr);
  if (weekNum === 1) return '1 – 7';
  if (weekNum === 2) return '8 – 14';
  if (weekNum === 3) return '15 – 21';
  return '22 – ' + last;
}

function escapeRepHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function openDetalleVentasSemana(weekNum) {
  weekNum = parseInt(weekNum, 10);
  if (weekNum < 1 || weekNum > 4) return;
  const m = normalizeMonthYYYYMM(document.getElementById('rep-m')?.value) || curMonth();
  const labels = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'];
  const lista = filtrarVentasPorSemanaMes(repVentasMesActuales || [], m, weekNum).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  repDetalleSemanaBase = lista;
  document.getElementById('mo-rep-sem-ttl').textContent = 'Detalle de Ventas — ' + labels[weekNum - 1];
  document.getElementById('mo-rep-sem-sub').textContent =
    formatRepMesLegible(m) + ' · Días ' + periodoDiasSemana(weekNum, m) + ' · ' + lista.length + ' movimiento(s)';
  fillRepSemFiltros();
  renderDetalleSemanaTabla();
  openMo('mo-rep-sem');
}

function fillRepSemFiltros() {
  const empSel = document.getElementById('rep-sem-f-emp');
  const turSel = document.getElementById('rep-sem-f-turno');
  if (!empSel || !turSel) return;
  const prevE = empSel.value;
  const prevT = turSel.value;
  empSel.innerHTML = '<option value="">Todas las empleadas</option>';
  turSel.innerHTML = '<option value="">Todos los turnos</option>';
  const empIds = new Set();
  const turnOpts = new Map();
  repDetalleSemanaBase.forEach((v) => {
    if (v.idEmpleado) empIds.add(v.idEmpleado);
    const tid = v.turnoId || '';
    const key = tid || '__sin__';
    const tnom = v.turnoNombre || (typeof nombreTurnoPorId === 'function' ? nombreTurnoPorId(tid) : '') || (tid ? '—' : 'Sin turno');
    if (!turnOpts.has(key)) turnOpts.set(key, tnom);
  });
  [...empIds]
    .map((id) => ({ id, nom: emps.find((e) => e.id === id)?.nombre || id }))
    .sort((a, b) => a.nom.localeCompare(b.nom))
    .forEach(({ id, nom }) => {
      const o = document.createElement('option');
      o.value = id;
      o.textContent = nom;
      empSel.appendChild(o);
    });
  [...turnOpts.entries()]
    .sort((a, b) => a[1].localeCompare(b[1]))
    .forEach(([key, nom]) => {
      const o = document.createElement('option');
      o.value = key;
      o.textContent = nom;
      turSel.appendChild(o);
    });
  if ([...empSel.options].some((o) => o.value === prevE)) empSel.value = prevE;
  if ([...turSel.options].some((o) => o.value === prevT)) turSel.value = prevT;
}

function resetRepSemFiltros() {
  const empSel = document.getElementById('rep-sem-f-emp');
  const turSel = document.getElementById('rep-sem-f-turno');
  if (empSel) empSel.value = '';
  if (turSel) turSel.value = '';
  renderDetalleSemanaTabla();
}

function renderDetalleSemanaTabla() {
  const tb = document.getElementById('tb-rep-sem-det');
  if (!tb) return;
  const fEmp = document.getElementById('rep-sem-f-emp')?.value || '';
  const fTur = document.getElementById('rep-sem-f-turno')?.value || '';
  let rows = repDetalleSemanaBase.slice();
  if (fEmp) rows = rows.filter((v) => v.idEmpleado === fEmp);
  if (fTur) {
    if (fTur === '__sin__') rows = rows.filter((v) => !v.turnoId);
    else rows = rows.filter((v) => (v.turnoId || '') === fTur);
  }
  if (!rows.length) {
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:22px">Sin transacciones con los filtros seleccionados.</td></tr>';
    return;
  }
  tb.innerHTML = rows
    .map((v) => {
      const em = emps.find((e) => e.id === v.idEmpleado);
      const tnom = v.turnoNombre || (typeof nombreTurnoPorId === 'function' ? nombreTurnoPorId(v.turnoId) : '') || '—';
      const serv = v.servicio || '—';
      const esHist = v.tipo === 'historico_diario';
      return `<tr>
        <td>${escapeRepHtml(v.fecha)}</td>
        <td>${escapeRepHtml(em?.nombre || '—')}</td>
        <td>${escapeRepHtml(tnom)}</td>
        <td>${esHist ? '<span class="bdg bdg-info" style="margin-right:6px">Día</span>' : ''}${escapeRepHtml(serv)}</td>
        <td><strong>${$m(ventaBrutaDesdeVenta(v))}</strong></td>
        <td style="color:var(--warn)">${$m(comisionDesdeVenta(v))}</td>
      </tr>`;
    })
    .join('');
}

function renderChVentas(ventas) {
  const labels = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'];
  const periodos = ['1 – 7', '8 – 14', '15 – 21', '22 – fin de mes'];
  const m = normalizeMonthYYYYMM(document.getElementById('rep-m')?.value) || curMonth();
  const sem = [0, 0, 0, 0];
  ventas.forEach((v) => {
    const f = v.fecha || '';
    if (f.length < 10 || f.slice(0, 7) !== m) return;
    const d = parseInt(f.slice(8, 10), 10);
    if (Number.isNaN(d) || d < 1 || d > 31) return;
    const w = repWeekOfMonth(d) - 1;
    sem[w] += ventaBrutaDesdeVenta(v);
  });
  const totalMes = sem.reduce((a, b) => a + b, 0);
  const tbSem = document.getElementById('tb-rep-semanal');
  if (tbSem) {
    tbSem.innerHTML = labels
      .map((lbl, i) => {
        const pct = totalMes > 0 ? ((sem[i] / totalMes) * 100).toFixed(1) : '0.0';
        const wk = i + 1;
        return `<tr class="rep-sem-row" role="button" tabindex="0" onclick="navigateRepWeekToAdmin(${wk})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();navigateRepWeekToAdmin(${wk});}">
          <td><strong>${lbl}</strong></td><td style="color:var(--text2)">${periodos[i]}</td><td><strong>${$m(sem[i])}</strong></td><td>${pct}%</td>
        </tr>`;
      })
      .join('');
  }
  const { datasets } = buildStackedVentasPorSemanaPorEmpleada(ventas, m);
  const ctx = document.getElementById('ch-vsem').getContext('2d');
  if (chVentas) chVentas.destroy();
  chVentas = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      onClick(evt, els) {
        if (!els || !els.length) return;
        const idx = els[0].index;
        if (idx >= 0 && idx < 4) navigateRepWeekToAdmin(idx + 1);
      },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: {
            boxWidth: 12,
            padding: 10,
            font: { size: 11 },
            usePointStyle: true,
          },
        },
        tooltip: {
          mode: 'index',
          intersect: false,
          filter: (tooltipItem) => {
            const y = tooltipItem.parsed && typeof tooltipItem.parsed.y === 'number' ? tooltipItem.parsed.y : 0;
            return y > 0;
          },
          callbacks: {
            label(ctx) {
              const val = ctx.parsed && typeof ctx.parsed.y === 'number' ? ctx.parsed.y : ctx.raw || 0;
              return ' ' + (ctx.dataset && ctx.dataset.label ? ctx.dataset.label + ': ' : '') + $m(val);
            },
            footer(tooltipItems) {
              if (!tooltipItems || !tooltipItems.length) return '';
              const chart = tooltipItems[0].chart;
              const ix = tooltipItems[0].dataIndex;
              let sum = 0;
              chart.data.datasets.forEach((ds) => {
                const raw = ds.data[ix];
                sum += typeof raw === 'number' ? raw : 0;
              });
              return 'Total semana: ' + $m(sum);
            },
            afterFooter() {
              return 'Clic en la barra: Administrar Datos por semana';
            },
          },
        },
      },
      scales: {
        x: {
          stacked: true,
          grid: { display: false },
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,.04)' },
          ticks: { callback: (v) => '$' + Number(v).toLocaleString('es-MX') },
        },
      },
    },
  });
}
function renderRepSvcs(ventas) {
  const st = {};
  ventas.forEach((v) => {
    if (v.tipo === 'historico_diario') return;
    const k = v.servicio || 'Sin nombre';
    if (!st[k]) st[k] = { nombre: k, count: 0, total: 0 };
    st[k].count += v.cantidad || 1;
    st[k].total += ventaBrutaDesdeVenta(v);
  });
  const sorted = Object.values(st)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  const tb = document.getElementById('tb-rep-svcs');
  if (!sorted.length) {
    if (chSvcs) {
      chSvcs.destroy();
      chSvcs = null;
    }
    tb.innerHTML =
      '<tr><td colspan="4" style="text-align:center;color:var(--text2)">Sin ventas por servicio de catálogo este mes (p. ej. solo resúmenes históricos diarios).</td></tr>';
    return;
  }
  const ctx = document.getElementById('ch-svcs').getContext('2d');
  if (chSvcs) chSvcs.destroy();
  const colors = [
    'rgba(201,147,106,.8)',
    'rgba(91,141,238,.8)',
    'rgba(76,175,137,.8)',
    'rgba(240,160,87,.8)',
    'rgba(149,102,201,.8)',
    'rgba(224,92,107,.8)',
    'rgba(78,205,196,.8)',
    'rgba(255,218,121,.8)',
    'rgba(108,117,125,.8)',
    'rgba(255,164,116,.8)',
  ];
  chSvcs = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map((s) => s.nombre),
      datasets: [
        {
          label: 'Total Generado ($)',
          data: sorted.map((s) => s.total),
          backgroundColor: sorted.map((_, i) => colors[i % colors.length]),
          borderWidth: 0,
          borderRadius: 8,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: {
          beginAtZero: true,
          ticks: { callback: (v) => '$' + v.toLocaleString('es-MX') },
        },
        y: { grid: { display: false } },
      },
    },
  });
  tb.innerHTML = sorted.map((s, i) => `<tr><td><strong>#${i + 1}</strong></td><td>${s.nombre}</td><td>${s.count}</td><td><strong>${$m(s.total)}</strong></td></tr>`).join('');
}
function renderRepGastos(gastos) {
  let fijo = 0,
    op = 0;
  gastos.forEach((g) => {
    if (g.categoria === 'Fijo') fijo += g.monto;
    else op += g.monto;
  });
  const ctx = document.getElementById('ch-gdist').getContext('2d');
  if (chGastos) chGastos.destroy();
  chGastos = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Gastos Fijos', 'Gastos Operativos'],
      datasets: [{ data: [fijo, op], backgroundColor: ['rgba(91,141,238,.78)', 'rgba(149,102,201,.78)'], borderWidth: 0 }],
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
  });
  const tb = document.getElementById('tb-rep-gas');
  tb.innerHTML = gastos
    .map((g) => {
      const bc = g.categoria === 'Fijo' ? 'bdg-fijo' : 'bdg-op';
      return `<tr><td>${g.concepto}</td><td><span class="bdg ${bc}">${g.categoria}</span></td><td>${$m(g.monto)}</td></tr>`;
    })
    .join('');
}

(function wireRepEmpleadasWeekFilter() {
  const el = document.getElementById('rep-emps-week');
  if (!el || el.dataset.wiredRepWeek === '1') return;
  el.dataset.wiredRepWeek = '1';
  el.addEventListener('change', onRepEmpsWeekFilterChange);
})();
