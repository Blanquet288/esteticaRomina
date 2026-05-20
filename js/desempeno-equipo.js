/* DesempeÃ±o del Equipo: ranking, Chart.js y exportaciÃ³n PDF selectiva */

/** Medallas por Unicode (evita corrupcion UTF-8 en el archivo). */
function deMedalHtml(rankIndex) {
  if (rankIndex === 0) return '\uD83E\uDD47';
  if (rankIndex === 1) return '\uD83E\uDD48';
  if (rankIndex === 2) return '\uD83E\uDD49';
  return '<span class="de-medal de-medal-empty" aria-hidden="true">\u00B7</span>';
}

const DE_CHART_COLORS = [
  'rgba(201,147,106,0.92)',
  'rgba(91,141,238,0.88)',
  'rgba(76,175,137,0.88)',
  'rgba(149,102,201,0.88)',
  'rgba(240,160,87,0.9)',
  'rgba(224,92,107,0.85)',
  'rgba(62,142,165,0.88)',
  'rgba(155,89,182,0.88)',
];
const DE_CHART_BORDERS = DE_CHART_COLORS.map((c) => c.replace(/[\d.]+\)$/, '1)'));

function deColorForEmpleada(eid, index) {
  return deEmpColorMap[eid] || DE_CHART_COLORS[index % DE_CHART_COLORS.length];
}

let deChartDona = null;
let deChartBarras = null;
let deLastGrupos = [];
let deEmpColorMap = {};

function deEscHtml(s) {
  return typeof escapeRepHtml === 'function'
    ? escapeRepHtml(s)
    : String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

function desempenoRangoMesActual() {
  const r = monthRange(curMonth());
  return { start: r.start, end: r.end };
}

function initDesempenoEquipoFechas() {
  const { start, end } = desempenoRangoMesActual();
  const ini = document.getElementById('de-f-inicio');
  const fin = document.getElementById('de-f-fin');
  if (ini) ini.value = start;
  if (fin) fin.value = end;
}

function cantidadServicioDesdeVenta(v) {
  if (!v || v.tipo === 'historico_diario') return 0;
  const serv = (v.servicio || '').trim();
  if (!serv || serv.includes('Resumen diario')) return 0;
  const n = parseInt(v.cantidad, 10);
  if (Number.isFinite(n) && n > 0) return n;
  return 1;
}

function agruparDesempenoPorServicio(ventas, empNombrePorId) {
  const porServicio = {};
  ventas.forEach((v) => {
    const qty = cantidadServicioDesdeVenta(v);
    if (!qty) return;
    const serv = (v.servicio || 'Sin nombre').trim();
    const eid = v.idEmpleado;
    if (!eid) return;
    if (!porServicio[serv]) porServicio[serv] = {};
    porServicio[serv][eid] = (porServicio[serv][eid] || 0) + qty;
  });
  return Object.keys(porServicio)
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((servicio) => {
      const ranking = Object.entries(porServicio[servicio])
        .map(([eid, cantidad]) => ({
          eid,
          nombre: empNombrePorId[eid] || 'Empleada',
          cantidad,
        }))
        .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre, 'es'));
      return { servicio, ranking };
    })
    .filter((g) => g.ranking.length > 0);
}

function buildDeEmpColorMap(grupos) {
  const eids = [];
  grupos.forEach((g) =>
    g.ranking.forEach((r) => {
      if (!eids.includes(r.eid)) eids.push(r.eid);
    })
  );
  const map = {};
  eids.forEach((eid, i) => {
    map[eid] = DE_CHART_COLORS[i % DE_CHART_COLORS.length];
  });
  return map;
}

function totalesPorEmpleada(grupos) {
  const tot = {};
  grupos.forEach((g) => {
    g.ranking.forEach((r) => {
      tot[r.eid] = (tot[r.eid] || 0) + r.cantidad;
    });
  });
  return Object.entries(tot)
    .map(([eid, cantidad]) => {
      const nombre =
        grupos.flatMap((g) => g.ranking).find((r) => r.eid === eid)?.nombre || 'Empleada';
      return { eid, nombre, cantidad };
    })
    .sort((a, b) => b.cantidad - a.cantidad);
}

