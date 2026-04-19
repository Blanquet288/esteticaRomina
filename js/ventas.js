/* Venta rápida y corte masivo (bulk) */
function onVentaServChange() {
  const sel = document.getElementById('v-serv-sel');
  const opt = sel.options[sel.selectedIndex];
  if (!opt || !opt.value) return;
  document.getElementById('v-monto').value = parseFloat(opt.dataset.precio || 0).toFixed(2);
  document.getElementById('v-cpct').value = opt.dataset.com || 0;
  calcCom();
}
function calcCom() {
  const m = parseFloat(document.getElementById('v-monto').value) || 0;
  const p = parseFloat(document.getElementById('v-cpct').value) || 0;
  const com = (m * p) / 100;
  document.getElementById('v-cmonto').value = com.toFixed(2);
  document.getElementById('v-util').value = (m - com).toFixed(2);
}
async function regVenta() {
  const fecha = document.getElementById('v-fecha').value;
  const eid = document.getElementById('v-emp').value;
  const servSel = document.getElementById('v-serv-sel');
  const catId = servSel.value;
  const servNom = servSel.options[servSel.selectedIndex]?.dataset.nombre || '';
  const monto = parseFloat(document.getElementById('v-monto').value);
  const pct = parseFloat(document.getElementById('v-cpct').value) || 0;
  const comM = parseFloat(document.getElementById('v-cmonto').value) || 0;
  const util = parseFloat(document.getElementById('v-util').value) || 0;
  if (!fecha || !eid || !catId || !monto) {
    showToast('bad', '❌ Completa todos los campos, incluye el servicio.');
    return;
  }
  if (!turnoSeleccionValido('v-turno')) {
    showToast('bad', '❌ Selecciona un turno (configúralos en Configuración si aún no existen).');
    return;
  }
  const emp = emps.find((e) => e.id === eid);
  const turno = readTurnoFromSelect('v-turno');
  try {
    await db.collection('ventas').add({
      fecha,
      idEmpleado: eid,
      servicio: servNom,
      idServicio: catId,
      monto,
      comisionPct: pct,
      comisionMonto: comM,
      utilidadNegocio: util,
      turnoId: turno.turnoId,
      turnoNombre: turno.turnoNombre,
      ts: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('ok', '✅ Venta registrada correctamente.');
    buildTicket({ fecha, emp: emp?.nombre || '—', serv: servNom, monto, comM, util });
    ['v-monto', 'v-cmonto', 'v-util'].forEach((id) => (document.getElementById(id).value = ''));
    document.getElementById('v-serv-sel').value = '';
    document.getElementById('v-cpct').value = '';
    onVentaEmpTurno();
  } catch (e) {
    showToast('bad', '❌ Error: ' + e.message);
  }
}
function buildTicket(d) {
  const empresa = cfg.nombreEmpresa || 'Estética Romina';
  const msg = cfg.ticketMensaje || '¡Gracias por tu preferencia!';
  const fLeg = new Date(d.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });
  const hora = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
  const html = `<div class="ticket-wrap">
    <div class="tkt-title">${empresa}</div>
    <div class="tkt-sub">🌸 Recibo de Servicio</div>
    <hr class="tkt-div">
    <div class="tkt-row"><span>Fecha:</span><span>${fLeg}</span></div>
    <div class="tkt-row"><span>Hora:</span><span>${hora}</span></div>
    <div class="tkt-row"><span>Atendió:</span><span>${d.emp}</span></div>
    <hr class="tkt-div">
    <div class="tkt-row"><span>Servicio:</span><span>${d.serv}</span></div>
    <hr class="tkt-div">
    <div class="tkt-row"><strong>TOTAL:</strong><strong>${$m(d.monto)}</strong></div>
    <hr class="tkt-div">
    <div class="tkt-foot">${msg}<br>——————————————</div>
  </div>`;
  document.getElementById('tkt-preview').innerHTML = html;
  document.getElementById('tkt-card').style.display = 'block';
  document.getElementById('tkt-print').innerHTML = `<div style="text-align:center;font-weight:bold;font-size:15px">${empresa}</div>
    <div style="text-align:center;font-size:11px">Recibo de Servicio</div>
    <div>--------------------------------</div>
    <div>Fecha: ${fLeg}</div><div>Hora: ${hora}</div><div>Atendió: ${d.emp}</div>
    <div>--------------------------------</div><div>Servicio: ${d.serv}</div>
    <div>--------------------------------</div>
    <div style="display:flex;justify-content:space-between;font-weight:bold"><span>TOTAL:</span><span>${$m(d.monto)}</span></div>
    <div>--------------------------------</div><div style="text-align:center;font-size:11px">${msg}</div>`;
}
function toggleHist() {
  const card = document.getElementById('v-hist-card');
  const vis = card.style.display !== 'none' && card.style.display !== '';
  card.style.display = vis ? 'none' : 'block';
  if (!vis) loadVHist();
}
async function loadVHist() {
  const inp = document.getElementById('v-mf');
  let m = normalizeMonthYYYYMM(inp?.value) || curMonth();
  if (inp && inp.value !== m) inp.value = m;
  const { start, end } = monthRange(m);
  const tb = document.getElementById('tb-v-hist');
  tb.innerHTML = '<tr><td colspan="8" style="text-align:center">Cargando…</td></tr>';
  try {
    const snap = await db.collection('ventas').where('fecha', '>=', start).where('fecha', '<=', end).orderBy('fecha', 'desc').get();
    if (snap.empty) {
      tb.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--text2)">Sin ventas en este periodo.</td></tr>';
      return;
    }
    tb.innerHTML = snap.docs
      .map((d) => {
        const v = d.data(),
          em = emps.find((e) => e.id === v.idEmpleado);
        const esHist = v.tipo === 'historico_diario';
        const tnom = v.turnoNombre || nombreTurnoPorId(v.turnoId) || '—';
        return `<tr>
        <td>${v.fecha}</td><td>${em?.nombre || '—'}</td><td>${tnom}</td><td>${esHist ? '<span class="bdg bdg-info" style="margin-right:6px">Día</span>' : ''}${v.servicio || '—'}</td>
        <td><strong>${$m(ventaBrutaDesdeVenta(v))}</strong></td>
        <td style="color:var(--warn)">${$m(comisionDesdeVenta(v))}</td>
        <td><span class="bdg bdg-info">${v.comisionPct || 0}%</span></td>
        <td style="color:var(--ok)">${$m(utilidadNegocioDesdeVenta(v))}</td>
      </tr>`;
      })
      .join('');
  } catch (e) {
    tb.innerHTML = `<tr><td colspan="8">Error: ${e.message}</td></tr>`;
  }
}

