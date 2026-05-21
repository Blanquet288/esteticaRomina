/* Caja y Cierres: calculadora libre, arqueo mensual, cuadre y reparto 50/50 */

const ARQ_BILL_DENOMS = [1000, 500, 200, 100, 50, 20];
const ARQ_WEEKS = [1, 2, 3, 4];

/** Billetes MX optimizados WebP (img/billetes/). */
const ARQ_BILL_IMAGES = {
  1000: 'img/billetes/billete1000.webp',
  500: 'img/billetes/billete500.webp',
  200: 'img/billetes/billete200.webp',
  100: 'img/billetes/billete100.webp',
  50: 'img/billetes/billete50.webp',
  20: 'img/billetes/billete20.webp',
};

let arqueoState = {
  mainTab: 'libre',
  monthKey: '',
  activeWeek: 1,
  semanas: null,
  splitResult: null,
  step: 'conteo',
  cuadreSemanas: [0, 0, 0, 0],
  totalTeoricoMes: 0,
  loadedFromFirestore: false,
  historialDT: null,
  historialClickBound: false,
  gavetaBound: false,
  captura: null,
};

const ARQ_DT_LANG = {
  search: 'Buscar:',
  searchPlaceholder: 'Mes, monto…',
  lengthMenu: 'Mostrar _MENU_ registros',
  info: '_START_–_END_ de _TOTAL_ cierres',
  infoEmpty: 'Sin cierres registrados',
  infoFiltered: '(_MAX_ en total, filtrado)',
  zeroRecords: 'Ningún cierre coincide con la búsqueda',
  emptyTable: 'No hay cierres mensuales guardados',
  paginate: { first: 'Primera', last: 'Última', next: 'Siguiente', previous: 'Anterior' },
};

function arqCierreSortTs(data, docId) {
  const ts = data.actualizadoEn;
  if (ts && typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts && typeof ts.seconds === 'number') return ts.seconds * 1000;
  const m = normalizeMonthYYYYMM(data.mes || docId);
  if (m) {
    const p = m.split('-').map(Number);
    return new Date(p[0], p[1] - 1, 1).getTime();
  }
  const f = data.fecha || '';
  if (f.length >= 10) {
    const d = new Date(f.slice(0, 10) + 'T12:00:00');
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  return 0;
}

function arqHistorialDiffHtml(diferencia) {
  const d = Math.round((Number(diferencia) || 0) * 100) / 100;
  let cls = 'arq-cuadre-ok';
  let label = $m(0);
  if (Math.abs(d) < 0.01) {
    label = $m(0);
  } else if (d < 0) {
    cls = 'arq-cuadre-faltante';
    label = $m(d);
  } else {
    cls = 'arq-cuadre-sobrante';
    label = '+' + $m(d);
  }
  return '<span class="arq-hist-diff ' + cls + '">' + label + '</span>';
}

function arqDestroyHistorialDT() {
  if (arqueoState.historialDT) {
    try {
      arqueoState.historialDT.destroy();
    } catch (e) {
      console.warn('arqDestroyHistorialDT', e);
    }
    arqueoState.historialDT = null;
  }
}

function arqBindHistorialEditClicks() {
  if (arqueoState.historialClickBound) return;
  const wrap = document.getElementById('arq-hist-table-wrap');
  if (!wrap) return;
  wrap.addEventListener('click', (e) => {
    const btnEdit = e.target.closest('[data-arq-edit]');
    if (btnEdit) {
      const monthKey = btnEdit.getAttribute('data-arq-edit');
      if (monthKey) arqAbrirEdicionCierre(monthKey);
      return;
    }
    const btnDel = e.target.closest('[data-arq-delete]');
    if (btnDel) {
      const monthKey = btnDel.getAttribute('data-arq-delete');
      if (monthKey) eliminarCierreMensual(monthKey);
    }
  });
  arqueoState.historialClickBound = true;
}

/** Elimina permanentemente un cierre mensual de Firestore (entorno de pruebas). */
async function eliminarCierreMensual(idMes) {
  const monthKey = normalizeMonthYYYYMM(idMes);
  if (!monthKey) {
    showToast('bad', 'Mes de cierre no válido.');
    return;
  }

  const etiqueta = formatMonthLabel(monthKey) || monthKey;
  if (
    !confirm(
      '¿Estás seguro de que deseas eliminar permanentemente el cierre de ' +
        etiqueta +
        '? Esta acción no se puede deshacer.'
    )
  ) {
    return;
  }

  try {
    await db.collection('cierres_mensuales').doc(monthKey).delete();

    if (arqueoState.monthKey === monthKey) {
      arqueoState.loadedFromFirestore = false;
      arqueoState.splitResult = null;
      arqueoState.semanas = arqInitSemanas();
      const inp = document.getElementById('arq-m');
      if (inp && inp.value === monthKey) {
        arqClearMensualInputs();
        arqUpdateWeekSubtotals();
      }
    }

    showToast('ok', 'Cierre de ' + etiqueta + ' eliminado.');
    await arqLoadHistorial();
  } catch (e) {
    console.error('eliminarCierreMensual', e);
    showToast('bad', 'No se pudo eliminar: ' + (e.message || e));
  }
}

async function arqLoadHistorial() {
  const loading = document.getElementById('arq-hist-loading');
  const wrap = document.getElementById('arq-hist-table-wrap');
  const empty = document.getElementById('arq-hist-empty');
  const tbody = document.getElementById('arq-hist-tbody');
  if (!tbody) return;

  arqBindHistorialEditClicks();
  if (loading) loading.style.display = 'block';
  if (wrap) wrap.style.display = 'none';
  if (empty) empty.style.display = 'none';

  arqDestroyHistorialDT();

  try {
    const snap = await db.collection('cierres_mensuales').get();
    const rows = snap.docs
      .map((doc) => {
        const data = doc.data();
        const monthKey = normalizeMonthYYYYMM(data.mes || doc.id) || doc.id;
        const teo = Number(data.totalTeoricoSistema) || 0;
        const fis = Number(data.totalFisico) || 0;
        const diff =
          data.diferencia != null && !Number.isNaN(Number(data.diferencia))
            ? Number(data.diferencia)
            : Math.round((fis - teo) * 100) / 100;
        return {
          monthKey,
          label: formatMonthLabel(monthKey),
          teo,
          fis,
          diff,
          sortTs: arqCierreSortTs(data, doc.id),
        };
      })
      .filter((r) => r.monthKey)
      .sort((a, b) => b.sortTs - a.sortTs);

    if (!rows.length) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }

    tbody.innerHTML = rows
      .map(
        (r) =>
          '<tr>' +
          '<td data-order="' +
          r.monthKey +
          '"><strong>' +
          (r.label || r.monthKey) +
          '</strong></td>' +
          '<td data-order="' +
          r.teo +
          '">' +
          $m(r.teo) +
          '</td>' +
          '<td data-order="' +
          r.fis +
          '">' +
          $m(r.fis) +
          '</td>' +
          '<td data-order="' +
          r.diff +
          '">' +
          arqHistorialDiffHtml(r.diff) +
          '</td>' +
          '<td data-order="' +
          r.sortTs +
          '">' +
          r.sortTs +
          '</td>' +
          '<td class="arq-hist-actions">' +
          '<button type="button" class="btn btn-s arq-hist-edit-btn" data-arq-edit="' +
          r.monthKey +
          '" title="Editar cierre">✏️ Editar</button> ' +
          '<button type="button" class="btn btn-s btn-bad arq-hist-delete-btn" data-arq-delete="' +
          r.monthKey +
          '" title="Eliminar cierre">🗑️ Eliminar</button></td>' +
          '</tr>'
      )
      .join('');

    if (wrap) wrap.style.display = 'block';

    if (typeof DataTable !== 'undefined') {
      arqueoState.historialDT = new DataTable('#arq-hist-table', {
        order: [[4, 'desc']],
        columnDefs: [
          { targets: 4, visible: false, searchable: false },
          { targets: 5, orderable: false, searchable: false },
        ],
        pageLength: 12,
        lengthMenu: [10, 12, 25, 50],
        language: ARQ_DT_LANG,
      });
    }
  } catch (e) {
    console.error('arqLoadHistorial', e);
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center;color:var(--bad)">Error al cargar: ' +
      (e.message || e) +
      '</td></tr>';
    if (wrap) wrap.style.display = 'block';
    showToast('bad', 'No se pudo cargar el historial de cierres.');
  } finally {
    if (loading) loading.style.display = 'none';
  }
}