function top5Servicios(grupos) {
  return [...grupos]
    .map((g) => ({
      servicio: g.servicio,
      total: g.ranking.reduce((s, r) => s + r.cantidad, 0),
      ranking: g.ranking,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);
}

function deDestroyCharts() {
  if (deChartDona) {
    deChartDona.destroy();
    deChartDona = null;
  }
  if (deChartBarras) {
    deChartBarras.destroy();
    deChartBarras = null;
  }
}

function renderDesempenoCharts(grupos) {
  const wrap = document.getElementById('de-charts-wrap');
  if (!wrap || typeof Chart === 'undefined') return;

  deDestroyCharts();

  if (!grupos.length) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = 'block';

  const empTotals = totalesPorEmpleada(grupos);
  const totalGeneral = empTotals.reduce((s, e) => s + e.cantidad, 0) || 1;

  const ctxDona = document.getElementById('de-chart-dona');
  if (ctxDona) {
    deChartDona = new Chart(ctxDona.getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: empTotals.map((e) => e.nombre),
        datasets: [
          {
            data: empTotals.map((e) => e.cantidad),
            backgroundColor: empTotals.map((e) => deEmpColorMap[e.eid] || DE_CHART_COLORS[0]),
            borderColor: '#fff',
            borderWidth: 3,
            hoverOffset: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '58%',
        plugins: {
          legend: { position: 'bottom', labels: { padding: 14, usePointStyle: true, font: { size: 12 } } },
          tooltip: {
            callbacks: {
              label(ctx) {
                const val = ctx.raw || 0;
                const pct = ((val / totalGeneral) * 100).toFixed(1);
                return ` ${ctx.label}: ${val} servicios (${pct}%)`;
              },
            },
          },
        },
      },
    });
  }

  const top5 = top5Servicios(grupos);
  const empList = empTotals.map((e) => ({ eid: e.eid, nombre: e.nombre }));
  const ctxBar = document.getElementById('de-chart-barras');
  if (ctxBar && top5.length) {
    deChartBarras = new Chart(ctxBar.getContext('2d'), {
      type: 'bar',
      data: {
        labels: top5.map((s) => s.servicio),
        datasets: empList.map((emp, i) => ({
          label: emp.nombre,
          data: top5.map((s) => {
            const row = s.ranking.find((r) => r.eid === emp.eid);
            return row ? row.cantidad : 0;
          }),
          backgroundColor: deEmpColorMap[emp.eid] || DE_CHART_COLORS[i % DE_CHART_COLORS.length],
          borderColor: DE_CHART_BORDERS[i % DE_CHART_BORDERS.length],
          borderWidth: 1,
          borderRadius: 6,
          maxBarThickness: 42,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, padding: 10, usePointStyle: true, font: { size: 11 } } },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label(ctx) {
                return ` ${ctx.dataset.label}: ${ctx.raw} servicios`;
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 45, minRotation: 0 } },
          y: {
            beginAtZero: true,
            grid: { color: 'rgba(0,0,0,.06)' },
            ticks: { stepSize: 1, precision: 0 },
            title: { display: true, text: 'Cantidad de servicios', font: { size: 11 } },
          },
        },
      },
    });
  }
}

function renderDesempenoEquipoCards(grupos) {
  const grid = document.getElementById('de-grid');
  const toolbar = document.getElementById('de-cards-toolbar');
  if (!grid) return;

  if (!grupos.length) {
    grid.innerHTML = '';
    if (toolbar) toolbar.style.display = 'none';
    return;
  }
  if (toolbar) toolbar.style.display = 'flex';

  const esc = deEscHtml;
  grid.innerHTML = grupos
    .map((g, cardIdx) => {
      const max = g.ranking[0]?.cantidad || 1;
      const servId = 'de-serv-' + cardIdx;
      const rows = g.ranking
        .map((r, i) => {
          const pct = max > 0 ? Math.round((r.cantidad / max) * 100) : 0;
          const medal = deMedalHtml(i);
          const topClass =
            i === 0 ? ' de-rank-top' : i === 1 ? ' de-rank-second' : i === 2 ? ' de-rank-third' : '';
          const barColor = deEmpColorMap[r.eid] || DE_CHART_COLORS[0];
          return `<li class="de-rank-row${topClass}">
            <span class="de-medal-wrap">${medal}</span>
            <span class="de-rank-name">${esc(r.nombre)}</span>
            <span class="de-rank-qty">${r.cantidad}</span>
            <span class="de-bar-track" aria-hidden="true"><span class="de-bar-fill" style="width:${pct}%;background:${barColor}"></span></span>
          </li>`;
        })
        .join('');
      return `<article class="de-card" id="${servId}" data-de-servicio="${encodeURIComponent(g.servicio)}">
        <label class="de-card-select" title="Incluir en PDF">
          <input type="checkbox" class="pdf-checkbox de-card-print-cb" checked aria-label="Incluir ${esc(g.servicio)} en PDF">
          <span class="de-card-select-ui"></span>
        </label>
        <h3 class="de-card-title">${esc(g.servicio.toUpperCase())}</h3>
        <p class="de-card-total">${g.ranking.reduce((s, r) => s + r.cantidad, 0)} servicios en el periodo</p>
        <ul class="de-rank-list">${rows}</ul>
      </article>`;
    })
    .join('');

  const selAll = document.getElementById('de-select-all');
  if (selAll) selAll.checked = true;
}

function deToggleSelectAllCards(checked) {
  document.querySelectorAll('.pdf-checkbox').forEach((cb) => {
    if (cb.id !== 'de-select-all') cb.checked = checked;
  });
}

const DE_PDF_STYLES = `
  * { box-sizing: border-box; }
  .de-pdf-root {
    width: 100%;
    max-width: 100%;
    padding: 0;
    font-family: "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif;
    font-size: 9.5pt;
    line-height: 1.45;
    color: #1f2430;
    background: #fff;
  }
  .de-pdf-header {
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid #1b1b2f;
  }
  .de-pdf-kicker {
    margin: 0 0 4px;
    font-size: 7.5pt;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #5c6370;
  }
  .de-pdf-brand {
    margin: 0 0 6px;
    font-family: Georgia, "Times New Roman", Times, serif;
    font-size: 20pt;
    font-weight: 700;
    color: #000;
    letter-spacing: 0.04em;
  }
  .de-pdf-subtitle {
    margin: 0 0 4px;
    font-size: 10pt;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #3d4252;
  }
  .de-pdf-period {
    margin: 0;
    font-size: 9pt;
    color: #5c6370;
  }
  .de-pdf-kpis {
    display: table;
    width: 100%;
    border-collapse: separate;
    border-spacing: 8px 0;
    margin-bottom: 14px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .de-pdf-kpi {
    display: table-cell;
    width: 25%;
    vertical-align: top;
    border: 1px solid #d6dae2;
    background: #f7f8fb;
    padding: 10px 12px;
  }
  .de-pdf-kpi-lbl {
    display: block;
    font-size: 7.5pt;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #5c6370;
    margin-bottom: 4px;
  }
  .de-pdf-kpi-val {
    display: block;
    font-size: 16pt;
    font-weight: 700;
    color: #1b1b2f;
    line-height: 1.15;
  }
  .de-pdf-kpi-sub {
    display: block;
    font-size: 8pt;
    color: #6b7280;
    margin-top: 2px;
  }
  .de-pdf-charts {
    display: table;
    width: 100%;
    border-collapse: separate;
    border-spacing: 10px 0;
    margin-bottom: 16px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .de-pdf-chart-cell {
    display: table-cell;
    width: 50%;
    vertical-align: top;
    border: 1px solid #d6dae2;
    padding: 10px 10px 8px;
    background: #fff;
  }
  .de-pdf-chart-cap {
    margin: 0 0 6px;
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #3d4252;
  }
  .de-pdf-chart-cell img {
    display: block;
    width: 100%;
    height: auto;
    max-height: 200px;
    object-fit: contain;
  }
  .de-pdf-sec {
    margin-bottom: 14px;
  }
  .de-pdf-sec-avoid {
    page-break-inside: avoid;
    break-inside: avoid-page;
  }
  .de-pdf-sec-services .de-pdf-sec-title {
    page-break-after: avoid;
    break-after: avoid-page;
  }
  .de-pdf-sec-title {
    margin: 0 0 8px;
    font-size: 10pt;
    font-weight: 700;
    color: #000;
    padding-bottom: 4px;
    border-bottom: 1px solid #d6dae2;
  }
  .de-pdf-tbl {
    width: 100%;
    border-collapse: collapse;
    font-size: 9pt;
    border: 1px solid #d6dae2;
  }
  .de-pdf-tbl th {
    text-align: left;
    padding: 7px 9px;
    background: #1b1b2f;
    color: #fff;
    font-weight: 600;
    font-size: 8pt;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .de-pdf-tbl td {
    padding: 6px 9px;
    border-bottom: 1px solid #e8eaef;
    color: #1f2430;
    vertical-align: middle;
  }
  .de-pdf-tbl tr:nth-child(even) td { background: #f7f8fb; }
  .de-pdf-tbl .de-pdf-td-num {
    text-align: right;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .de-pdf-tbl .de-pdf-td-pct {
    text-align: right;
    color: #5c6370;
    font-variant-numeric: tabular-nums;
  }
  .de-pdf-bar-cell { min-width: 90px; }
  .de-pdf-bar-wrap {
    height: 6px;
    background: #e8eaef;
    border-radius: 2px;
    overflow: hidden;
  }
  .de-pdf-bar-fill {
    display: block;
    height: 6px;
    background: #5c6370;
    border-radius: 2px;
  }
  .de-pdf-services {
    display: block;
    width: 100%;
  }
  .de-pdf-serv-item {
    display: block;
    width: 100%;
    margin-bottom: 10px;
    page-break-inside: avoid !important;
    break-inside: avoid-page !important;
  }
  .de-pdf-page-break-before {
    page-break-before: always !important;
    break-before: page !important;
  }
  .de-pdf-serv-item:last-child { margin-bottom: 0; }
  .de-pdf-serv-block {
    width: 100%;
    border: 1px solid #d6dae2;
    padding: 0;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .de-pdf-serv-head {
    background: #f7f8fb;
    padding: 8px 10px;
    border-bottom: 1px solid #d6dae2;
    page-break-after: avoid !important;
    break-after: avoid-page !important;
  }
  .de-pdf-serv-block .de-pdf-tbl {
    page-break-before: avoid !important;
    break-before: avoid-page !important;
  }
  .de-pdf-serv-name {
    margin: 0;
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #1b1b2f;
  }
  .de-pdf-serv-meta {
    margin: 2px 0 0;
    font-size: 8pt;
    color: #5c6370;
  }
  .de-pdf-serv-block .de-pdf-tbl {
    border: none;
    margin: 0;
    width: 100%;
    table-layout: fixed;
  }
  .de-pdf-serv-block .de-pdf-tbl td:nth-child(2) {
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  .de-pdf-serv-block .de-pdf-tbl th {
    background: #eef0f4;
    color: #1f2430;
    font-size: 7.5pt;
  }
  .de-pdf-footer {
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid #d6dae2;
    font-size: 7.5pt;
    color: #6b7280;
    text-align: center;
  }
`;

function deChartCanvasToPng(chart) {
  if (!chart) return null;
  try {
    chart.update('none');
    if (typeof chart.toBase64Image === 'function') {
      return chart.toBase64Image('image/png', 1);
    }
    if (chart.canvas) return chart.canvas.toDataURL('image/png', 1.0);
  } catch (e) {
    console.warn('deChartCanvasToPng', e);
  }
  return null;
}

/** GrÃ¡ficas en canvas oculto con paleta corporativa (no altera las de pantalla). */
function deCreatePdfChartPng(chartConfig) {
  if (typeof Chart === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 560;
  canvas.height = 320;
  let chart = null;
  try {
    chart = new Chart(canvas.getContext('2d'), chartConfig);
    chart.update('none');
    return canvas.toDataURL('image/png', 1.0);
  } catch (e) {
    console.warn('deCreatePdfChartPng', e);
    return null;
  } finally {
    if (chart) chart.destroy();
  }
}

function deGetPdfDonaImage(grupos) {
  const empTotals = totalesPorEmpleada(grupos);
  if (!empTotals.length) return null;
  const colors = empTotals.map((e, i) => deColorForEmpleada(e.eid, i));
  return deCreatePdfChartPng({
    type: 'doughnut',
    data: {
      labels: empTotals.map((e) => e.nombre),
      datasets: [
        {
          data: empTotals.map((e) => e.cantidad),
          backgroundColor: colors,
          borderColor: '#ffffff',
          borderWidth: 2,
        },
      ],
    },
    options: {
      animation: false,
      responsive: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 10, padding: 8, font: { size: 10 }, color: '#1f2430' },
        },
      },
    },
  });
}