/* Venta masiva */
var bulkRows = [];
function initBulk() {
  bulkRows = [];
  renderBulkRows();
  addBulkRow();
}

function buildCatOptions(selectedId) {
  selectedId = selectedId || '';
  return (
    '<option value="">Seleccionar servicio…</option>' +
    cats
      .map(
        (c) =>
          `<option value="${c.id}" data-precio="${c.precioBase || 0}" data-com="${c.comisionDefecto || 0}" data-nombre="${c.nombre}" ${c.id === selectedId ? 'selected' : ''}>${c.nombre}${c.categoria ? ' (' + c.categoria + ')' : ''}</option>`
      )
      .join('')
  );
}

function addBulkRow() {
  const id = Date.now();
  bulkRows.push({ id, catId: '', nombre: '', cantidad: 1, precio: 0, comPct: 0, subtotal: 0, comMonto: 0 });
  renderBulkRows();
}

function renderBulkRows() {
  const tbody = document.getElementById('bulk-rows');
  if (!bulkRows.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text2);padding:22px">Agrega al menos una línea de servicio.</td></tr>`;
    updateBulkTotals();
    return;
  }
  tbody.innerHTML = bulkRows
    .map(
      (r) => `
    <tr class="bulk-row" id="brow-${r.id}">
      <td><select onchange="onBulkServChange(${r.id},this)">${buildCatOptions(r.catId)}</select></td>
      <td><input type="number" value="${r.cantidad}" min="1" step="1" onchange="onBulkQtyChange(${r.id},this)" oninput="onBulkQtyChange(${r.id},this)"></td>
      <td><input type="number" value="${r.precio || ''}" placeholder="0.00" step="0.01" onchange="onBulkPriceChange(${r.id},this)" oninput="onBulkPriceChange(${r.id},this)"></td>
      <td><input type="number" value="${r.comPct || ''}" placeholder="0" step="1" onchange="onBulkComChange(${r.id},this)" oninput="onBulkComChange(${r.id},this)"></td>
      <td><input type="number" value="${r.subtotal ? r.subtotal.toFixed(2) : ''}" readonly></td>
      <td><input type="number" value="${r.comMonto ? r.comMonto.toFixed(2) : ''}" readonly></td>
      <td><button class="btn-icon del" onclick="removeBulkRow(${r.id})">🗑️</button></td>
    </tr>`
    )
    .join('');
  updateBulkTotals();
}