async function arqAbrirEdicionCierre(monthKey) {
  const m = normalizeMonthYYYYMM(monthKey);
  if (!m) {
    showToast('bad', 'Mes de cierre no válido.');
    return;
  }

  const tabBtn = document.querySelector('#pg-caja-cierres .caja-main-tabs .tab[data-arq-tab="mensual"]');
  arqSwitchMainTab('mensual', tabBtn);
  await arqEnsureMensualReady();

  const inp = document.getElementById('arq-m');
  if (inp) inp.value = m;

  arqueoState.splitResult = null;
  arqShowStep('conteo');
  const loaded = await arqOnMesChange({ showResultadoStep: false, silentLoad: true, skipClear: true });
  arqSwitchSemana(1, document.querySelector('#pg-caja-cierres .arq-week-tabs .tab'));
  if (!loaded) showToast('bad', 'No se encontró el cierre de ' + formatMonthLabel(m) + ' en Firestore.');
  else
    showToast(
      'info',
      'Editando cierre de ' + formatMonthLabel(m) + '. Corrija el conteo y vuelva a procesar el reparto.'
    );
}

function arqEmptyWeek() {
  const w = { monedas: 0 };
  ARQ_BILL_DENOMS.forEach((d) => {
    w[String(d)] = 0;
  });
  return w;
}

function arqInitSemanas() {
  const s = {};
  ARQ_WEEKS.forEach((w) => {
    s[w] = arqEmptyWeek();
  });
  return s;
}

function arqWeekTotal(week) {
  if (!week) return 0;
  let t = Number(week.monedas) || 0;
  ARQ_BILL_DENOMS.forEach((d) => {
    t += (parseInt(week[String(d)], 10) || 0) * d;
  });
  return Math.round(t * 100) / 100;
}

function arqCloneInventory(semanas) {
  const inv = {};
  ARQ_WEEKS.forEach((w) => {
    const src = semanas[w] || arqEmptyWeek();
    inv[w] = { monedas: Math.round((Number(src.monedas) || 0) * 100) / 100 };
    ARQ_BILL_DENOMS.forEach((d) => {
      inv[w][String(d)] = Math.max(0, parseInt(src[String(d)], 10) || 0);
    });
  });
  return inv;
}

function arqAllocatePartner(targetPesos, inv) {
  const toma = {};
  ARQ_WEEKS.forEach((w) => {
    toma[w] = arqEmptyWeek();
  });

  let remainingCents = Math.round(targetPesos * 100);

  ARQ_BILL_DENOMS.forEach((denom) => {
    const denomCents = denom * 100;
    ARQ_WEEKS.forEach((w) => {
      const key = String(denom);
      while (remainingCents >= denomCents && (inv[w][key] || 0) > 0) {
        inv[w][key]--;
        toma[w][key] = (toma[w][key] || 0) + 1;
        remainingCents -= denomCents;
      }
    });
  });

  ARQ_WEEKS.forEach((w) => {
    if (remainingCents <= 0) return;
    const availCents = Math.round((Number(inv[w].monedas) || 0) * 100);
    if (availCents <= 0) return;
    const takeCents = Math.min(availCents, remainingCents);
    inv[w].monedas = Math.round((availCents - takeCents)) / 100;
    toma[w].monedas = Math.round(((Number(toma[w].monedas) || 0) * 100 + takeCents)) / 100;
    remainingCents -= takeCents;
  });

  let monto = 0;
  ARQ_WEEKS.forEach((w) => {
    monto += arqWeekTotal(toma[w]);
  });

  return { toma, remainingCents, monto: Math.round(monto * 100) / 100 };
}