function deGetPdfBarImage(grupos) {
  const top5 = top5Servicios(grupos);
  if (!top5.length) return null;
  const empTotals = totalesPorEmpleada(grupos);
  const datasets = empTotals.map((emp, i) => ({
    label: emp.nombre,
    data: top5.map((s) => {
      const row = s.ranking.find((r) => r.eid === emp.eid);
      return row ? row.cantidad : 0;
    }),
    backgroundColor: deColorForEmpleada(emp.eid, i),
    borderColor: DE_CHART_BORDERS[i % DE_CHART_BORDERS.length],
    borderWidth: 1,
    maxBarThickness: 36,
  }));
  return deCreatePdfChartPng({
    type: 'bar',
    data: {
      labels: top5.map((s) => s.servicio),
      datasets,
    },
    options: {
      animation: false,
      responsive: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 10, padding: 6, font: { size: 9 }, color: '#1f2430' },
        },
      },
      scales: {
        x: { ticks: { font: { size: 9 }, color: '#3d4252', maxRotation: 40, minRotation: 0 }, grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, precision: 0, font: { size: 9 }, color: '#5c6370' },
          grid: { color: '#e8eaef' },
        },
      },
    },
  });
}

function computeDePdfMetrics(grupos) {
  const empTotals = totalesPorEmpleada(grupos);
  const totalServicios = empTotals.reduce((s, e) => s + e.cantidad, 0);
  const topEmp = empTotals[0] || null;
  const topServ = [...grupos].sort((a, b) => {
    const ta = a.ranking.reduce((s, r) => s + r.cantidad, 0);
    const tb = b.ranking.reduce((s, r) => s + r.cantidad, 0);
    return tb - ta;
  })[0];
  return {
    totalServicios,
    numEmpleadas: empTotals.length,
    numServicios: grupos.length,
    topEmp,
    topServ,
    empTotals,
  };
}

