/* Estado compartido, auth, navegación, catálogo, empleadas, gastos, ahorros, dashboard, cierre */
var sbCol = false,
  curSec = 'dashboard';
var emps = [],
  cats = [];
var cfg = {};
var cierreData = null;
/** Último resumen mensual cargado en Cierre (para PDF). */
var cierreMesSnapshot = null;
/** Último cálculo de distribución; solo válido si `monthKey` coincide con el mes del snapshot. */
var cierreDistribForPdf = null;

auth.onAuthStateChanged((u) => {
  if (u) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.add('active');
    document.getElementById('sb-uemail').textContent = u.email;
    document.getElementById('sb-av').textContent = u.email[0].toUpperCase();
    document.getElementById('sb-uname').textContent = u.displayName || u.email.split('@')[0];
    initApp();
  } else {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app').classList.remove('active');
  }
});
async function doLogin() {
  const e = document.getElementById('li-email').value.trim(),
    p = document.getElementById('li-pass').value;
  const err = document.getElementById('li-err'),
    btn = document.getElementById('btn-li');
  err.textContent = '';
  btn.textContent = 'Iniciando…';
  btn.disabled = true;
  try {
    await auth.signInWithEmailAndPassword(e, p);
  } catch (ex) {
    err.textContent = 'Correo o contraseña incorrectos.';
    btn.textContent = 'Iniciar Sesión';
    btn.disabled = false;
  }
}
document.getElementById('li-pass').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') doLogin();
});
async function doLogout() {
  await auth.signOut();
}

async function initApp() {
  updateDate();
  setInterval(updateDate, 60000);
  initMonthInputs();
  await loadCfg();
  initPdfLogoFileInput();
  await loadTurnos();
  await loadEmpsCache();
  await loadCatsCache();
  loadDash();
  document.getElementById('v-fecha').value = today();
  document.getElementById('g-fecha').value = today();
  document.getElementById('bk-fecha').value = today();
  const rhFecha = document.getElementById('rh-fecha');
  if (rhFecha) rhFecha.value = today();
  initBulk();
}
function updateDate() {
  document.getElementById('tb-date').textContent = new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

function toggleSB() {
  sbCol = !sbCol;
  document.getElementById('sb').classList.toggle('col', sbCol);
  document.getElementById('main').classList.toggle('col', sbCol);
  document.getElementById('sb-tog').textContent = sbCol ? '›' : '‹';
}

function toggleSbGroup(btn) {
  const sb = document.getElementById('sb');
  if (!btn || sb.classList.contains('col')) return;
  const g = btn.closest('.sb-group');
  if (!g) return;
  const open = g.classList.toggle('open');
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

/** Abre el acordeón que contiene la sección activa (para ver el ítem resaltado). */
function openSbGroupForSection(sec) {
  const sb = document.getElementById('sb');
  if (sb.classList.contains('col')) return;
  const it = sb.querySelector(`.nav-it[data-s="${sec}"]`);
  if (!it) return;
  const g = it.closest('.sb-group');
  if (!g) return;
  g.classList.add('open');
  const cat = g.querySelector('.sb-cat');
  if (cat) cat.setAttribute('aria-expanded', 'true');
}

const pageMap = {
  dashboard: ['Dashboard', 'Vista general del negocio'],
  ventas: ['Venta Rápida', 'Registra un servicio individual'],
  masiva: ['Corte por Empleada', 'Captura múltiples servicios de un día'],
  historico: ['Registro Histórico Diario', 'Resumen de un día pasado por empleada'],
  gastos: ['Gastos', 'Control de egresos del negocio'],
  catalogo: ['Catálogo de Servicios', 'Precios y comisiones por defecto'],
  empleados: ['Empleadas', 'Gestión de personal'],
  ahorros: ['Fondo de Ahorros', 'Control del ahorro empresarial'],
  reportes: ['Reportes y Estadísticas', 'Análisis de desempeño mensual'],
  cierre: ['Cierre de Caja', 'Cálculo de ganancias y distribución'],
  admin: ['Administrar Datos', 'Gestor de movimientos del mes'],
  config: ['Configuración', 'Ajustes del sistema'],
};
async function go(sec, opts) {
  if (sec === 'admin' && opts && opts.clearAdminDrill && typeof adminDrillFilter !== 'undefined') {
    adminDrillFilter = null;
    const b = document.getElementById('adm-drill-banner');
    if (b) b.style.display = 'none';
  }
  document.querySelectorAll('#sb .nav-it').forEach((el) => el.classList.remove('on'));
  document.querySelectorAll('.pg').forEach((el) => el.classList.remove('on'));
  document.querySelector(`#sb .nav-it[data-s="${sec}"]`)?.classList.add('on');
  document.getElementById(`pg-${sec}`)?.classList.add('on');
  openSbGroupForSection(sec);
  curSec = sec;
  const [t, s] = pageMap[sec] || ['—', '—'];
  document.getElementById('tb-title').textContent = t;
  document.getElementById('tb-sub').textContent = s;
  if (sec === 'dashboard') loadDash();
  else if (sec === 'ventas') {
    await loadTurnos();
    loadEmpsSelect('v-emp');
    loadCatSelect('v-serv-sel');
    fillTurnoSelect('v-turno', '');
    onVentaEmpTurno();
    document.getElementById('v-hist-card').style.display = 'none';
  } else if (sec === 'masiva') {
    await loadTurnos();
    loadEmpsSelect('bk-emp');
    fillTurnoSelect('bk-turno', '');
    onBulkEmpTurno();
    rebuildBulkSelects();
  } else if (sec === 'historico') {
    await loadTurnos();
    loadEmpsSelect('rh-emp');
    fillTurnoSelect('rh-turno', '');
    onRhEmpTurno();
  } else if (sec === 'gastos') loadGastos();
  else if (sec === 'catalogo') loadCatalogo();
  else if (sec === 'empleados') loadEmps();
  else if (sec === 'ahorros') loadAhorros();
  else if (sec === 'reportes') loadReportes();
  else if (sec === 'cierre') await loadCierreResumenMes();
  else if (sec === 'admin') await loadAdminMovimientos();
  else if (sec === 'config') {
    await loadTurnos();
    refreshPdfLogoConfigUi();
  }
}

async function loadCfg() {
  try {
    const doc = await db.collection('config').doc('main').get();
    cfg = doc.exists ? { ...doc.data() } : {};
  } catch (e) {
    cfg = {};
  }
  cfg.dueno1Nombre = (cfg.dueno1Nombre || '').trim() || 'Dueño 1';
  cfg.dueno2Nombre = (cfg.dueno2Nombre || '').trim() || 'Dueño 2';
  document.getElementById('cfg-nom').value = cfg.nombreEmpresa || '';
  document.getElementById('cfg-tkt').value = cfg.ticketMensaje || '';
  const own1 = document.getElementById('cfg-own1');
  const own2 = document.getElementById('cfg-own2');
  if (own1) own1.value = cfg.dueno1Nombre;
  if (own2) own2.value = cfg.dueno2Nombre;
  applyCierreOwnerLabels();
  refreshPdfLogoConfigUi();
}

function getOwnerNombre1() {
  return (cfg.dueno1Nombre || '').trim() || 'Dueño 1';
}

function getOwnerNombre2() {
  return (cfg.dueno2Nombre || '').trim() || 'Dueño 2';
}

function applyCierreOwnerLabels() {
  const l1 = document.getElementById('cj-owner1-lbl');
  const l2 = document.getElementById('cj-owner2-lbl');
  if (l1) l1.textContent = '🧑 ' + getOwnerNombre1();
  if (l2) l2.textContent = '🧑 ' + getOwnerNombre2();
}

/** Logo del PDF de cierre: solo en este dispositivo (localStorage). */
var LS_KEY_PDF_LOGO = 'esteticaRomina_pdfCierreLogo';

function getPdfReportLogoDataUrl() {
  try {
    const s = localStorage.getItem(LS_KEY_PDF_LOGO);
    return s && /^data:image\/[a-z0-9+.-]+;base64,/i.test(s) ? s : '';
  } catch (e) {
    return '';
  }
}

function refreshPdfLogoConfigUi() {
  const url = getPdfReportLogoDataUrl();
  const prev = document.getElementById('cfg-pdf-logo-preview');
  const ph = document.getElementById('cfg-pdf-logo-placeholder');
  const btnClear = document.getElementById('cfg-pdf-logo-clear');
  if (!prev || !ph) return;
  if (url) {
    prev.src = url;
    prev.style.display = 'block';
    ph.style.display = 'none';
    if (btnClear) btnClear.style.display = 'inline-flex';
  } else {
    prev.removeAttribute('src');
    prev.style.display = 'none';
    ph.style.display = 'block';
    if (btnClear) btnClear.style.display = 'none';
  }
}

function initPdfLogoFileInput() {
  const inp = document.getElementById('cfg-pdf-logo-file');
  if (!inp || inp.dataset.bound === '1') return;
  inp.dataset.bound = '1';
  inp.addEventListener('change', onPdfLogoFileChange);
}

/**
 * Redimensiona y comprime imagen a data URL (PNG/WebP → PNG; resto → JPEG).
 * @param {File} file
 * @param {number} maxW
 * @param {boolean} [forceJpeg] si true, siempre JPEG (menos peso para reintento en localStorage)
 */
function compressImageFileToDataUrl(file, maxW, forceJpeg) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    r.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('No es una imagen válida.'));
      img.onload = () => {
        let w = img.naturalWidth,
          h = img.naturalHeight;
        if (!w || !h) {
          reject(new Error('Imagen sin dimensiones.'));
          return;
        }
        const scale = w > maxW ? maxW / w : 1;
        w = Math.round(w * scale);
        h = Math.round(h * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        const usePng = !forceJpeg && /png|webp/i.test(file.type || '');
        if (!usePng) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(img, 0, 0, w, h);
        let out = usePng ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.88);
        if (out.length > 1.8e6 && usePng) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          out = canvas.toDataURL('image/jpeg', 0.82);
        }
        resolve(out);
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}