function arqExtractRemainder(inv) {
  const toma = {};
  ARQ_WEEKS.forEach((w) => {
    toma[w] = arqEmptyWeek();
    ARQ_BILL_DENOMS.forEach((d) => {
      const key = String(d);
      toma[w][key] = inv[w][key] || 0;
      inv[w][key] = 0;
    });
    toma[w].monedas = Math.round((Number(inv[w].monedas) || 0) * 100) / 100;
    inv[w].monedas = 0;
  });
  let monto = 0;
  ARQ_WEEKS.forEach((w) => {
    monto += arqWeekTotal(toma[w]);
  });
  return { toma, monto: Math.round(monto * 100) / 100 };
}

function arqProcesarReparto(semanas) {
  const total = ARQ_WEEKS.reduce((s, w) => s + arqWeekTotal(semanas[w]), 0);
  const totalRounded = Math.round(total * 100) / 100;
  if (totalRounded <= 0) return { ok: false, error: 'El gran total debe ser mayor a cero.' };

  const totalCents = Math.round(totalRounded * 100);
  const targetACents = Math.floor(totalCents / 2);
  const targetA = targetACents / 100;
  const targetB = Math.round((totalCents - targetACents)) / 100;

  const invAfterClone = arqCloneInventory(semanas);
  const packA = arqAllocatePartner(targetA, invAfterClone);
  const packB = arqExtractRemainder(invAfterClone);

  const socio1 = typeof getOwnerNombre1 === 'function' ? getOwnerNombre1() : 'Socio 1';
  const socio2 = typeof getOwnerNombre2 === 'function' ? getOwnerNombre2() : 'Socio 2';

  return {
    ok: true,
    total: totalRounded,
    targetA,
    targetB,
    socio1: {
      nombre: socio1,
      monto: packA.monto,
      toma: packA.toma,
      faltante: packA.remainingCents / 100,
    },
    socio2: {
      nombre: socio2,
      monto: packB.monto,
      toma: packB.toma,
    },
  };
}

function arqWeekToFirestore(week) {
  const out = { monedas: Number(week.monedas) || 0 };
  ARQ_BILL_DENOMS.forEach((d) => {
    out[String(d)] = parseInt(week[String(d)], 10) || 0;
  });
  return out;
}

function arqTomaToFirestore(toma) {
  const out = {};
  ARQ_WEEKS.forEach((w) => {
    out['semana' + w] = arqWeekToFirestore(toma[w] || arqEmptyWeek());
  });
  return out;
}

function arqFormatTomaHtml(toma) {
  const lines = [];
  ARQ_WEEKS.forEach((w) => {
    const parts = [];
    ARQ_BILL_DENOMS.forEach((d) => {
      const n = parseInt((toma[w] || {})[String(d)], 10) || 0;
      if (n > 0) parts.push(n + ' billete' + (n === 1 ? '' : 's') + ' de $' + d);
    });
    const mon = Number((toma[w] || {}).monedas) || 0;
    if (mon > 0) parts.push($m(mon) + ' en monedas');
    if (parts.length) lines.push('<li><strong>Semana ' + w + ':</strong> ' + parts.join(', ') + '</li>');
  });
  if (!lines.length) return '<p class="arq-toma-empty">Sin billetes asignados en este paquete.</p>';
  return '<ul class="arq-toma-list">' + lines.join('') + '</ul>';
}

/** Neto teórico semana: ventas brutas - comisiones - gastos asignados. */
async function arqFetchCuadrePorMes(monthKey) {
  const m = normalizeMonthYYYYMM(monthKey);
  if (!m) return [0, 0, 0, 0];
  const { start, end } = monthRange(m);
  const [snapV, snapG] = await Promise.all([
    db.collection('ventas').where('fecha', '>=', start).where('fecha', '<=', end).get(),
    db.collection('gastos').where('fecha', '>=', start).where('fecha', '<=', end).get(),
  ]);

  const semVentas = [0, 0, 0, 0];
  const semCom = [0, 0, 0, 0];
  snapV.docs.forEach((doc) => {
    const v = doc.data();
    const f = v.fecha || '';
    if (f.length < 10) return;
    const d = parseInt(f.slice(8, 10), 10);
    if (Number.isNaN(d)) return;
    const wk =
      typeof repWeekOfMonth === 'function' ? repWeekOfMonth(d) : d <= 7 ? 1 : d <= 14 ? 2 : d <= 21 ? 3 : 4;
    const idx = Math.min(4, Math.max(1, wk)) - 1;
    semVentas[idx] += ventaBrutaDesdeVenta(v);
    semCom[idx] += comisionDesdeVenta(v);
  });

  const semGastos = [0, 0, 0, 0];
  snapG.docs.forEach((doc) => {
    const g = doc.data();
    const wk = typeof gastoSemanaAsignada === 'function' ? gastoSemanaAsignada(g) : 1;
    const idx = Math.min(4, Math.max(1, wk)) - 1;
    semGastos[idx] += Number(g.monto) || 0;
  });

  return semVentas.map((vb, i) => Math.round((vb - semCom[i] - semGastos[i]) * 100) / 100);
}

function arqCuadreStatus(esperado, fisico) {
  const diff = Math.round((fisico - esperado) * 100) / 100;
  if (Math.abs(diff) < 0.01) return { diff, cls: 'arq-cuadre-ok', label: 'Cuadra exacto' };
  if (diff < 0) return { diff, cls: 'arq-cuadre-faltante', label: 'Faltante' };
  return { diff, cls: 'arq-cuadre-sobrante', label: 'Sobrante' };
}

function arqUpdateCuadrePanel(week) {
  const esperado = arqueoState.cuadreSemanas[week - 1] || 0;
  const semanas = arqReadSemanasFromDom();
  const fisico = arqWeekTotal(semanas[week]);
  const st = arqCuadreStatus(esperado, fisico);

  const elEsp = document.getElementById('arq-cuadre-esperado-w' + week);
  const elFis = document.getElementById('arq-cuadre-fisico-w' + week);
  const elDiff = document.getElementById('arq-cuadre-diff-w' + week);
  const box = document.getElementById('arq-cuadre-box-w' + week);

  if (elEsp) elEsp.textContent = $m(esperado);
  if (elFis) elFis.textContent = $m(fisico);
  if (elDiff) {
    elDiff.textContent = (st.diff >= 0 ? '+' : '') + $m(st.diff) + ' · ' + st.label;
    elDiff.className = 'arq-cuadre-diff-val ' + st.cls;
  }
  if (box) {
    box.classList.remove('arq-cuadre-ok', 'arq-cuadre-faltante', 'arq-cuadre-sobrante');
    box.classList.add(st.cls);
  }
}