/** Servicios marcados con .pdf-checkbox en la cuadrÃ­cula. */
function getDesempenoServiciosSeleccionados() {
  const set = new Set();
  document.querySelectorAll('#de-grid .de-card').forEach((card) => {
    const cb = card.querySelector('.pdf-checkbox');
    if (!cb?.checked) return;
    const raw = card.getAttribute('data-de-servicio');
    if (!raw) return;
    try {
      set.add(decodeURIComponent(raw));
    } catch (e) {
      set.add(raw);
    }
  });
  return set;
}

function buildDePdfKpisHtml(metrics) {
  const topEmpTxt = metrics.topEmp
    ? deEscHtml(metrics.topEmp.nombre) + ' (' + metrics.topEmp.cantidad + ')'
    : '-';
  const topServTotal = metrics.topServ
    ? metrics.topServ.ranking.reduce((s, r) => s + r.cantidad, 0)
    : 0;
  const topServTxt = metrics.topServ
    ? deEscHtml(metrics.topServ.servicio) + ' (' + topServTotal + ')'
    : '-';
  return (
    '<section class="de-pdf-kpis">' +
    '<div class="de-pdf-kpi"><span class="de-pdf-kpi-lbl">Servicios registrados</span>' +
    '<span class="de-pdf-kpi-val">' +
    metrics.totalServicios +
    '</span><span class="de-pdf-kpi-sub">En el periodo seleccionado</span></div>' +
    '<div class="de-pdf-kpi"><span class="de-pdf-kpi-lbl">Empleadas activas</span>' +
    '<span class="de-pdf-kpi-val">' +
    metrics.numEmpleadas +
    '</span><span class="de-pdf-kpi-sub">Con al menos un servicio</span></div>' +
    '<div class="de-pdf-kpi"><span class="de-pdf-kpi-lbl">Tipos de servicio</span>' +
    '<span class="de-pdf-kpi-val">' +
    metrics.numServicios +
    '</span><span class="de-pdf-kpi-sub">Incluidos en este reporte</span></div>' +
    '<div class="de-pdf-kpi"><span class="de-pdf-kpi-lbl">Mayor volumen</span>' +
    '<span class="de-pdf-kpi-val" style="font-size:11pt">' +
    topEmpTxt +
    '</span><span class="de-pdf-kpi-sub">Servicio lider: ' +
    topServTxt +
    '</span></div></section>'
  );
}