async function onPdfLogoFileChange(ev) {
  const inp = ev.target;
  const f = inp.files && inp.files[0];
  inp.value = '';
  if (!f) return;
  if (!/^image\//i.test(f.type)) {
    showToast('bad', 'Elige un archivo de imagen (PNG, JPG, WEBP…).');
    return;
  }
  if (f.size > 5 * 1024 * 1024) {
    showToast('bad', 'La imagen es demasiado grande (máx. 5 MB).');
    return;
  }
  try {
    let dataUrl = await compressImageFileToDataUrl(f, 560);
    try {
      localStorage.setItem(LS_KEY_PDF_LOGO, dataUrl);
    } catch (err) {
      if (err && err.name === 'QuotaExceededError') {
        dataUrl = await compressImageFileToDataUrl(f, 300, true);
        localStorage.setItem(LS_KEY_PDF_LOGO, dataUrl);
      } else throw err;
    }
    refreshPdfLogoConfigUi();
    showToast('ok', '✅ Logo guardado para el PDF de cierre.');
  } catch (e) {
    showToast('bad', '❌ ' + (e.message || 'No se pudo guardar el logo.'));
  }
}

function clearPdfLogo() {
  try {
    localStorage.removeItem(LS_KEY_PDF_LOGO);
  } catch (e) {}
  refreshPdfLogoConfigUi();
  showToast('ok', 'Logo del PDF quitado.');
}

async function saveConfig() {
  const data = {
    nombreEmpresa: document.getElementById('cfg-nom').value.trim() || 'Estética Romina',
    ticketMensaje: document.getElementById('cfg-tkt').value.trim() || '¡Gracias por tu preferencia!',
    dueno1Nombre: document.getElementById('cfg-own1').value.trim() || 'Dueño 1',
    dueno2Nombre: document.getElementById('cfg-own2').value.trim() || 'Dueño 2',
  };
  try {
    await db.collection('config').doc('main').set(data, { merge: true });
    cfg = { ...cfg, ...data };
    applyCierreOwnerLabels();
    showToast('ok', '✅ Configuración guardada.');
  } catch (e) {
    showToast('bad', '❌ Error: ' + e.message);
  }
}