function arqReadSemanasFromDom() {
  const semanas = arqInitSemanas();
  ARQ_WEEKS.forEach((w) => {
    ARQ_BILL_DENOMS.forEach((d) => {
      const el = document.getElementById('arq-w' + w + '-d' + d);
      semanas[w][String(d)] = Math.max(0, parseInt(el?.value, 10) || 0);
    });
    const mon = document.getElementById('arq-w' + w + '-mon');
    semanas[w].monedas = Math.max(0, parseFloat(mon?.value) || 0);
  });
  return semanas;
}

function arqUpdateLibreTotal() {
  const w = arqEmptyWeek();
  ARQ_BILL_DENOMS.forEach((d) => {
    const el = document.getElementById('arq-libre-d' + d);
    w[String(d)] = Math.max(0, parseInt(el?.value, 10) || 0);
  });
  const mon = document.getElementById('arq-libre-mon');
  w.monedas = Math.max(0, parseFloat(mon?.value) || 0);
  const el = document.getElementById('arq-libre-total');
  if (el) el.textContent = $m(arqWeekTotal(w));
}

function arqUpdateWeekSubtotals() {
  ARQ_WEEKS.forEach((w) => {
    const el = document.getElementById('arq-sub-w' + w);
    if (el) {
      const semanas = arqReadSemanasFromDom();
      el.textContent = $m(arqWeekTotal(semanas[w]));
    }
    arqUpdateCuadrePanel(w);
  });

  const semanas = arqReadSemanasFromDom();
  const totalFisico = ARQ_WEEKS.reduce((s, w) => s + arqWeekTotal(semanas[w]), 0);
  const grand = document.getElementById('arq-grand-total');
  if (grand) grand.textContent = $m(totalFisico);

  const totTeo = document.getElementById('arq-total-teorico');
  const totDiff = document.getElementById('arq-total-diff');
  if (totTeo) totTeo.textContent = $m(arqueoState.totalTeoricoMes);
  if (totDiff) {
    const st = arqCuadreStatus(arqueoState.totalTeoricoMes, totalFisico);
    totDiff.textContent = (st.diff >= 0 ? '+' : '') + $m(st.diff);
    totDiff.className = 'arq-cuadre-diff-val ' + st.cls;
  }

  return totalFisico;
}

function arqRunDenomCallback(onInputFn) {
  if (typeof onInputFn === 'string' && typeof window[onInputFn] === 'function') window[onInputFn]();
}

function arqBillImageSrc(denom) {
  return ARQ_BILL_IMAGES[denom] || ARQ_BILL_IMAGES[100];
}

function arqRefreshGavetaItem(inputId) {
  const inp = document.getElementById(inputId);
  if (!inp) return;

  const isCoin = inp.getAttribute('data-arq-coins') === '1';
  const item = document.querySelector('.billete-item[data-input-id="' + inputId + '"]');
  const monedas = document.querySelector('.monedas-card[data-input-id="' + inputId + '"]');

  if (isCoin && monedas) {
    const v = Math.max(0, Math.round((parseFloat(inp.value) || 0) * 100) / 100);
    inp.value = String(v);
    const valEl = monedas.querySelector('[data-monedas-val]');
    if (valEl) valEl.textContent = $m(v);
    return;
  }

  if (!item) return;
  const denom = parseInt(item.getAttribute('data-denom'), 10) || 0;
  const qty = Math.max(0, parseInt(inp.value, 10) || 0);
  inp.value = String(qty);

  const badge = item.querySelector('[data-badge]');
  if (badge) {
    if (qty > 0) {
      badge.textContent = 'x' + qty;
      badge.classList.add('cantidad-badge--active');
      badge.style.display = '';
      badge.removeAttribute('aria-hidden');
    } else {
      badge.textContent = '';
      badge.classList.remove('cantidad-badge--active');
      badge.style.display = 'none';
      badge.setAttribute('aria-hidden', 'true');
    }
  }

  const subEl = item.querySelector('[data-subtotal]');
  if (subEl) subEl.textContent = $m(qty * denom);
}

function arqSyncGavetaVisuals() {
  document.querySelectorAll('#pg-caja-cierres .arq-gaveta-inp').forEach((inp) => {
    if (inp.id) arqRefreshGavetaItem(inp.id);
  });
}

function arqBuildGavetaItemHtml(denom, inputId, onInputFn) {
  const src = arqBillImageSrc(denom);
  return (
    '<div class="billete-item" role="button" tabindex="0" data-denom="' +
    denom +
    '" data-input-id="' +
    inputId +
    '" data-arq-callback="' +
    onInputFn +
    '" aria-label="Capturar billetes de $' +
    denom +
    '">' +
    '<span class="cantidad-badge" data-badge style="display:none" aria-hidden="true"></span>' +
    '<div class="billete-img-wrap">' +
    '<img class="billete-img" src="' +
    src +
    '" alt="Billete de $' +
    denom +
    '" loading="lazy" width="140" height="70">' +
    '</div>' +
    '<span class="billete-denom-lbl">$' +
    denom +
    '</span>' +
    '<span class="billete-subtotal" data-subtotal>' +
    $m(0) +
    '</span>' +
    '<input type="number" id="' +
    inputId +
    '" class="arq-gaveta-inp" value="0" min="0" step="1" tabindex="-1" aria-hidden="true">' +
    '</div>'
  );
}