function buildDePdfResumenEmpleadasHtml(empTotals, totalGeneral) {
  if (!empTotals.length) return '';
  const rows = empTotals
    .map((e, i) => {
      const pct = totalGeneral > 0 ? ((e.cantidad / totalGeneral) * 100).toFixed(1) : '0.0';
      const rel = totalGeneral > 0 ? Math.round((e.cantidad / totalGeneral) * 100) : 0;
      return (
        '<tr><td>' +
        (i + 1) +
        '</td><td>' +
        deEscHtml(e.nombre) +
        '</td><td class="de-pdf-td-num">' +
        e.cantidad +
        '</td><td class="de-pdf-td-pct">' +
        pct +
        '%</td><td class="de-pdf-bar-cell"><span class="de-pdf-bar-wrap"><span class="de-pdf-bar-fill" style="width:' +
        rel +
        '%"></span></span></td></tr>'
      );
    })
    .join('');
  return (
    '<section class="de-pdf-sec de-pdf-sec-avoid">' +
    '<h2 class="de-pdf-sec-title">Resumen por empleada</h2>' +
    '<table class="de-pdf-tbl"><thead><tr><th>#</th><th>Empleada</th><th>Servicios</th><th>% del total</th><th>Participacion</th></tr></thead><tbody>' +
    rows +
    '</tbody></table></section>'
  );
}

