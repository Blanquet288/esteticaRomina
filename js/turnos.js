/**
 * Turnos de trabajo dinámicos — Firestore: colección `config`, documento `turnos`
 * Estructura: { lista: [ { id, nombre, descripcion?, orden } ], ... }
 */
var turnosLista = [];

async function loadTurnos() {
  try {
    const doc = await db.collection('config').doc('turnos').get();
    const raw = doc.exists && doc.data().lista;
    turnosLista = Array.isArray(raw) ? raw.filter((t) => t && t.id && t.nombre) : [];
    turnosLista.sort((a, b) => (a.orden || 0) - (b.orden || 0) || String(a.nombre).localeCompare(b.nombre));
  } catch (e) {
    console.warn('loadTurnos', e);
    turnosLista = [];
  }
  renderCfgTurnosTable();
  return turnosLista;
}

async function persistTurnosLista() {
  await db.collection('config').doc('turnos').set(
    {
      lista: turnosLista,
      actualizado: firebase.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/** Rellena un <select> de turnos. selectedId: id del turno a marcar, o ''. emptyLabel: texto de la opción vacía. */
function fillTurnoSelect(selId, selectedId, emptyLabel) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const prev = selectedId !== undefined && selectedId !== null ? selectedId : sel.value;
  const elbl = emptyLabel || '— Seleccionar turno —';
  sel.innerHTML = `<option value="">${escapeHtml(elbl)}</option>`;
  turnosLista.forEach((t) => {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.nombre;
    o.dataset.nombre = t.nombre;
    if (t.id === prev) o.selected = true;
    sel.appendChild(o);
  });
}

/** Clave de día en horarioSemanal; índice = getDay() en hora local (0 = domingo). */
var EMP_SEMANA_KEYS_BY_GETDAY = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/** ids de <select> del modal empleada → clave Firestore */
var EMP_MODAL_HS_IDS = {
  lunes: 'em-hs-lunes',
  martes: 'em-hs-martes',
  miercoles: 'em-hs-miercoles',
  jueves: 'em-hs-jueves',
  viernes: 'em-hs-viernes',
  sabado: 'em-hs-sabado',
  domingo: 'em-hs-domingo',
};

/**
 * A partir de YYYY-MM-DD en calendario local, devuelve la clave de horarioSemanal (lunes…domingo).
 * Usa mediodía local para evitar desfaces por UTC.
 */
function fechaYMDToDiaSemanaKey(fechaStr) {
  if (!fechaStr || fechaStr.length < 10) return null;
  var ymd = fechaStr.slice(0, 10);
  var d = new Date(ymd + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return null;
  return EMP_SEMANA_KEYS_BY_GETDAY[d.getDay()];
}

/** Rellena un select del modal empleada: Descanso + turnos configurados. */
function fillEmpDiaHorarioSelect(selId, selectedId) {
  var sel = document.getElementById(selId);
  if (!sel) return;
  fillEmpDiaHorarioSelectElement(sel, selectedId);
}

function fillEmpDiaHorarioSelectElement(sel, selectedId) {
  var prev =
    selectedId !== undefined && selectedId !== null && selectedId !== ''
      ? String(selectedId)
      : sel.value || '__descanso__';
  sel.innerHTML = '';
  var oD = document.createElement('option');
  oD.value = '__descanso__';
  oD.textContent = 'Descanso / No trabaja';
  sel.appendChild(oD);
  turnosLista.forEach(function (t) {
    var o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.nombre;
    o.dataset.nombre = t.nombre;
    sel.appendChild(o);
  });
  if (prev === '__descanso__') sel.value = '__descanso__';
  else if (turnosLista.some(function (x) { return x.id === prev; })) sel.value = prev;
  else sel.value = '__descanso__';
}

function refreshEmpModalHorarioSelectsFromDom() {
  Object.keys(EMP_MODAL_HS_IDS).forEach(function (k) {
    var id = EMP_MODAL_HS_IDS[k];
    var el = document.getElementById(id);
    if (el) fillEmpDiaHorarioSelectElement(el, el.value);
  });
}

/**
 * Resuelve turno para empleada + fecha: horarioSemanal[día], o idTurnoPredeterminado legado.
 * @returns {{ kind: 'turno', id: string }|{ kind: 'descanso' }|{ kind: 'empty' }}
 */
function getTurnoResueltoForEmpleadaYFecha(empId, fechaStr) {
  if (!empId) return { kind: 'empty' };
  var emp = emps.find(function (e) { return e.id === empId; });
  if (!emp) return { kind: 'empty' };
  var diaKey = fechaYMDToDiaSemanaKey(fechaStr);
  if (!diaKey) return { kind: 'empty' };
  var hs = emp.horarioSemanal;
  if (hs && typeof hs === 'object' && Object.prototype.hasOwnProperty.call(hs, diaKey)) {
    var raw = hs[diaKey];
    if (raw === '' || raw === '__descanso__' || raw == null) return { kind: 'descanso' };
    return { kind: 'turno', id: String(raw) };
  }
  if (emp.idTurnoPredeterminado) return { kind: 'turno', id: String(emp.idTurnoPredeterminado) };
  return { kind: 'empty' };
}

function setTurnoDescansoHint(hintId, visible) {
  var hintEl = hintId && document.getElementById(hintId);
  if (!hintEl) return;
  if (visible) {
    hintEl.textContent = 'La empleada normalmente descansa este día; puedes elegir otro turno si aplica.';
    hintEl.style.display = 'block';
  } else {
    hintEl.textContent = '';
    hintEl.style.display = 'none';
  }
}

/**
 * Autocompleta el select de turno según empleada + fecha (horario local). El usuario puede cambiar el valor después.
 */
function syncTurnoFromEmpleadaYFecha(empId, fechaStr, selectId, hintId) {
  if (hintId) setTurnoDescansoHint(hintId, false);
  if (!empId) {
    fillTurnoSelect(selectId, '', undefined);
    return;
  }
  if (!fechaStr) return;
  var r = getTurnoResueltoForEmpleadaYFecha(empId, fechaStr);
  if (r.kind === 'descanso') {
    fillTurnoSelect(selectId, '', undefined);
    if (hintId) setTurnoDescansoHint(hintId, true);
    return;
  }
  if (r.kind === 'turno' && r.id) {
    fillTurnoSelect(selectId, r.id, undefined);
    return;
  }
  fillTurnoSelect(selectId, '', undefined);
}

/** Compatibilidad: solo empleada, sin fecha (p. ej. selects sin fecha aún). */
function syncTurnoFromEmpleada(empId, selectId) {
  if (!empId) {
    fillTurnoSelect(selectId, '', undefined);
    return;
  }
  var emp = emps.find(function (e) { return e.id === empId; });
  var tid = emp && emp.idTurnoPredeterminado ? String(emp.idTurnoPredeterminado) : '';
  fillTurnoSelect(selectId, tid, undefined);
}

function onVentaEmpTurno() {
  syncTurnoFromEmpleadaYFecha(
    document.getElementById('v-emp').value,
    document.getElementById('v-fecha').value,
    'v-turno',
    'v-turno-descanso-hint'
  );
}

function onVentaFechaTurnoSync() {
  onVentaEmpTurno();
}

function onBulkEmpTurno() {
  syncTurnoFromEmpleadaYFecha(
    document.getElementById('bk-emp').value,
    document.getElementById('bk-fecha').value,
    'bk-turno',
    'bk-turno-descanso-hint'
  );
}

function onBulkFechaTurnoSync() {
  onBulkEmpTurno();
}

function onRhEmpTurno() {
  syncTurnoFromEmpleadaYFecha(
    document.getElementById('rh-emp').value,
    document.getElementById('rh-fecha').value,
    'rh-turno',
    'rh-turno-descanso-hint'
  );
}

function onRhFechaTurnoSync() {
  onRhEmpTurno();
}

/** Lee turnoId + turnoNombre del <select> (nombre congelado al guardar). */
function readTurnoFromSelect(selId) {
  const sel = document.getElementById(selId);
  if (!sel || !sel.value) return { turnoId: '', turnoNombre: '' };
  const opt = sel.options[sel.selectedIndex];
  return {
    turnoId: sel.value,
    turnoNombre: (opt && opt.dataset && opt.dataset.nombre) || opt.textContent || '',
  };
}

/** Si hay turnos configurados, el select debe tener valor. */
function turnoSeleccionValido(selId) {
  if (!turnosLista.length) return true;
  const sel = document.getElementById(selId);
  return !!(sel && sel.value);
}

function nombreTurnoPorId(id) {
  if (!id) return '';
  const t = turnosLista.find((x) => x.id === id);
  return t ? t.nombre : '';
}

function renderCfgTurnosTable() {
  const tb = document.getElementById('tb-cfg-turnos');
  if (!tb) return;
  if (!turnosLista.length) {
    tb.innerHTML =
      '<tr><td colspan="5" style="text-align:center;color:var(--text2)">No hay turnos. Crea uno (ej. Matutino, Vespertino, Día completo).</td></tr>';
    return;
  }
  tb.innerHTML = turnosLista
    .map(
      (t) => `
    <tr>
      <td><strong>${escapeHtml(t.nombre)}</strong></td>
      <td style="color:var(--text2);max-width:200px">${escapeHtml(t.descripcion || '—')}</td>
      <td>${t.orden != null ? t.orden : 0}</td>
      <td><code style="font-size:11px;opacity:.75;word-break:break-all">${escapeHtml(t.id)}</code></td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button type="button" class="btn btn-s btn-sm" onclick="editTurnoId('${t.id}')">✏️ Editar</button>
        <button type="button" class="btn btn-bad btn-sm" onclick="delTurnoCfg('${t.id}')">🗑️</button>
      </td>
    </tr>`
    )
    .join('');
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function openTurnoModal() {
  document.getElementById('turno-id').value = '';
  document.getElementById('turno-nombre').value = '';
  document.getElementById('turno-desc').value = '';
  document.getElementById('turno-orden').value = '0';
  document.getElementById('mo-turno-ttl').textContent = 'Nuevo turno de trabajo';
  openMo('mo-turno');
}

function editTurnoId(id) {
  const t = turnosLista.find((x) => x.id === id);
  if (!t) return;
  document.getElementById('turno-id').value = t.id;
  document.getElementById('turno-nombre').value = t.nombre || '';
  document.getElementById('turno-desc').value = t.descripcion || '';
  document.getElementById('turno-orden').value = t.orden != null ? t.orden : 0;
  document.getElementById('mo-turno-ttl').textContent = 'Editar turno';
  openMo('mo-turno');
}

async function saveTurnoCfg() {
  const nombre = document.getElementById('turno-nombre').value.trim();
  const descripcion = document.getElementById('turno-desc').value.trim();
  const orden = parseInt(document.getElementById('turno-orden').value, 10);
  const tid = document.getElementById('turno-id').value;
  if (!nombre) {
    showToast('bad', '❌ Escribe el nombre del turno.');
    return;
  }
  try {
    await loadTurnos();
    const ord = Number.isNaN(orden) ? 0 : orden;
    if (tid) {
      const ix = turnosLista.findIndex((x) => x.id === tid);
      if (ix >= 0) turnosLista[ix] = { ...turnosLista[ix], nombre, descripcion, orden: ord };
      else turnosLista.push({ id: tid, nombre, descripcion, orden: ord });
    } else {
      const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 't_' + Date.now();
      turnosLista.push({ id, nombre, descripcion, orden: ord });
    }
    await persistTurnosLista();
    await loadTurnos();
    [
      ['v-turno', null],
      ['bk-turno', null],
      ['rh-turno', null],
      ['adm-v-turno', null],
    ].forEach(([id, lbl]) => {
      const el = document.getElementById(id);
      if (el) fillTurnoSelect(id, el.value, lbl || undefined);
    });
    refreshEmpModalHorarioSelectsFromDom();
    closeMo('mo-turno');
    showToast('ok', '✅ Lista de turnos actualizada.');
  } catch (e) {
    showToast('bad', '❌ ' + e.message);
  }
}

async function delTurnoCfg(id) {
  if (!confirm('¿Eliminar este turno? Las ventas ya guardadas conservan turnoId / turnoNombre.')) return;
  try {
    await loadTurnos();
    turnosLista = turnosLista.filter((t) => t.id !== id);
    await persistTurnosLista();
    await loadTurnos();
    [
      ['v-turno', null],
      ['bk-turno', null],
      ['rh-turno', null],
      ['adm-v-turno', null],
    ].forEach(([sid, lbl]) => {
      const el = document.getElementById(sid);
      if (el) fillTurnoSelect(sid, '', lbl || undefined);
    });
    refreshEmpModalHorarioSelectsFromDom();
    showToast('ok', '✅ Turno eliminado.');
  } catch (e) {
    alert('Error: ' + e.message);
  }
}