function arqBuildMonedasTouchHtml(inputId, onInputFn) {
  return (
    '<div class="monedas-card" role="button" tabindex="0" data-input-id="' +
    inputId +
    '" data-arq-callback="' +
    onInputFn +
    '" data-arq-coins="1" aria-label="Capturar total en monedas">' +
    '<div class="monedas-card-inner">' +
    '<span class="monedas-card-ico" aria-hidden="true">🪙</span>' +
    '<div class="monedas-card-meta">' +
    '<span class="monedas-card-title">Total en monedas</span>' +
    '<span class="monedas-card-hint">Toque para ingresar el monto</span>' +
    '</div>' +
    '<span class="monedas-card-amount" data-monedas-val>' +
    $m(0) +
    '</span>' +
    '</div>' +
    '<input type="number" id="' +
    inputId +
    '" class="arq-gaveta-inp" value="0" min="0" step="0.01" tabindex="-1" aria-hidden="true" data-arq-coins="1">' +
    '</div>'
  );
}

function arqBuildDenomInputsHtml(prefix, onInputFn) {
  const bills = ARQ_BILL_DENOMS.map((d) => arqBuildGavetaItemHtml(d, prefix + '-d' + d, onInputFn)).join('');
  return (
    '<div class="gaveta-wrap" data-arq-callback="' +
    onInputFn +
    '">' +
    '<p class="gaveta-kicker">Toca un billete para ingresar la cantidad</p>' +
    '<div class="gaveta-grid">' +
    bills +
    '</div>' +
    arqBuildMonedasTouchHtml(prefix + '-mon', onInputFn) +
    '</div>'
  );
}

function arqAbrirCapturaCantidad(inputId, opts) {
  opts = opts || {};
  const inp = document.getElementById(inputId);
  if (!inp) return;

  const isCoin = inp.getAttribute('data-arq-coins') === '1';
  const denom = parseInt(opts.denom, 10) || 0;
  const callback =
    opts.callback ||
    inp.closest('[data-arq-callback]')?.getAttribute('data-arq-callback') ||
    document.querySelector('.billete-item[data-input-id="' + inputId + '"]')?.getAttribute('data-arq-callback');

  arqueoState.captura = { inputId, isCoin, denom, callback };

  const title = document.getElementById('arq-cap-title');
  const hint = document.getElementById('arq-cap-hint');
  const img = document.getElementById('arq-cap-img');
  const visual = document.getElementById('arq-cap-visual');
  const qtyInp = document.getElementById('arq-cap-qty');

  if (title) title.textContent = isCoin ? 'Monedas' : 'Billetes de $' + denom;
  if (hint) {
    hint.textContent = isCoin
      ? 'Ingrese el total en pesos (monedas sueltas).'
      : '¿Cuántos billetes de $' + denom + ' hay en la paca?';
  }
  if (img && visual) {
    if (isCoin) {
      img.style.display = 'none';
      visual.classList.add('mo-cap-visual--coins');
    } else {
      img.style.display = 'block';
      visual.classList.remove('mo-cap-visual--coins');
      img.src = arqBillImageSrc(denom);
      img.alt = 'Billete de $' + denom;
    }
  }
  if (qtyInp) {
    qtyInp.step = isCoin ? '0.01' : '1';
    qtyInp.value = isCoin ? String(Math.max(0, parseFloat(inp.value) || 0)) : String(Math.max(0, parseInt(inp.value, 10) || 0));
  }

  if (typeof openMo === 'function') openMo('mo-captura-cantidad');

  const focusInput = () => {
    const el = document.getElementById('arq-cap-qty');
    if (!el) return;
    el.focus();
    try {
      el.select();
    } catch (err) {
      /* ignore */
    }
  };
  setTimeout(focusInput, 80);
  setTimeout(focusInput, 220);
}

function arqCerrarCapturaCantidad() {
  arqueoState.captura = null;
  if (typeof closeMo === 'function') closeMo('mo-captura-cantidad');
}

function arqConfirmCapturaCantidad() {
  const cap = arqueoState.captura;
  const qtyInp = document.getElementById('arq-cap-qty');
  if (!cap || !qtyInp) {
    arqCerrarCapturaCantidad();
    return;
  }

  const hidden = document.getElementById(cap.inputId);
  if (!hidden) {
    arqCerrarCapturaCantidad();
    return;
  }

  if (cap.isCoin) {
    hidden.value = String(Math.max(0, Math.round((parseFloat(qtyInp.value) || 0) * 100) / 100));
  } else {
    hidden.value = String(Math.max(0, parseInt(qtyInp.value, 10) || 0));
  }

  arqRefreshGavetaItem(cap.inputId);
  arqRunDenomCallback(cap.callback);
  arqCerrarCapturaCantidad();
}

function arqBindGaveta() {
  if (arqueoState.gavetaBound) return;
  const root = document.getElementById('pg-caja-cierres');
  if (!root) return;

  root.addEventListener('click', (e) => {
    const item = e.target.closest('.billete-item[data-input-id]');
    if (item && root.contains(item)) {
      e.preventDefault();
      arqAbrirCapturaCantidad(item.getAttribute('data-input-id'), {
        denom: item.getAttribute('data-denom'),
        callback: item.getAttribute('data-arq-callback'),
      });
      return;
    }
    const mon = e.target.closest('.monedas-card[data-input-id]');
    if (mon && root.contains(mon)) {
      e.preventDefault();
      arqAbrirCapturaCantidad(mon.getAttribute('data-input-id'), {
        callback: mon.getAttribute('data-arq-callback'),
        isCoin: true,
      });
    }
  });

  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const item = e.target.closest('.billete-item[data-input-id]');
    if (item && root.contains(item)) {
      e.preventDefault();
      arqAbrirCapturaCantidad(item.getAttribute('data-input-id'), {
        denom: item.getAttribute('data-denom'),
        callback: item.getAttribute('data-arq-callback'),
      });
      return;
    }
    const mon = e.target.closest('.monedas-card[data-input-id]');
    if (mon && root.contains(mon)) {
      e.preventDefault();
      arqAbrirCapturaCantidad(mon.getAttribute('data-input-id'), {
        callback: mon.getAttribute('data-arq-callback'),
      });
    }
  });

  const qtyInp = document.getElementById('arq-cap-qty');
  if (qtyInp) {
    qtyInp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        arqConfirmCapturaCantidad();
      }
    });
  }

  const moCap = document.getElementById('mo-captura-cantidad');
  if (moCap) {
    moCap.addEventListener('click', (e) => {
      if (e.target === moCap) arqCerrarCapturaCantidad();
    });
  }

  arqueoState.gavetaBound = true;
}