function buildDeServiceBlockHtml(g) {
  const esc = deEscHtml;
  const total = g.ranking.reduce((s, r) => s + r.cantidad, 0);
  const max = g.ranking[0]?.cantidad || 1;
  const rows = g.ranking
    .map((r, i) => {
      const pctServ = total > 0 ? ((r.cantidad / total) * 100).toFixed(1) : '0.0';
      const rel = max > 0 ? Math.round((r.cantidad / max) * 100) : 0;
      return (
        '<tr><td>' +
        (i + 1) +
        '</td><td>' +
        esc(r.nombre) +
        '</td><td class="de-pdf-td-num">' +
        r.cantidad +
        '</td><td class="de-pdf-td-pct">' +
        pctServ +
        '%</td><td class="de-pdf-bar-cell"><span class="de-pdf-bar-wrap"><span class="de-pdf-bar-fill" style="width:' +
        rel +
        '%"></span></span></td></tr>'
      );
    })
    .join('');
  return (
    '<div class="de-pdf-serv-block">' +
    '<div class="de-pdf-serv-head"><p class="de-pdf-serv-name">' +
    esc(g.servicio) +
    '</p><p class="de-pdf-serv-meta">' +
    total +
    ' servicios | ' +
    g.ranking.length +
    ' empleada' +
    (g.ranking.length === 1 ? '' : 's') +
    '</p></div>' +
    '<table class="de-pdf-tbl"><thead><tr><th>#</th><th>Empleada</th><th>Cant.</th><th>%</th><th>Relativo</th></tr></thead><tbody>' +
    rows +
    '</tbody></table></div>'
  );
}

function buildDePdfServicesGridHtml(grupos) {
  if (!grupos.length) return '';
  let html =
    '<section class="de-pdf-sec de-pdf-sec-services"><h2 class="de-pdf-sec-title">Detalle por servicio</h2><div class="de-pdf-services">';
  for (let i = 0; i < grupos.length; i++) {
    html += '<div class="de-pdf-serv-item">' + buildDeServiceBlockHtml(grupos[i]) + '</div>';
  }
  html += '</div></section>';
  return html;
}

const DE_PDF_PAGE_MM = { w: 215.9, h: 279.4, margin: { top: 12, right: 12, bottom: 14, left: 12 } };

/** Altura util de una pagina letter en px (proporcional al ancho del contenido). */
function deGetPdfPageContentHeightPx(widthPx) {
  const w = widthPx > 0 ? widthPx : 720;
  const contentHmm = DE_PDF_PAGE_MM.h - DE_PDF_PAGE_MM.margin.top - DE_PDF_PAGE_MM.margin.bottom;
  return (contentHmm / DE_PDF_PAGE_MM.w) * w;
}