async function loadCatsCache() {
  try {
    const snap = await db.collection('catalogo').orderBy('nombre').get();
    cats = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    cats = [];
  }
}
async function loadCatalogo() {
  await loadCatsCache();
  const wrap = document.getElementById('cat-grid-wrap');
  if (!cats.length) {
    wrap.innerHTML = '<div class="empty"><div class="empty-ico">🗂️</div><p>No hay servicios en el catálogo. Agrega el primero.</p></div>';
    return;
  }
  wrap.innerHTML = `<div class="cat-grid">${cats
    .map(
      (c) => `
    <div class="cat-card">
      ${c.categoria ? `<div style="font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">${c.categoria}</div>` : ''}
      <div class="cat-nm">${c.nombre}</div>
      <div class="cat-pr">${$m(c.precioBase)}</div>
      <div class="cat-com">Comisión defecto: ${c.comisionDefecto || 0}%</div>
      <div class="cat-actions">
        <button class="btn btn-s btn-sm" onclick='editCat(${JSON.stringify(c)})'>✏️ Editar</button>
        <button class="btn btn-bad btn-sm" onclick="delCat('${c.id}')">🗑️</button>
      </div>
    </div>
  `
    )
    .join('')}</div>`;
}
function openCatModal() {
  ['cat-nom', 'cat-precio', 'cat-com', 'cat-cat', 'cat-id'].forEach((id) => (document.getElementById(id).value = ''));
  document.getElementById('mo-cat-ttl').textContent = 'Nuevo Servicio';
  openMo('mo-cat');
}
function editCat(c) {
  document.getElementById('cat-nom').value = c.nombre || '';
  document.getElementById('cat-precio').value = c.precioBase || '';
  document.getElementById('cat-com').value = c.comisionDefecto || '';
  document.getElementById('cat-cat').value = c.categoria || '';
  document.getElementById('cat-id').value = c.id;
  document.getElementById('mo-cat-ttl').textContent = 'Editar Servicio';
  openMo('mo-cat');
}
async function saveCat() {
  const nombre = document.getElementById('cat-nom').value.trim();
  const precio = parseFloat(document.getElementById('cat-precio').value) || 0;
  const com = parseFloat(document.getElementById('cat-com').value) || 0;
  const cat = document.getElementById('cat-cat').value.trim();
  const cid = document.getElementById('cat-id').value;
  if (!nombre) {
    alert('Ingresa el nombre del servicio.');
    return;
  }
  const data = { nombre, precioBase: precio, comisionDefecto: com, categoria: cat };
  try {
    if (cid) await db.collection('catalogo').doc(cid).update(data);
    else await db.collection('catalogo').add(data);
    closeMo('mo-cat');
    await loadCatsCache();
    loadCatalogo();
    loadCatSelect('v-serv-sel');
    rebuildBulkSelects();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}
async function delCat(id) {
  if (!confirm('¿Eliminar este servicio del catálogo?')) return;
  await db.collection('catalogo').doc(id).delete();
  await loadCatsCache();
  loadCatalogo();
}

async function loadEmpsCache() {
  try {
    const snap = await db.collection('empleados').orderBy('nombre').get();
    emps = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    emps = [];
  }
}
async function loadEmps() {
  await loadTurnos();
  await loadEmpsCache();
  const tb = document.getElementById('tb-emps');
  if (!emps.length) {
    tb.innerHTML = '<tr><td colspan="5"><div class="empty"><div class="empty-ico">👩‍💼</div><p>No hay empleadas registradas.</p></div></td></tr>';
    return;
  }
  tb.innerHTML = emps
    .map(
      (e) => `
    <tr>
      <td><strong>${e.nombre}</strong></td>
      <td><span class="bdg bdg-info">${e.rol || '—'}</span></td>
      <td>${e.comisionDefecto || 0}%</td>
      <td>${formatHorarioEmpleadaColumn(e)}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-s btn-sm" onclick='editEmp(${JSON.stringify(e)})'>✏️ Editar</button>
        <button class="btn btn-bad btn-sm" onclick="delEmp('${e.id}')">🗑️</button>
      </td>
    </tr>`
    )
    .join('');
}
function collectHorarioSemanalFromEmpModal() {
  const horarioSemanal = {};
  Object.keys(EMP_MODAL_HS_IDS).forEach((k) => {
    const el = document.getElementById(EMP_MODAL_HS_IDS[k]);
    horarioSemanal[k] = el && el.value ? el.value : '__descanso__';
  });
  return horarioSemanal;
}

/** Resumen corto para la tabla de empleadas (lista + horario semanal o legado). */
function formatHorarioEmpleadaColumn(e) {
  const hs = e.horarioSemanal;
  if (hs && typeof hs === 'object') {
    const keys = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
    let work = 0;
    const names = {};
    keys.forEach((k) => {
      const v = hs[k];
      if (v && v !== '__descanso__') {
        work++;
        const n = nombreTurnoPorId(String(v));
        if (n) names[n] = true;
      }
    });
    const uniq = Object.keys(names);
    if (!uniq.length) return 'Descanso (toda la semana)';
    if (uniq.length === 1) return uniq[0] + (work < 7 ? ' · ' + work + ' d.' : '');
    return uniq.slice(0, 2).join(' / ') + (uniq.length > 2 ? '…' : '') + ' · ' + work + ' d.';
  }
  return nombreTurnoPorId(e.idTurnoPredeterminado) || '—';
}

async function openEmpModal() {
  await loadTurnos();
  ['em-nom', 'em-com', 'em-id'].forEach((id) => (document.getElementById(id).value = ''));
  document.getElementById('em-rol').value = 'Estilista';
  Object.keys(EMP_MODAL_HS_IDS).forEach((k) => {
    fillEmpDiaHorarioSelect(EMP_MODAL_HS_IDS[k], '__descanso__');
  });
  document.getElementById('mo-emp-ttl').textContent = 'Nueva Empleada';
  openMo('mo-emp');
}
async function editEmp(e) {
  await loadTurnos();
  document.getElementById('em-nom').value = e.nombre;
  document.getElementById('em-rol').value = e.rol || 'Estilista';
  document.getElementById('em-com').value = e.comisionDefecto || 0;
  document.getElementById('em-id').value = e.id;
  const hs = e.horarioSemanal && typeof e.horarioSemanal === 'object' ? e.horarioSemanal : null;
  const fallback = e.idTurnoPredeterminado ? String(e.idTurnoPredeterminado) : '__descanso__';
  Object.keys(EMP_MODAL_HS_IDS).forEach((k) => {
    const raw = hs && hs[k] != null && hs[k] !== '' ? String(hs[k]) : fallback;
    fillEmpDiaHorarioSelect(EMP_MODAL_HS_IDS[k], raw);
  });
  document.getElementById('mo-emp-ttl').textContent = 'Editar Empleada';
  openMo('mo-emp');
}
async function saveEmp() {
  const nombre = document.getElementById('em-nom').value.trim(),
    rol = document.getElementById('em-rol').value,
    com = parseFloat(document.getElementById('em-com').value) || 0,
    eid = document.getElementById('em-id').value;
  const horarioSemanal = collectHorarioSemanalFromEmpModal();
  if (!nombre) {
    alert('Ingresa el nombre.');
    return;
  }
  try {
    if (eid) {
      await db
        .collection('empleados')
        .doc(eid)
        .update({
          nombre,
          rol,
          comisionDefecto: com,
          horarioSemanal,
          idTurnoPredeterminado: firebase.firestore.FieldValue.delete(),
        });
    } else {
      await db.collection('empleados').add({ nombre, rol, comisionDefecto: com, horarioSemanal });
    }
    closeMo('mo-emp');
    await loadEmpsCache();
    loadEmps();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}
async function delEmp(id) {
  if (!confirm('¿Eliminar esta empleada?')) return;
  await db.collection('empleados').doc(id).delete();
  await loadEmpsCache();
  loadEmps();
}
function loadEmpsSelect(selId) {
  const sel = document.getElementById(selId);
  sel.innerHTML = '<option value="">Seleccionar…</option>';
  emps.forEach((e) => {
    const o = document.createElement('option');
    o.value = e.id;
    o.textContent = e.nombre;
    sel.appendChild(o);
  });
}
function loadCatSelect(selId) {
  const sel = document.getElementById(selId);
  sel.innerHTML = '<option value="">Seleccionar servicio…</option>';
  cats.forEach((c) => {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.nombre + (c.categoria ? ` (${c.categoria})` : '');
    o.dataset.precio = c.precioBase || 0;
    o.dataset.com = c.comisionDefecto || 0;
    o.dataset.nombre = c.nombre;
    sel.appendChild(o);
  });
}

async function regGasto() {
  const fecha = document.getElementById('g-fecha').value,
    cat = document.getElementById('g-cat').value;
  const conc = document.getElementById('g-concepto').value.trim(),
    monto = parseFloat(document.getElementById('g-monto').value);
  if (!fecha || !conc || !monto) {
    showToast('bad', '❌ Completa todos los campos.');
    return;
  }
  try {
    await db.collection('gastos').add({ fecha, concepto: conc, monto, categoria: cat });
    showToast('ok', '✅ Gasto registrado.');
    document.getElementById('g-concepto').value = '';
    document.getElementById('g-monto').value = '';
    loadGastos();
  } catch (e) {
    showToast('bad', '❌ Error: ' + e.message);
  }
}
async function loadGastos() {
  const inp = document.getElementById('g-mf');
  let m = normalizeMonthYYYYMM(inp?.value) || curMonth();
  if (inp && inp.value !== m) inp.value = m;
  const { start, end } = monthRange(m);
  const tb = document.getElementById('tb-gastos');
  tb.innerHTML = '<tr><td colspan="5" style="text-align:center">Cargando…</td></tr>';
  try {
    const snap = await db.collection('gastos').where('fecha', '>=', start).where('fecha', '<=', end).orderBy('fecha', 'desc').get();
    let fijo = 0,
      op = 0;
    snap.docs.forEach((d) => {
      const g = d.data();
      if (g.categoria === 'Fijo') fijo += g.monto;
      else op += g.monto;
    });
    document.getElementById('gs-fijo').textContent = $m(fijo);
    document.getElementById('gs-op').textContent = $m(op);
    document.getElementById('gs-tot').textContent = $m(fijo + op);
    if (snap.empty) {
      tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text2)">Sin gastos en este periodo.</td></tr>';
      return;
    }
    tb.innerHTML = snap.docs
      .map((d) => {
        const g = d.data();
        const bc = g.categoria === 'Fijo' ? 'bdg-fijo' : 'bdg-op';
        return `<tr><td>${g.fecha}</td><td>${g.concepto}</td><td><span class="bdg ${bc}">${g.categoria}</span></td><td><strong>${$m(g.monto)}</strong></td><td><button class="btn btn-bad btn-sm" onclick="delGasto('${d.id}')">🗑️</button></td></tr>`;
      })
      .join('');
  } catch (e) {
    tb.innerHTML = `<tr><td colspan="5">Error: ${e.message}</td></tr>`;
  }
}
async function delGasto(id) {
  if (!confirm('¿Eliminar?')) return;
  await db.collection('gastos').doc(id).delete();
  loadGastos();
}

async function loadAhorros() {
  try {
    const doc = await db.collection('ahorro').doc('main').get();
    const data = doc.exists ? doc.data() : { saldoActual: 0, historial: [] };
    document.getElementById('sav-amt').textContent = $m(data.saldoActual || 0);
    document.getElementById('s-aho').textContent = $m(data.saldoActual || 0);
    renderAhoHist(data.historial || []);
  } catch (e) {}
}
function renderAhoHist(hist) {
  const el = document.getElementById('aho-hist');
  if (!hist.length) {
    el.innerHTML = '<div class="empty"><div class="empty-ico">🏦</div><p>Sin movimientos registrados.</p></div>';
    return;
  }
  el.innerHTML = [...hist]
    .sort((a, b) => (b.fecha > a.fecha ? 1 : -1))
    .map(
      (h) => `
    <div class="hist-it">
      <div class="hist-l"><div class="hist-ttl">${h.motivo || 'Sin descripción'}</div>
        <div class="hist-dt">${h.fecha} &bull; <span class="bdg ${h.tipo === 'entrada' ? 'bdg-ok' : 'bdg-warn'}">${h.tipo === 'entrada' ? '⬆️ Entrada' : '⬇️ Salida'}</span></div>
      </div>
      <div class="${h.tipo === 'entrada' ? 'amt-in' : 'amt-out'}">${h.tipo === 'entrada' ? '+' : '−'}${$m(h.monto)}</div>
    </div>`
    )
    .join('');
}
function openAhoModal(tipo) {
  document.getElementById('ah-tipo').value = tipo;
  document.getElementById('ah-monto').value = '';
  document.getElementById('ah-motivo').value = '';
  document.getElementById('mo-aho-ttl').textContent = tipo === 'entrada' ? '⬆️ Ingresar al Ahorro' : '⬇️ Retirar del Ahorro';
  document.getElementById('ah-btn').className = `btn btn-full ${tipo === 'entrada' ? 'btn-ok' : 'btn-bad'}`;
  openMo('mo-aho');
}
async function saveAhorro() {
  const tipo = document.getElementById('ah-tipo').value,
    monto = parseFloat(document.getElementById('ah-monto').value),
    motivo = document.getElementById('ah-motivo').value.trim();
  if (!monto || monto <= 0) {
    alert('Ingresa un monto válido.');
    return;
  }
  try {
    const ref = db.collection('ahorro').doc('main');
    const doc = await ref.get();
    let saldo = doc.exists ? doc.data().saldoActual || 0 : 0,
      hist = doc.exists ? doc.data().historial || [] : [];
    if (tipo === 'entrada') saldo += monto;
    else {
      if (monto > saldo) {
        alert('Saldo insuficiente.');
        return;
      }
      saldo -= monto;
    }
    hist.push({ fecha: today(), monto, tipo, motivo: motivo || '—' });
    await ref.set({ saldoActual: saldo, historial: hist });
    closeMo('mo-aho');
    loadAhorros();
  } catch (e) {
    alert('Error: ' + e.message);
  }
}

function onCjMesChange() {
  cierreDistribForPdf = null;
  loadCierreResumenMes();
}

/** Actualiza encabezado del reporte y resumen mensual (empleadas, semanas, gastos) en Cierre de caja. */
async function loadCierreResumenMes() {
  const sel = document.getElementById('cj-m');
  if (!sel) return;
  let m = normalizeMonthYYYYMM(sel.value) || curMonth();
  if (sel.value !== m) sel.value = m;
  const periodoTxt = formatMonthLabel(m);
  const empEl = document.getElementById('cj-doc-empresa');
  if (empEl) empEl.textContent = cfg.nombreEmpresa || 'Estética Romina';
  const perEl = document.getElementById('cj-doc-periodo');
  if (perEl) perEl.textContent = 'Periodo: ' + periodoTxt;
  const feEl = document.getElementById('cj-doc-fecha');
  if (feEl)
    feEl.textContent =
      'Datos consultados: ' + new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
  const { start, end } = monthRange(m);
  await loadEmpsCache();
  const tb = document.getElementById('tb-cj-emp');
  const semGrid = document.getElementById('cj-sem-grid');
  const gasEl = document.getElementById('cj-res-gasto-tot');
  if (!tb || !semGrid || !gasEl) return;
  tb.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text2)">Cargando…</td></tr>';
  semGrid.innerHTML = '<div class="cj-sem-loading">Cargando…</div>';
  try {
    const [snapV, snapG] = await Promise.all([
      db.collection('ventas').where('fecha', '>=', start).where('fecha', '<=', end).get(),
      db.collection('gastos').where('fecha', '>=', start).where('fecha', '<=', end).get(),
    ]);
    const ventas = snapV.docs.map((d) => ({ id: d.id, ...d.data() }));
    let tv = 0,
      tc = 0,
      tu = 0;
    ventas.forEach((v) => {
      tv += ventaBrutaDesdeVenta(v);
      tc += comisionDesdeVenta(v);
      tu += utilidadNegocioDesdeVenta(v);
    });
    const st = {};
    emps.forEach((e) => {
      st[e.id] = { nombre: e.nombre, total: 0, com: 0 };
    });
    ventas.forEach((v) => {
      if (st[v.idEmpleado]) {
        st[v.idEmpleado].total += ventaBrutaDesdeVenta(v);
        st[v.idEmpleado].com += comisionDesdeVenta(v);
      }
    });
    const esc = typeof escapeRepHtml === 'function' ? escapeRepHtml : (s) => String(s || '');
    const rows = Object.values(st).sort((a, b) => b.total - a.total || b.com - a.com);
    if (!emps.length)
      tb.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--text2)">Sin empleadas registradas.</td></tr>';
    else
      tb.innerHTML = rows
        .map(
          (r) =>
            `<tr><td><strong>${esc(r.nombre)}</strong></td><td>${$m(r.total)}</td><td style="color:var(--warn)">${$m(r.com)}</td></tr>`
        )
        .join('');

    const sem = [0, 0, 0, 0];
    ventas.forEach((v) => {
      const f = v.fecha || '';
      if (f.length < 10) return;
      const d = parseInt(f.slice(8, 10), 10);
      if (Number.isNaN(d) || d < 1 || d > 31) return;
      const wk = repWeekOfMonth(d);
      sem[wk - 1] += ventaBrutaDesdeVenta(v);
    });
    const labels = ['Semana 1', 'Semana 2', 'Semana 3', 'Semana 4'];
    const last = repUltimoDiaMes(m);
    const periodos = ['Días 1 – 7', 'Días 8 – 14', 'Días 15 – 21', 'Días 22 – ' + last];
    const maxV = Math.max(...sem, 0);
    semGrid.innerHTML = labels
      .map((lbl, i) => {
        const isBest = maxV > 0 && sem[i] === maxV && sem[i] > 0;
        return `<div class="cj-sem-box${isBest ? ' cj-sem-best' : ''}">
          <div class="cj-sem-lbl">${lbl}</div>
          <div class="cj-sem-sub">${periodos[i]}</div>
          <div class="cj-sem-val">${$m(sem[i])}</div>
          ${isBest ? '<div class="cj-sem-badge">Mejor semana</div>' : ''}
        </div>`;
      })
      .join('');

    let tg = 0;
    snapG.docs.forEach((d) => (tg += d.data().monto || 0));
    gasEl.textContent = $m(tg);
    const gananciaNeta = tu - tg;
    const netVal = document.getElementById('cj-net-profit-val');
    const netV = document.getElementById('cj-net-v');
    const netC = document.getElementById('cj-net-c');
    const netG = document.getElementById('cj-net-g');
    if (netVal) netVal.textContent = $m(gananciaNeta);
    if (netV) netV.textContent = $m(tv);
    if (netC) netC.textContent = $m(tc);
    if (netG) netG.textContent = $m(tg);
    const wrap = document.getElementById('cj-ganancia-wrap');
    if (wrap) {
      wrap.classList.toggle('cj-gn-negative', gananciaNeta < 0);
    }
    const edoV = document.getElementById('cj-edo-v');
    const edoC = document.getElementById('cj-edo-c');
    const edoG = document.getElementById('cj-edo-g');
    const edoN = document.getElementById('cj-edo-net');
    const edoCard = document.getElementById('cj-edo-res');
    if (edoV) edoV.textContent = $m(tv);
    if (edoC) edoC.textContent = $m(tc);
    if (edoG) edoG.textContent = $m(tg);
    if (edoN) edoN.textContent = $m(gananciaNeta);
    if (edoCard) edoCard.classList.toggle('cj-edo-neg', gananciaNeta < 0);
    const semRows = labels.map((lbl, i) => ({ label: lbl, periodo: periodos[i], monto: sem[i] }));
    cierreMesSnapshot = {
      monthKey: m,
      periodoLabel: periodoTxt,
      empRows: rows.map((r) => ({ nombre: r.nombre, total: r.total, com: r.com })),
      semRows,
      tv,
      tc,
      tg,
      gananciaNeta,
    };
  } catch (e) {
    console.error('loadCierreResumenMes', e);
    cierreMesSnapshot = null;
    tb.innerHTML = `<tr><td colspan="3">Error: ${e.message}</td></tr>`;
    semGrid.innerHTML = '';
    gasEl.textContent = '—';
    const netVal = document.getElementById('cj-net-profit-val');
    if (netVal) netVal.textContent = '—';
    ['cj-net-v', 'cj-net-c', 'cj-net-g'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    document.getElementById('cj-ganancia-wrap')?.classList.remove('cj-gn-negative');
    document.getElementById('cj-edo-res')?.classList.remove('cj-edo-neg');
    ['cj-edo-v', 'cj-edo-c', 'cj-edo-g', 'cj-edo-net'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
  }
}

function pdfEscPdf(s) {
  const t = String(s ?? '');
  if (typeof escapeRepHtml === 'function') return escapeRepHtml(t);
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Cuerpo del anexo (título + tabla). Requiere `cierreData` del mes del snapshot.
 * @param {{ pageBreakBefore?: boolean; paginableAnexo?: boolean }} opts
 */
function buildCierrePdfAnexoDiarioInnerHtml(snap, opts) {
  if (!cierreData || cierreData.monthKey !== snap.monthKey || !Array.isArray(cierreData.ventas)) return '';
  const list = [...cierreData.ventas].sort((a, b) => {
    const fa = String(a.fecha || '');
    const fb = String(b.fecha || '');
    if (fa !== fb) return fa.localeCompare(fb);
    return String(a.empleadaNombre || '').localeCompare(String(b.empleadaNombre || ''));
  });
  const tbody =
    list.length === 0
      ? '<tr><td colspan="5" class="pdf-anexo-diario__empty">Sin movimientos de venta en el periodo.</td></tr>'
      : list
          .map((v) => {
            const bruto = ventaBrutaDesdeVenta(v);
            const com = comisionDesdeVenta(v);
            const util = utilidadNegocioDesdeVenta(v);
            return `<tr class="pdf-anexo-diario__row"><td class="pdf-anexo-diario__cell">${pdfEscPdf(v.fecha || '—')}</td><td class="pdf-anexo-diario__cell">${pdfEscPdf(v.empleadaNombre || '—')}</td><td class="pdf-anexo-diario__cell pdf-anexo-diario__cell--num">${$m(bruto)}</td><td class="pdf-anexo-diario__cell pdf-anexo-diario__cell--num">${$m(com)}</td><td class="pdf-anexo-diario__cell pdf-anexo-diario__cell--num">${$m(util)}</td></tr>`;
          })
          .join('');
  const pb = opts && opts.pageBreakBefore ? ' style="page-break-before: always;"' : '';
  const secClass = opts && opts.paginableAnexo ? 'pdf-sec pdf-sec-anexo' : 'pdf-sec';
  return `<section class="${secClass}"${pb}>
    <div class="pdf-anexo-diario">
      <h2 class="pdf-anexo-diario__title">Anexo: Desglose Diario de Movimientos</h2>
      <div class="pdf-anexo-diario__table-wrap">
        <table class="pdf-anexo-diario__table" role="table">
          <colgroup>
            <col class="pdf-anexo-diario__col-fecha" />
            <col class="pdf-anexo-diario__col-emp" />
            <col class="pdf-anexo-diario__col-num" />
            <col class="pdf-anexo-diario__col-num" />
            <col class="pdf-anexo-diario__col-num" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Empleada</th>
              <th scope="col">Venta bruta</th>
              <th scope="col">Comisión</th>
              <th scope="col">Entregado (utilidad)</th>
            </tr>
          </thead>
          <tbody>${tbody}</tbody>
        </table>
      </div>
    </div>
  </section>`;
}

/** Anexo al final del reporte completo (solo si el checkbox está activo). */
function buildCierrePdfAnexoDiarioHtml(snap) {
  if (!document.getElementById('cj-inc-diario')?.checked) return '';
  return buildCierrePdfAnexoDiarioInnerHtml(snap, { pageBreakBefore: true, paginableAnexo: true }) || '';
}

/** Arma el HTML de la plantilla A4 (contenido de `#cj-pdf-root`). */
function buildCierrePdfHtml(snap, dist) {
  const empresa = cfg.nombreEmpresa || 'Estética Romina';
  const owner1 = getOwnerNombre1();
  const owner2 = getOwnerNombre2();
  const numDuenos = dist.ok && dist.d && Number(dist.d.numDuenos) === 1 ? 1 : 2;
  const emit = new Date().toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' });
  const negClass = snap.gananciaNeta < 0 ? ' pdf-net-neg' : '';
  const rowsHtml = snap.empRows.length
    ? snap.empRows
        .map(
          (r) =>
            `<tr><td class="pdf-td-nombre">${pdfEscPdf(r.nombre)}</td><td class="pdf-td-num">${$m(r.total)}</td><td class="pdf-td-num">${$m(r.com)}</td></tr>`
        )
        .join('')
    : '<tr><td colspan="3" class="pdf-td-empty">Sin registros de venta por empleada en el periodo.</td></tr>';
  const semRows = Array.isArray(snap.semRows) ? snap.semRows : [];
  const semHtml = semRows.length
    ? semRows
        .map(
          (r) =>
            `<tr><td>${pdfEscPdf(r.label)}</td><td class="pdf-td-sub">${pdfEscPdf(r.periodo)}</td><td class="pdf-td-num">${$m(r.monto)}</td></tr>`
        )
        .join('')
    : '';

  let distHtml = '';
  if (dist.ok && dist.d) {
    const d = dist.d;
    const filasTrasAhorro =
      numDuenos === 2
        ? `<tr><td>A distribuir entre dueños</td><td class="pdf-td-num">${$m(d.dis)}</td></tr>
          <tr><td>${pdfEscPdf(owner1)}</td><td class="pdf-td-num">${$m(d.xd)}</td></tr>
          <tr><td>${pdfEscPdf(owner2)}</td><td class="pdf-td-num">${$m(d.xd)}</td></tr>`
        : `<tr><td>${pdfEscPdf(owner1)}</td><td class="pdf-td-num">${$m(d.xd)}</td></tr>`;
    distHtml = `<section class="pdf-sec">
      <h2 class="pdf-sec-title pdf-serif">Distribución del remanente</h2>
      <table class="pdf-table pdf-dist-table">
        <tbody>
          <tr><td>Remanente bruto</td><td class="pdf-td-num">${$m(d.rem)}</td></tr>
          <tr><td>% al fondo de ahorro</td><td class="pdf-td-num">${d.pct}%</td></tr>
          <tr><td>Monto al fondo de ahorro</td><td class="pdf-td-num">${$m(d.amo)}</td></tr>
          ${filasTrasAhorro}
        </tbody>
      </table>
    </section>`;
  } else {
    distHtml = `<section class="pdf-sec">
      <h2 class="pdf-sec-title pdf-serif">Distribución del remanente</h2>
      <p class="pdf-note">Ejecute «Calcular cierre» en la aplicación (mismo mes) para incluir fondo de ahorro y reparto entre dueños.</p>
    </section>`;
  }

  const firmaIntro =
    numDuenos === 2
      ? 'Las firmantes declaran haber revisado la información del periodo y estar de acuerdo con las cifras presentadas.'
      : 'La firmante declara haber revisado la información del periodo y estar de acuerdo con las cifras presentadas.';
  const firmaBlock2 =
    numDuenos === 2
      ? `<div class="pdf-firma-col"><div class="pdf-firma-line"></div><p class="pdf-firma-lbl">${pdfEscPdf(owner2)}</p></div>`
      : '';
  const firmaGridStyle = numDuenos === 1 ? ' style="display:block;"' : '';
  const firmaCol1Style =
    numDuenos === 1
      ? ' style="display:block;width:100%;max-width:320px;margin:0 auto;padding:0;"'
      : '';
  const firmaHtml = `<section class="pdf-sec pdf-firma">
    <h2 class="pdf-sec-title pdf-serif">Firma de conformidad</h2>
    <p class="pdf-firma-intro">${pdfEscPdf(firmaIntro)}</p>
    <div class="pdf-firma-grid"${firmaGridStyle}>
      <div class="pdf-firma-col"${firmaCol1Style}><div class="pdf-firma-line"></div><p class="pdf-firma-lbl">${pdfEscPdf(owner1)}</p></div>
      ${firmaBlock2}
    </div>
  </section>`;

  const logoUrl = getPdfReportLogoDataUrl();
  const pdfLogoHtml = logoUrl
    ? `<div class="pdf-doc-logo-wrap"><img class="pdf-doc-logo" src="${logoUrl}" alt="" /></div>`
    : '';

  return `<header class="pdf-doc-header">
    <div class="pdf-doc-header-row">
      <div class="pdf-doc-header-text">
        <p class="pdf-kicker">REPORTE FINANCIERO</p>
        <h1 class="pdf-doc-title pdf-serif">${pdfEscPdf(empresa)}</h1>
        <p class="pdf-doc-sub">Mes evaluado: <strong>${pdfEscPdf(snap.periodoLabel)}</strong> · Emisión: ${pdfEscPdf(emit)}</p>
      </div>
      ${pdfLogoHtml}
    </div>
    </header>
    <section class="pdf-sec">
      <h2 class="pdf-sec-title pdf-serif">Estado de resultados</h2>
      <table class="pdf-table pdf-edo">
        <tbody>
          <tr><td>Ventas totales</td><td class="pdf-td-num">${$m(snap.tv)}</td></tr>
          <tr><td>(−) Comisiones empleadas</td><td class="pdf-td-num">${$m(snap.tc)}</td></tr>
          <tr><td>(−) Gastos fijos y operativos</td><td class="pdf-td-num">${$m(snap.tg)}</td></tr>
          <tr class="pdf-edo-total"><td><strong>GANANCIA NETA</strong></td><td class="pdf-td-num"><strong class="${negClass}">${$m(snap.gananciaNeta)}</strong></td></tr>
        </tbody>
      </table>
    </section>
    <section class="pdf-sec">
      <h2 class="pdf-sec-title pdf-serif">Desglose por semanas (venta bruta)</h2>
      <table class="pdf-table">
        <thead>
          <tr>
            <th>SEMANA</th>
            <th>PERIODO (DÍAS)</th>
            <th>TOTAL</th>
          </tr>
        </thead>
        <tbody>${semHtml || '<tr><td colspan="3" class="pdf-td-empty">Sin datos.</td></tr>'}</tbody>
      </table>
    </section>
    <section class="pdf-sec">
      <h2 class="pdf-sec-title pdf-serif">Rendimiento por empleada</h2>
      <table class="pdf-table">
        <thead>
          <tr>
            <th>EMPLEADA</th>
            <th>VENDIDO (BRUTO)</th>
            <th>COMISIÓN</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </section>
    <section class="pdf-sec">
      <h2 class="pdf-sec-title pdf-serif">Gastos del mes</h2>
      <table class="pdf-table"><tbody><tr><td>Total gastos</td><td class="pdf-td-num"><strong>${$m(snap.tg)}</strong></td></tr></tbody></table>
    </section>
    ${distHtml}
    ${firmaHtml}
    ${buildCierrePdfAnexoDiarioHtml(snap)}
    <footer class="pdf-footer">${pdfEscPdf(empresa)} · Documento generado electrónicamente · ${pdfEscPdf(emit)}</footer>`;
}

async function imprimirCierreReporte() {
  if (typeof html2pdf === 'undefined') {
    alert('No se cargó la librería de PDF (html2pdf.js). Comprueba tu conexión y recarga la página.');
    return;
  }
  try {
    await loadCierreResumenMes();
    if (!cierreMesSnapshot) {
      alert('No hay datos del mes para generar el PDF. Revisa el mes seleccionado o intenta de nuevo.');
      return;
    }
    const snap = cierreMesSnapshot;
    const distOk = cierreDistribForPdf && cierreDistribForPdf.monthKey === snap.monthKey;
    const distPayload = distOk ? { ok: true, d: cierreDistribForPdf } : { ok: false };
    const bodyHtml = buildCierrePdfHtml(snap, distPayload);
    const pdfStyles = `
      @page { size: A4; margin: 0; }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        background: #fff;
        color: #1b1b2f;
      }
      body {
        width: 794px;
        padding: 40px;
        font-family: "Segoe UI", Roboto, Arial, sans-serif;
        font-size: 10pt;
        line-height: 1.45;
      }
      .pdf-serif { font-family: Georgia, "Times New Roman", serif; }
      .pdf-doc-header {
        margin-bottom: 18px;
        padding-bottom: 14px;
        border-bottom: 1px solid #000;
      }
      .pdf-doc-header-row {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      .pdf-doc-header-text {
        flex: 1;
        min-width: 0;
      }
      .pdf-doc-logo-wrap {
        flex: 0 0 auto;
        width: max-content;
        max-width: 220px;
        margin: 0;
        padding: 0;
        line-height: 0;
      }
      .pdf-doc-logo {
        display: block;
        margin: 0;
        padding: 0;
        max-width: 220px;
        max-height: 108px;
        width: auto;
        height: auto;
        object-fit: contain;
      }
      .pdf-kicker {
        margin: 0 0 6px;
        font-size: 8pt;
        letter-spacing: .2em;
        text-transform: uppercase;
        color: #666;
      }
      .pdf-doc-title {
        margin: 0 0 8px;
        font-size: 22pt;
        font-weight: 700;
        color: #000;
        letter-spacing: -0.02em;
      }
      .pdf-doc-sub { margin: 0; font-size: 9.5pt; color: #444; }
      .pdf-sec { margin-bottom: 18px; break-inside: avoid; page-break-inside: avoid; }
      .pdf-sec.pdf-sec-anexo {
        break-inside: auto !important;
        page-break-inside: auto !important;
      }
      .pdf-sec-title {
        margin: 0 0 10px;
        font-size: 11pt;
        font-weight: 700;
        color: #000;
      }
      table {
        width: 100%;
        border-collapse: collapse !important;
        border-spacing: 0;
      }
      table thead th {
        background-color: #1b1b2f !important;
        color: #ffffff !important;
        font-weight: bold;
        padding: 10px;
        text-transform: uppercase;
        text-align: left;
        font-size: 12px;
      }
      table tbody td {
        padding: 10px;
        border-bottom: 1px solid #e0e0e0;
        background-color: #ffffff !important;
        color: #1b1b2f !important;
        text-align: left;
        font-size: 12px;
      }
      .pdf-edo-total td {
        background-color: #f7f7f7 !important;
        font-weight: bold;
        border-top: 2px solid #1b1b2f;
      }
      table tbody td.pdf-td-empty {
        text-align: left !important;
      }
      .pdf-td-num {
        font-variant-numeric: tabular-nums;
        text-align: right !important;
      }
      .pdf-td-nombre { font-weight: 600; }
      .pdf-td-sub { color: #555; font-size: 9pt; }
      .pdf-td-empty { color: #777; text-align: left !important; }
      .pdf-net-neg { color: #a30029; }
      .pdf-note {
        margin: 0;
        padding: 10px 0 10px 12px;
        font-size: 9pt;
        color: #555;
        border-left: 2px solid #000;
      }
      .pdf-dist-table td:first-child { width: 70%; }
      .pdf-firma-intro {
        margin: 0 0 16px;
        max-width: 520px;
        font-size: 9pt;
        color: #444;
      }
      .pdf-firma-grid {
        display: table;
        width: 100%;
        table-layout: fixed;
        margin-top: 8px;
      }
      .pdf-firma-col {
        display: table-cell;
        width: 50%;
        padding: 0 12px 0 0;
        vertical-align: bottom;
      }
      .pdf-firma-col:last-child { padding: 0 0 0 12px; }
      .pdf-firma-line { border-bottom: 1px solid #000; min-height: 36px; margin-bottom: 6px; }
      .pdf-firma-lbl { margin: 0; font-size: 9pt; color: #333; text-align: center; }
      .pdf-footer {
        margin-top: 24px;
        padding-top: 10px;
        border-top: 1px solid #ccc;
        font-size: 8pt;
        color: #666;
        text-align: center;
      }

      /* --- Anexo desglose diario: bloque aislado (no hereda conflicto de tablas del reporte) --- */
      .pdf-anexo-diario {
        box-sizing: border-box;
        width: calc(100% + 80px);
        max-width: none;
        margin-left: -40px;
        margin-right: -40px;
        padding: 0 40px 20px;
        font-family: "Segoe UI", Roboto, Arial, sans-serif;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .pdf-anexo-diario__title {
        margin: 0 0 14px;
        padding: 0 0 10px;
        font-size: 11.5pt;
        font-weight: 700;
        color: #0d1117;
        letter-spacing: -0.02em;
        border-bottom: 2px solid #0d1117;
      }
      .pdf-anexo-diario__table-wrap {
        width: 100%;
      }
      .pdf-anexo-diario__table {
        width: 100% !important;
        max-width: none !important;
        border-collapse: collapse !important;
        border-spacing: 0;
        table-layout: fixed;
        font-size: 9.5pt;
        line-height: 1.4;
      }
      .pdf-anexo-diario__col-fecha { width: 16%; }
      .pdf-anexo-diario__col-emp { width: 26%; }
      .pdf-anexo-diario__col-num { width: 19.333%; }
      .pdf-anexo-diario__table thead {
        display: table-header-group;
      }
      .pdf-anexo-diario__table tbody {
        display: table-row-group;
      }
      .pdf-anexo-diario__table tr.pdf-anexo-diario__row {
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .pdf-anexo-diario__table th,
      .pdf-anexo-diario__table td {
        box-sizing: border-box;
        vertical-align: middle !important;
        padding: 10px 12px !important;
        border: 1px solid #c5cad3 !important;
        text-align: left;
        font-weight: normal;
        color: #1b1b2f !important;
        background-color: #ffffff !important;
      }
      .pdf-anexo-diario__table thead th {
        background-color: #0d1117 !important;
        color: #ffffff !important;
        font-weight: 600 !important;
        font-size: 8.5pt !important;
        text-transform: none !important;
        letter-spacing: 0.02em;
        border-color: #0d1117 !important;
      }
      .pdf-anexo-diario__table tbody tr:nth-child(even) td {
        background-color: #d4dce6 !important;
        color: #1b1b2f !important;
      }
      .pdf-anexo-diario__table tbody tr:nth-child(odd) td {
        background-color: #ffffff !important;
      }
      .pdf-anexo-diario__table thead th:nth-child(1),
      .pdf-anexo-diario__table tbody td:nth-child(1) {
        text-align: center !important;
      }
      .pdf-anexo-diario__table thead th:nth-child(2),
      .pdf-anexo-diario__table tbody td:nth-child(2) {
        text-align: left !important;
      }
      .pdf-anexo-diario__table thead th:nth-child(n + 3),
      .pdf-anexo-diario__table tbody td:nth-child(n + 3) {
        text-align: center !important;
      }
      .pdf-anexo-diario__cell--num {
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .pdf-anexo-diario__empty {
        text-align: center !important;
        color: #5c6370 !important;
        background-color: #fafbfc !important;
        font-style: italic;
        padding: 18px 12px !important;
      }
    `;
    const htmlTemplate = `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reporte Financiero</title>
  <style>${pdfStyles}</style>
</head>
<body>${bodyHtml}</body>
</html>`;

    const mesNombre = (formatMonthLabel(snap.monthKey || '') || snap.monthKey || 'Mes').replace(/ /g, '_');
    const opt = {
      margin: [15, 15],
      filename: `Reporte_Estetica_${mesNombre}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 3,
        useCORS: true,
        letterRendering: true,
        logging: false,
      },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
    };
    await html2pdf().from(htmlTemplate).set(opt).save();
  } catch (e) {
    console.error('imprimirCierreReporte', e);
    alert('No se pudo generar el PDF: ' + (e.message || e));
  }
}

async function loadDash() {
  const td = today(),
    m = curMonth(),
    { start, end } = monthRange(m);
  try {
    const [snapH, snapM, snapG, docAho] = await Promise.all([
      db.collection('ventas').where('fecha', '==', td).get(),
      db.collection('ventas').where('fecha', '>=', start).where('fecha', '<=', end).orderBy('fecha', 'desc').get(),
      db.collection('gastos').where('fecha', '>=', start).where('fecha', '<=', end).get(),
      db.collection('ahorro').doc('main').get(),
    ]);
    let vHoy = 0;
    snapH.docs.forEach((d) => (vHoy += ventaBrutaDesdeVenta(d.data())));
    document.getElementById('s-vhoy').textContent = $m(vHoy);
    let vMes = 0,
      comMes = 0,
      utMes = 0;
    snapM.docs.forEach((d) => {
      const v = d.data();
      vMes += ventaBrutaDesdeVenta(v);
      comMes += comisionDesdeVenta(v);
      utMes += utilidadNegocioDesdeVenta(v);
    });
    document.getElementById('s-vmes').textContent = $m(vMes);
    document.getElementById('d-vb').textContent = $m(vMes);
    document.getElementById('d-com').textContent = $m(comMes);
    document.getElementById('d-util').textContent = $m(utMes);
    document.getElementById('d-emp').textContent = emps.length;
    let gMes = 0;
    snapG.docs.forEach((d) => (gMes += d.data().monto || 0));
    document.getElementById('s-gmes').textContent = $m(gMes);
    const saldo = docAho.exists ? docAho.data().saldoActual || 0 : 0;
    document.getElementById('s-aho').textContent = $m(saldo);
    const tb = document.getElementById('tb-dash-ventas');
    const recent = snapM.docs.slice(0, 7);
    if (!recent.length) tb.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text2)">Sin ventas este mes.</td></tr>';
    else
      tb.innerHTML = recent
        .map((d) => {
          const v = d.data(),
            e = emps.find((x) => x.id === v.idEmpleado);
          const tnom = v.turnoNombre || nombreTurnoPorId(v.turnoId) || '—';
          return `<tr><td>${v.servicio}</td><td>${e?.nombre || '—'}</td><td>${tnom}</td><td><strong>${$m(ventaBrutaDesdeVenta(v))}</strong></td><td>${v.fecha}</td></tr>`;
        })
        .join('');
  } catch (e) {
    console.error('dash', e);
  }
}

async function calcCierre() {
  const selM = document.getElementById('cj-m');
  let m = normalizeMonthYYYYMM(selM?.value) || curMonth();
  if (selM && selM.value !== m) selM.value = m;
  const pct = parseFloat(document.getElementById('cj-pct').value) || 0;
  const ndRaw = parseInt(document.getElementById('cj-num-duenos')?.value, 10);
  const numDuenos = ndRaw === 1 ? 1 : 2;
  const { start, end } = monthRange(m);
  try {
    const [snapV, snapG] = await Promise.all([
      db.collection('ventas').where('fecha', '>=', start).where('fecha', '<=', end).get(),
      db.collection('gastos').where('fecha', '>=', start).where('fecha', '<=', end).get(),
    ]);
    let tv = 0,
      tc = 0,
      tu = 0;
    snapV.docs.forEach((d) => {
      const v = d.data();
      tv += ventaBrutaDesdeVenta(v);
      tc += comisionDesdeVenta(v);
      tu += utilidadNegocioDesdeVenta(v);
    });
    const ventas = snapV.docs.map((doc) => {
      const v = doc.data();
      const emp = emps.find((x) => x.id === v.idEmpleado);
      return { ...v, empleadaNombre: emp?.nombre || '—' };
    });
    let tg = 0;
    snapG.docs.forEach((d) => (tg += d.data().monto || 0));
    const rem = tu - tg,
      amo = (rem * pct) / 100,
      dis = rem - amo,
      xd = dis / numDuenos;
    cierreData = { tv, tc, tg, rem, amo, dis, xd, pct, numDuenos, monthKey: m, ventas };
    cierreDistribForPdf = { monthKey: m, pct, tv, tc, tg, rem, amo, dis, xd, numDuenos };
    document.getElementById('cj-v').textContent = $m(tv);
    document.getElementById('cj-c').textContent = $m(tc);
    document.getElementById('cj-g').textContent = $m(tg);
    document.getElementById('cj-rem').textContent = $m(rem);
    document.getElementById('cj-apct').textContent = pct;
    document.getElementById('cj-amo').textContent = $m(amo);
    document.getElementById('cj-dis').textContent = $m(dis);
    document.getElementById('cj-d1').textContent = $m(xd);
    document.getElementById('cj-d2').textContent = $m(xd);
    const rowD2 = document.getElementById('row-cj-d2');
    if (rowD2) rowD2.style.display = numDuenos === 2 ? '' : 'none';
    document.getElementById('cj-apply').style.display = pct > 0 ? 'flex' : 'none';
  } catch (e) {
    alert('Error al calcular cierre: ' + e.message);
  }
}
async function aplicarCierre() {
  if (!cierreData || cierreData.amo <= 0) return;
  if (!confirm(`¿Enviar ${$m(cierreData.amo)} al fondo de ahorro?`)) return;
  try {
    const ref = db.collection('ahorro').doc('main');
    const doc = await ref.get();
    let saldo = doc.exists ? doc.data().saldoActual || 0 : 0,
      hist = doc.exists ? doc.data().historial || [] : [];
    saldo += cierreData.amo;
    hist.push({ fecha: today(), monto: cierreData.amo, tipo: 'entrada', motivo: 'Cierre de caja automático' });
    await ref.set({ saldoActual: saldo, historial: hist });
    alert(`✅ ${$m(cierreData.amo)} enviados al fondo de ahorro.`);
    document.getElementById('cj-apply').style.display = 'none';
    cierreData = null;
  } catch (e) {
    alert('Error: ' + e.message);
  }
}