function arqRenderMensualPanels() {
  const host = document.getElementById('arq-panels-host');
  if (!host) return;

  let html = '';
  ARQ_WEEKS.forEach((w) => {
    html +=
      '<div id="arq-panel-w' +
      w +
      '" class="arq-week-panel" style="display:' +
      (w === arqueoState.activeWeek ? 'block' : 'none') +
      '">' +
      '<p class="arq-panel-desc">Cuente la <strong>paca Semana ' +
      w +
      '</strong> sin mezclar con otras semanas.</p>' +
      '<div class="arq-week-layout">' +
      '<aside class="arq-cuadre-panel" id="arq-cuadre-box-w' +
      w +
      '">' +
      '<h4 class="arq-cuadre-title">Cuadre de caja</h4>' +
      '<p class="arq-cuadre-hint">Ventas brutas − comisiones − gastos de la semana en sistema.</p>' +
      '<div class="arq-cuadre-row"><span class="arq-cuadre-lbl">Esperado en sistema</span><strong class="arq-cuadre-val" id="arq-cuadre-esperado-w' +
      w +
      '">$0.00</strong></div>' +
      '<div class="arq-cuadre-row"><span class="arq-cuadre-lbl">Total físico contado</span><strong class="arq-cuadre-val" id="arq-cuadre-fisico-w' +
      w +
      '">$0.00</strong></div>' +
      '<div class="arq-cuadre-row arq-cuadre-row-diff"><span class="arq-cuadre-lbl">Diferencia</span><strong class="arq-cuadre-diff-val" id="arq-cuadre-diff-w' +
      w +
      '">$0.00</strong></div>' +
      '</aside>' +
      '<div class="arq-denom-area">' +
      arqBuildDenomInputsHtml('arq-w' + w, 'arqUpdateWeekSubtotals') +
      '</div></div>' +
      '<div class="arq-week-sub">Subtotal semana ' +
      w +
      ': <strong id="arq-sub-w' +
      w +
      '">$0.00</strong></div></div>';
  });
  host.innerHTML = html;
  arqSyncGavetaVisuals();
}

function arqSwitchMainTab(tab, btn) {
  arqueoState.mainTab = tab;
  document.querySelectorAll('#pg-caja-cierres .caja-main-tabs .tab').forEach((t) => t.classList.remove('on'));
  if (btn) btn.classList.add('on');
  const libre = document.getElementById('arq-view-libre');
  const mensual = document.getElementById('arq-view-mensual');
  const historial = document.getElementById('arq-view-historial');
  if (libre) libre.style.display = tab === 'libre' ? 'block' : 'none';
  if (mensual) mensual.style.display = tab === 'mensual' ? 'block' : 'none';
  if (historial) historial.style.display = tab === 'historial' ? 'block' : 'none';
  if (tab === 'mensual') arqEnsureMensualReady();
  if (tab === 'historial') arqLoadHistorial();
}

function arqSwitchSemana(week, btn) {
  arqueoState.activeWeek = week;
  document.querySelectorAll('#pg-caja-cierres .arq-week-tabs .tab').forEach((t) => t.classList.remove('on'));
  if (btn) btn.classList.add('on');
  ARQ_WEEKS.forEach((w) => {
    const panel = document.getElementById('arq-panel-w' + w);
    if (panel) panel.style.display = w === week ? 'block' : 'none';
  });
  arqUpdateCuadrePanel(week);
}

function arqShowStep(step) {
  arqueoState.step = step;
  const conteo = document.getElementById('arq-step-conteo');
  const result = document.getElementById('arq-step-resultado');
  if (conteo) conteo.style.display = step === 'conteo' ? 'block' : 'none';
  if (result) result.style.display = step === 'resultado' ? 'block' : 'none';
}

function arqApplySemanasToDom(semanas) {
  ARQ_WEEKS.forEach((w) => {
    const week = semanas[w] || arqEmptyWeek();
    ARQ_BILL_DENOMS.forEach((d) => {
      const el = document.getElementById('arq-w' + w + '-d' + d);
      if (el) el.value = String(parseInt(week[String(d)], 10) || 0);
    });
    const mon = document.getElementById('arq-w' + w + '-mon');
    if (mon) mon.value = String(Number(week.monedas) || 0);
  });
  arqSyncGavetaVisuals();
}

function arqClearMensualInputs() {
  ARQ_WEEKS.forEach((w) => {
    ARQ_BILL_DENOMS.forEach((d) => {
      const el = document.getElementById('arq-w' + w + '-d' + d);
      if (el) el.value = '0';
    });
    const mon = document.getElementById('arq-w' + w + '-mon');
    if (mon) mon.value = '0';
  });
  arqueoState.semanas = arqInitSemanas();
  arqueoState.splitResult = null;
  arqShowStep('conteo');
  arqSyncGavetaVisuals();
}

async function arqLoadSavedCierre(monthKey, opts) {
  opts = opts || {};
  try {
    const doc = await db.collection('cierres_mensuales').doc(monthKey).get();
    if (!doc.exists) return false;
    const data = doc.data();
    const desglose = data.desglose || {};
    const semanas = arqInitSemanas();
    ARQ_WEEKS.forEach((w) => {
      const block = desglose['semana' + w];
      if (!block) return;
      semanas[w].monedas = Number(block.monedas) || 0;
      ARQ_BILL_DENOMS.forEach((d) => {
        semanas[w][String(d)] = parseInt(block[String(d)], 10) || 0;
      });
    });
    arqueoState.semanas = semanas;
    arqApplySemanasToDom(semanas);

    const showResultado = opts.showResultadoStep !== false;
    if (showResultado && data.reparto && data.totalFisico > 0) {
      arqueoState.splitResult = {
        ok: true,
        total: data.totalFisico,
        targetA: data.meta50?.objetivoA,
        targetB: data.meta50?.objetivoB,
        socio1: {
          nombre: data.reparto.socio1?.nombre || 'Socio 1',
          monto: data.reparto.socio1?.monto,
          toma: arqFirestoreTomaToLocal(data.reparto.socio1?.toma),
          faltante: 0,
        },
        socio2: {
          nombre: data.reparto.socio2?.nombre || 'Socio 2',
          monto: data.reparto.socio2?.monto,
          toma: arqFirestoreTomaToLocal(data.reparto.socio2?.toma),
        },
      };
      arqRenderResultado(arqueoState.splitResult);
      arqShowStep('resultado');
    } else {
      arqueoState.splitResult = null;
      arqShowStep('conteo');
    }

    arqueoState.loadedFromFirestore = true;
    if (!opts.silentLoad) {
      showToast('info', 'Se cargó el cierre guardado de ' + formatMonthLabel(monthKey) + '.');
    }
    return true;
  } catch (e) {
    console.warn('arqLoadSavedCierre', e);
    return false;
  }
}