/** Si un bloque de servicio no cabe en la pagina actual, fuerza salto antes (titulo + tabla juntos). */
function deApplyServItemPageBreaks(rootEl) {
  if (!rootEl) return;
  const items = [...rootEl.querySelectorAll('.de-pdf-serv-item')];
  if (!items.length) return;

  const pageH = deGetPdfPageContentHeightPx(rootEl.offsetWidth);
  const rootTop = rootEl.getBoundingClientRect().top;
  const maxIter = items.length * 4 + 8;
  let iter = 0;

  while (iter++ < maxIter) {
    items.forEach((el) => el.classList.remove('de-pdf-page-break-before'));
    let moved = false;
    for (const el of items) {
      const r = el.getBoundingClientRect();
      const top = r.top - rootTop;
      const bottom = r.bottom - rootTop;
      if (top < 1) continue;
      const pageIdx = Math.floor(top / pageH);
      const pageEnd = (pageIdx + 1) * pageH;
      if (bottom > pageEnd - 2 && top < pageEnd - 2) {
        el.classList.add('de-pdf-page-break-before');
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }
}

/** Renderiza el HTML en iframe oculto, calcula saltos y devuelve HTML listo para html2pdf. */
function dePreparePdfHtmlForExport(fullHtml) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;left:-12000px;top:0;width:8.5in;border:0;visibility:hidden;';
    document.body.appendChild(iframe);
    const idoc = iframe.contentDocument || iframe.contentWindow.document;
    idoc.open();
    idoc.write(fullHtml);
    idoc.close();

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try {
        const root = idoc.querySelector('.de-pdf-root');
        if (root) deApplyServItemPageBreaks(root);
        const out = '<!doctype html>\n' + idoc.documentElement.outerHTML;
        iframe.remove();
        resolve(out);
      } catch (e) {
        iframe.remove();
        reject(e);
      }
    };

    const imgs = [...idoc.querySelectorAll('img')];
    if (!imgs.length) {
      requestAnimationFrame(() => requestAnimationFrame(finish));
      return;
    }
    let pending = imgs.length;
    const tick = () => {
      pending--;
      if (pending <= 0) finish();
    };
    imgs.forEach((img) => {
      if (img.complete) tick();
      else {
        img.addEventListener('load', tick, { once: true });
        img.addEventListener('error', tick, { once: true });
      }
    });
    setTimeout(finish, 2500);
  });
}

/** Documento HTML completo (mismo patron que cierre de caja - evita PDF en blanco). */
function buildDesempenoPdfHtml() {
  const inicio = document.getElementById('de-f-inicio')?.value || '';
  const fin = document.getElementById('de-f-fin')?.value || '';
  const periodoTxt = document.getElementById('de-periodo-lbl')?.textContent || '';
  const empresa =
    typeof cfg !== 'undefined' && cfg.nombreEmpresa
      ? String(cfg.nombreEmpresa).toUpperCase()
      : 'ESTETICA ROMINA';

  const seleccion = getDesempenoServiciosSeleccionados();
  const gruposPdf = deLastGrupos.filter((g) => seleccion.has(g.servicio));
  const metrics = computeDePdfMetrics(gruposPdf);
  const totalGeneral = metrics.totalServicios || 1;

  const donaPng = deChartCanvasToPng(deChartDona) || deGetPdfDonaImage(gruposPdf);
  const barPng = deChartCanvasToPng(deChartBarras) || deGetPdfBarImage(gruposPdf);

  let chartsHtml = '';
  if (donaPng || barPng) {
    chartsHtml = '<section class="de-pdf-charts">';
    if (donaPng) {
      chartsHtml +=
        '<div class="de-pdf-chart-cell"><p class="de-pdf-chart-cap">Distribucion por empleada</p><img src="' +
        donaPng +
        '" alt="Distribucion" /></div>';
    }
    if (barPng) {
      chartsHtml +=
        '<div class="de-pdf-chart-cell"><p class="de-pdf-chart-cap">Top 5 servicios</p><img src="' +
        barPng +
        '" alt="Top servicios" /></div>';
    }
    chartsHtml += '</section>';
  }

  const generado = new Date().toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const bodyHtml =
    '<div class="de-pdf-root">' +
    '<header class="de-pdf-header">' +
    '<p class="de-pdf-kicker">Reporte interno</p>' +
    '<h1 class="de-pdf-brand">' +
    deEscHtml(empresa) +
    '</h1>' +
    '<p class="de-pdf-subtitle">Rendimiento y productividad del equipo</p>' +
    '<p class="de-pdf-period">' +
    deEscHtml(periodoTxt || 'Periodo: ' + inicio + ' - ' + fin) +
    '</p>' +
    '</header>' +
    buildDePdfKpisHtml(metrics) +
    chartsHtml +
    buildDePdfResumenEmpleadasHtml(metrics.empTotals, totalGeneral) +
    buildDePdfServicesGridHtml(gruposPdf) +
    '<footer class="de-pdf-footer">Documento generado el ' +
    deEscHtml(generado) +
    ' | Cantidades basadas en servicios registrados (sin montos)</footer>' +
    '</div>';

  return (
    '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="UTF-8">\n<title>DesempeÃ±o del Equipo</title>\n<style>' +
    DE_PDF_STYLES +
    '</style>\n</head>\n<body style="margin:0;padding:12px 20px;background:#fff;color:#1f2430;">' +
    bodyHtml +
    '</body>\n</html>'
  );
}