function onBulkServChange(id, sel) {
  const opt = sel.options[sel.selectedIndex];
  const r = bulkRows.find((x) => x.id === id);
  if (!r) return;
  r.catId = opt.value || '';
  r.nombre = opt.dataset.nombre || '';
  r.precio = parseFloat(opt.dataset.precio || 0);
  r.comPct = parseFloat(opt.dataset.com || 0);
  calcBulkRow(r);
  const tr = document.getElementById(`brow-${id}`);
  tr.querySelectorAll('input')[1].value = r.precio.toFixed(2);
  tr.querySelectorAll('input')[2].value = r.comPct;
  tr.querySelectorAll('input')[3].value = r.subtotal.toFixed(2);
  tr.querySelectorAll('input')[4].value = r.comMonto.toFixed(2);
  updateBulkTotals();
}
function onBulkQtyChange(id, inp) {
  const r = bulkRows.find((x) => x.id === id);
  if (!r) return;
  r.cantidad = Math.max(1, parseInt(inp.value, 10) || 1);
  calcBulkRow(r);
  refreshBulkReadonly(id, r);
  updateBulkTotals();
}
function onBulkPriceChange(id, inp) {
  const r = bulkRows.find((x) => x.id === id);
  if (!r) return;
  r.precio = parseFloat(inp.value) || 0;
  calcBulkRow(r);
  refreshBulkReadonly(id, r);
  updateBulkTotals();
}
function onBulkComChange(id, inp) {
  const r = bulkRows.find((x) => x.id === id);
  if (!r) return;
  r.comPct = parseFloat(inp.value) || 0;
  calcBulkRow(r);
  refreshBulkReadonly(id, r);
  updateBulkTotals();
}

function calcBulkRow(r) {
  r.subtotal = r.cantidad * r.precio;
  r.comMonto = (r.subtotal * r.comPct) / 100;
}
function refreshBulkReadonly(id, r) {
  const tr = document.getElementById(`brow-${id}`);
  if (!tr) return;
  const ins = tr.querySelectorAll('input');
  ins[3].value = r.subtotal.toFixed(2);
  ins[4].value = r.comMonto.toFixed(2);
}
function removeBulkRow(id) {
  bulkRows = bulkRows.filter((r) => r.id !== id);
  renderBulkRows();
}
function clearBulk() {
  if (!confirm('¿Limpiar todas las líneas?')) return;
  bulkRows = [];
  renderBulkRows();
  addBulkRow();
  document.getElementById('bk-emp').value = '';
  fillTurnoSelect('bk-turno', '');
}
function updateBulkTotals() {
  let total = 0,
    comTot = 0;
  bulkRows.forEach((r) => {
    total += r.subtotal || 0;
    comTot += r.comMonto || 0;
  });
  const util = total - comTot;
  document.getElementById('bk-nrows').textContent = bulkRows.filter((r) => r.catId).length;
  document.getElementById('bk-total').textContent = $m(total);
  document.getElementById('bk-comtot').textContent = $m(comTot);
  document.getElementById('bk-util').textContent = $m(util);
}
function rebuildBulkSelects() {
  bulkRows.forEach(() => {});
  renderBulkRows();
}

async function saveBulk() {
  const fecha = document.getElementById('bk-fecha').value;
  const eid = document.getElementById('bk-emp').value;
  const validRows = bulkRows.filter((r) => r.catId && r.precio > 0);
  if (!fecha || !eid) {
    showToast('bad', '❌ Selecciona la fecha y la empleada.');
    return;
  }
  if (!validRows.length) {
    showToast('bad', '❌ Agrega al menos una línea de servicio con precio.');
    return;
  }
  if (!turnoSeleccionValido('bk-turno')) {
    showToast('bad', '❌ Selecciona un turno para este corte (configúralos en Configuración).');
    return;
  }

  const emp = emps.find((e) => e.id === eid);
  const turno = readTurnoFromSelect('bk-turno');
  const batch = db.batch();
  validRows.forEach((r) => {
    const ref = db.collection('ventas').doc();
    batch.set(ref, {
      fecha,
      idEmpleado: eid,
      servicio: r.nombre,
      idServicio: r.catId,
      cantidad: r.cantidad,
      monto: r.subtotal,
      comisionPct: r.comPct,
      comisionMonto: r.comMonto,
      utilidadNegocio: r.subtotal - r.comMonto,
      turnoId: turno.turnoId,
      turnoNombre: turno.turnoNombre,
      ts: firebase.firestore.FieldValue.serverTimestamp(),
    });
  });
  try {
    await batch.commit();
    let tot = 0,
      com = 0;
    validRows.forEach((r) => {
      tot += r.subtotal;
      com += r.comMonto;
    });
    showToast('ok', `✅ ${validRows.length} ventas guardadas. Total: ${$m(tot)} | Comisión ${emp?.nombre || ''}: ${$m(com)}`);
    bulkRows = [];
    renderBulkRows();
    addBulkRow();
    document.getElementById('bk-emp').value = '';
    fillTurnoSelect('bk-turno', '');
  } catch (e) {
    showToast('bad', '❌ Error: ' + e.message);
  }
}