function arqFirestoreTomaToLocal(tomaFs) {
  const toma = {};
  ARQ_WEEKS.forEach((w) => {
    toma[w] = arqEmptyWeek();
    const block = (tomaFs || {})['semana' + w];
    if (!block) return;
    toma[w].monedas = Number(block.monedas) || 0;
    ARQ_BILL_DENOMS.forEach((d) => {
      toma[w][String(d)] = parseInt(block[String(d)], 10) || 0;
    });
  });
  return toma;
}

async function arqOnMesChange(opts) {
  opts = opts || {};
  const inp = document.getElementById('arq-m');
  const m = normalizeMonthYYYYMM(inp?.value) || curMonth();
  if (inp && inp.value !== m) inp.value = m;
  arqueoState.monthKey = m;

  const lbl = document.getElementById('arq-mes-lbl');
  if (lbl) lbl.textContent = formatMonthLabel(m);

  const loadEl = document.getElementById('arq-cuadre-loading');
  if (loadEl) loadEl.style.display = 'block';

  try {
    arqueoState.cuadreSemanas = await arqFetchCuadrePorMes(m);
    arqueoState.totalTeoricoMes = arqueoState.cuadreSemanas.reduce((s, n) => s + n, 0);
    arqueoState.totalTeoricoMes = Math.round(arqueoState.totalTeoricoMes * 100) / 100;
  } catch (e) {
    console.error('arqOnMesChange', e);
    arqueoState.cuadreSemanas = [0, 0, 0, 0];
    arqueoState.totalTeoricoMes = 0;
    showToast('bad', 'No se pudo cargar el cuadre del mes: ' + (e.message || e));
  } finally {
    if (loadEl) loadEl.style.display = 'none';
  }

  if (!opts.skipClear) arqClearMensualInputs();
  arqueoState.loadedFromFirestore = false;
  const loaded = await arqLoadSavedCierre(m, {
    showResultadoStep: opts.showResultadoStep !== false,
    silentLoad: opts.silentLoad,
  });
  if (!loaded && !opts.skipClear) {
    arqueoState.semanas = arqInitSemanas();
    arqueoState.splitResult = null;
    arqShowStep('conteo');
  }
  arqUpdateWeekSubtotals();
  arqUpdateCuadrePanel(arqueoState.activeWeek);
  return loaded;
}

async function arqEnsureMensualReady() {
  if (!document.getElementById('arq-panels-host')?.innerHTML) {
    arqRenderMensualPanels();
    const libreHost = document.getElementById('arq-libre-denom-host');
    if (libreHost && !libreHost.innerHTML) {
      libreHost.innerHTML = arqBuildDenomInputsHtml('arq-libre', 'arqUpdateLibreTotal');
    }
  }
  const inp = document.getElementById('arq-m');
  if (inp && !normalizeMonthYYYYMM(inp.value)) {
    inp.value = curMonth();
  }
  if (!arqueoState.monthKey || arqueoState.cuadreSemanas.every((n) => n === 0 && !arqueoState.loadedFromFirestore)) {
    await arqOnMesChange();
  } else {
    arqUpdateWeekSubtotals();
  }
}

function arqRenderResultado(split) {
  const host = document.getElementById('arq-resultado-body');
  if (!host || !split) return;

  let warn = '';
  if (split.socio1.faltante > 0.009) {
    warn =
      '<div class="al al-warn" style="margin-bottom:14px"><span>⚠️</span> No se cubrió el 50% exacto en billetes para <strong>' +
      split.socio1.nombre +
      '</strong>. Falta ' +
      $m(split.socio1.faltante) +
      '.</div>';
  }

  host.innerHTML =
    warn +
    '<div class="arq-resumen-top">' +
    '<div><span class="arq-res-lbl">Total físico</span><span class="arq-res-val">' +
    $m(split.total) +
    '</span></div>' +
    '<div><span class="arq-res-lbl">Total teórico sistema</span><span class="arq-res-val">' +
    $m(arqueoState.totalTeoricoMes) +
    '</span></div>' +
    '<div><span class="arq-res-lbl">Meta 50%</span><span class="arq-res-val">' +
    $m(split.targetA) +
    ' / ' +
    $m(split.targetB) +
    '</span></div></div>' +
    '<div class="arq-recibos">' +
    '<article class="arq-recibo arq-recibo-a">' +
    '<header class="arq-recibo-head"><span class="arq-recibo-ico">1</span><div><h4>' +
    split.socio1.nombre +
    '</h4><p class="arq-recibo-monto">' +
    $m(split.socio1.monto) +
    '</p></div></header>' +
    '<div class="arq-recibo-body"><p class="arq-recibo-kicker">Tome de las pacas:</p>' +
    arqFormatTomaHtml(split.socio1.toma) +
    '</div></article>' +
    '<article class="arq-recibo arq-recibo-b">' +
    '<header class="arq-recibo-head"><span class="arq-recibo-ico">2</span><div><h4>' +
    split.socio2.nombre +
    '</h4><p class="arq-recibo-monto">' +
    $m(split.socio2.monto) +
    '</p></div></header>' +
    '<div class="arq-recibo-body"><p class="arq-recibo-kicker">Remanente automático:</p>' +
    arqFormatTomaHtml(split.socio2.toma) +
    '</div></article></div>';

  arqueoState.splitResult = split;
}