async function exportarDesempenoPDF() {
  if (typeof html2pdf === 'undefined') {
    showToast('bad', 'âŒ No se cargÃ³ la librerÃ­a html2pdf.js. Recarga la pÃ¡gina.');
    return;
  }

  if (!getDesempenoServiciosSeleccionados().size) {
    showToast('bad', 'âŒ Marca al menos una tarjeta para exportar.');
    return;
  }
  if (!deLastGrupos.length) {
    showToast('bad', 'âŒ No hay datos. Aplica un filtro primero.');
    return;
  }

  const inicio = document.getElementById('de-f-inicio')?.value || 'inicio';
  const fin = document.getElementById('de-f-fin')?.value || 'fin';

  try {
    const htmlTemplate = await dePreparePdfHtmlForExport(buildDesempenoPdfHtml());
    const opt = {
      margin: [12, 12, 14, 12],
      filename: 'Desempeno_Equipo_' + inicio + '_' + fin + '.pdf',
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        letterRendering: true,
        logging: false,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
      },
      jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
      pagebreak: {
        mode: ['css', 'legacy'],
        before: '.de-pdf-page-break-before',
        avoid: ['.de-pdf-serv-item', '.de-pdf-serv-block', '.de-pdf-header', '.de-pdf-kpis', '.de-pdf-charts', '.de-pdf-sec-avoid'],
      },
    };

    await html2pdf().from(htmlTemplate).set(opt).save();
    showToast('ok', 'âœ… PDF generado correctamente.');
  } catch (e) {
    console.error('exportarDesempenoPDF', e);
    showToast('bad', 'âŒ No se pudo generar el PDF: ' + (e.message || e));
  }
}

function exportarDesempenoPdf() {
  return exportarDesempenoPDF();
}

function actualizarDesempenoPeriodoLbl(inicio, fin) {
  const el = document.getElementById('de-periodo-lbl');
  const printSub = document.getElementById('de-print-sub');
  const d1 = new Date(inicio + 'T12:00:00');
  const d2 = new Date(fin + 'T12:00:00');
  const fmt = (d) =>
    d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  const txt = `Periodo: ${fmt(d1)} - ${fmt(d2)}`;
  if (el) el.textContent = txt;
  if (printSub) printSub.textContent = txt;
}

async function filtrarDesempenoEquipo() {
  const inicio = document.getElementById('de-f-inicio')?.value;
  const fin = document.getElementById('de-f-fin')?.value;
  const loading = document.getElementById('de-loading');
  const empty = document.getElementById('de-empty');
  const grid = document.getElementById('de-grid');
  const chartsWrap = document.getElementById('de-charts-wrap');

  if (!inicio || !fin) {
    showToast('bad', 'âŒ Selecciona fecha inicio y fin.');
    return;
  }
  if (inicio > fin) {
    showToast('bad', 'âŒ La fecha inicio no puede ser posterior a la fecha fin.');
    return;
  }

  if (loading) loading.style.display = 'block';
  if (empty) empty.style.display = 'none';
  if (grid) grid.innerHTML = '';
  if (chartsWrap) chartsWrap.style.display = 'none';
  deDestroyCharts();

  try {
    await loadEmpsCache();
    const empNombrePorId = {};
    emps.forEach((e) => {
      empNombrePorId[e.id] = e.nombre;
    });

    const snap = await db
      .collection('ventas')
      .where('fecha', '>=', inicio)
      .where('fecha', '<=', fin)
      .get();

    const ventas = snap.docs.map((d) => d.data());
    const grupos = agruparDesempenoPorServicio(ventas, empNombrePorId);
    deLastGrupos = grupos;
    deEmpColorMap = buildDeEmpColorMap(grupos);
    actualizarDesempenoPeriodoLbl(inicio, fin);

    if (!grupos.length) {
      if (empty) empty.style.display = 'flex';
      if (grid) grid.innerHTML = '';
      const tb = document.getElementById('de-cards-toolbar');
      if (tb) tb.style.display = 'none';
    } else {
      if (empty) empty.style.display = 'none';
      renderDesempenoCharts(grupos);
      renderDesempenoEquipoCards(grupos);
    }
  } catch (e) {
    console.error('filtrarDesempenoEquipo', e);
    showToast('bad', 'âŒ Error: ' + e.message);
    if (grid) grid.innerHTML = `<p class="de-error">${deEscHtml(e.message)}</p>`;
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

async function loadDesempenoEquipo() {
  initDesempenoEquipoFechas();
  await filtrarDesempenoEquipo();
}