function arqProcesarCierreClick() {
  const semanas = arqReadSemanasFromDom();
  const total = ARQ_WEEKS.reduce((s, w) => s + arqWeekTotal(semanas[w]), 0);
  if (total <= 0) {
    showToast('bad', 'Ingrese denominaciones en al menos una semana.');
    return;
  }
  arqueoState.semanas = semanas;
  const split = arqProcesarReparto(semanas);
  if (!split.ok) {
    showToast('bad', split.error || 'No se pudo procesar el reparto.');
    return;
  }
  arqRenderResultado(split);
  arqShowStep('resultado');
  showToast('ok', 'Reparto calculado. Revise y confirme el guardado.');
}

function arqVolverConteo() {
  arqShowStep('conteo');
}

function arqBuildCuadrePorSemanaFirestore(semanas) {
  const cuadre = {};
  ARQ_WEEKS.forEach((w) => {
    const esperado = arqueoState.cuadreSemanas[w - 1] || 0;
    const fisico = arqWeekTotal(semanas[w]);
    const st = arqCuadreStatus(esperado, fisico);
    cuadre['semana' + w] = {
      esperadoSistema: esperado,
      totalFisico: fisico,
      diferencia: st.diff,
      estado: st.label,
    };
  });
  return cuadre;
}

async function arqConfirmarGuardar() {
  if (!arqueoState.splitResult || !arqueoState.semanas) {
    showToast('bad', 'Procese el cierre y reparto antes de guardar.');
    return;
  }

  const monthKey =
    arqueoState.monthKey || normalizeMonthYYYYMM(document.getElementById('arq-m')?.value) || curMonth();
  const split = arqueoState.splitResult;
  const totalFisico = split.total;
  const totalTeorico = arqueoState.totalTeoricoMes;
  const diferenciaMes = Math.round((totalFisico - totalTeorico) * 100) / 100;

  const esEdicion = arqueoState.loadedFromFirestore;
  if (
    !confirm(
      (esEdicion ? '¿Actualizar (sobrescribir) el cierre de ' : '¿Guardar cierre de ') +
        formatMonthLabel(monthKey) +
        '?\n\nID documento: ' +
        monthKey +
        '\nFísico: ' +
        $m(totalFisico) +
        '\nSistema: ' +
        $m(totalTeorico) +
        '\nDiferencia: ' +
        $m(diferenciaMes) +
        (esEdicion ? '\n\nSe reemplazará el conteo y reparto anterior en el mismo documento.' : '')
    )
  ) {
    return;
  }

  const btn = document.getElementById('arq-btn-guardar');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Guardando…';
  }

  try {
    const ref = db.collection('cierres_mensuales').doc(monthKey);
    const prevSnap = await ref.get();
    const prev = prevSnap.exists ? prevSnap.data() : null;

    const desglose = {};
    ARQ_WEEKS.forEach((w) => {
      desglose['semana' + w] = arqWeekToFirestore(arqueoState.semanas[w]);
    });

    const doc = {
      mes: monthKey,
      fecha: today(),
      totalFisico,
      totalTeoricoSistema: totalTeorico,
      diferencia: diferenciaMes,
      cuadrePorSemana: arqBuildCuadrePorSemanaFirestore(arqueoState.semanas),
      desglose,
      reparto: {
        socio1: {
          nombre: split.socio1.nombre,
          monto: split.socio1.monto,
          toma: arqTomaToFirestore(split.socio1.toma),
        },
        socio2: {
          nombre: split.socio2.nombre,
          monto: split.socio2.monto,
          toma: arqTomaToFirestore(split.socio2.toma),
        },
      },
      meta50: { objetivoA: split.targetA, objetivoB: split.targetB },
      actualizadoEn: firebase.firestore.FieldValue.serverTimestamp(),
    };

    if (prev && prev.creadoEn) doc.creadoEn = prev.creadoEn;
    else doc.creadoEn = firebase.firestore.FieldValue.serverTimestamp();

    await ref.set(doc);
    arqueoState.loadedFromFirestore = true;
    showToast('ok', (esEdicion ? 'Cierre actualizado' : 'Cierre guardado') + ' en cierres_mensuales/' + monthKey);
    if (document.getElementById('arq-view-historial')?.style.display !== 'none') {
      await arqLoadHistorial();
    }
  } catch (e) {
    console.error('arqConfirmarGuardar', e);
    showToast('bad', 'Error al guardar: ' + (e.message || e));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Confirmar y guardar en Firebase';
    }
  }
}

async function loadCajaCierres() {
  await loadCfg();
  applyCierreOwnerLabels();

  const inp = document.getElementById('arq-m');
  if (inp && !normalizeMonthYYYYMM(inp.value)) inp.value = curMonth();

  arqueoState.monthKey = normalizeMonthYYYYMM(inp?.value) || curMonth();
  arqueoState.semanas = arqInitSemanas();
  arqueoState.splitResult = null;
  arqueoState.loadedFromFirestore = false;
  arqueoState.activeWeek = 1;
  arqShowStep('conteo');

  arqRenderMensualPanels();
  const libreHost = document.getElementById('arq-libre-denom-host');
  if (libreHost) libreHost.innerHTML = arqBuildDenomInputsHtml('arq-libre', 'arqUpdateLibreTotal');
  arqSyncGavetaVisuals();

  const activeTab =
    document.querySelector('#pg-caja-cierres .caja-main-tabs .tab[data-arq-tab="' + arqueoState.mainTab + '"]') ||
    document.querySelector('#pg-caja-cierres .caja-main-tabs .tab.on');
  arqSwitchMainTab(arqueoState.mainTab, activeTab);
  arqSwitchSemana(1, document.querySelector('#pg-caja-cierres .arq-week-tabs .tab'));

  arqBindHistorialEditClicks();
  arqBindGaveta();
  if (arqueoState.mainTab === 'historial') {
    await arqLoadHistorial();
  } else {
    await arqOnMesChange();
  }
  arqUpdateLibreTotal();
}
