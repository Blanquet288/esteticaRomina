var auth = globalThis.auth;
var db = globalThis.db;
var firebase = globalThis.firebase;

/* ════ STATE ════ */
let sbCol=false, curSec='dashboard', emps=[], cats=[], cfg={}, cierreData=null, repTab='ventas';
let chVentas=null, chGastos=null, chSvcs=null;

/* ════ AUTH ════ */
auth.onAuthStateChanged(u => {
  if(u){
    document.getElementById('login-screen').style.display='none';
    document.getElementById('app').classList.add('active');
    document.getElementById('sb-uemail').textContent=u.email;
    document.getElementById('sb-av').textContent=u.email[0].toUpperCase();
    document.getElementById('sb-uname').textContent=u.displayName||u.email.split('@')[0];
    initApp();
  } else {
    document.getElementById('login-screen').style.display='flex';
    document.getElementById('app').classList.remove('active');
  }
});
async function doLogin(){
  const e=document.getElementById('li-email').value.trim(), p=document.getElementById('li-pass').value;
  const err=document.getElementById('li-err'), btn=document.getElementById('btn-li');
  err.textContent=''; btn.textContent='Iniciando…'; btn.disabled=true;
  try{ await auth.signInWithEmailAndPassword(e,p); }
  catch(ex){ err.textContent='Correo o contraseña incorrectos.'; btn.textContent='Iniciar Sesión'; btn.disabled=false; }
}
document.getElementById('li-pass').addEventListener('keydown',e=>{ if(e.key==='Enter') doLogin(); });
async function doLogout(){ await auth.signOut(); }

/* ════ INIT ════ */
async function initApp(){
  updateDate(); setInterval(updateDate,60000);
  fillMonths();
  await loadCfg();
  await loadEmpsCache();
  await loadCatsCache();
  loadDash();
  document.getElementById('v-fecha').value=today();
  document.getElementById('g-fecha').value=today();
  document.getElementById('bk-fecha').value=today();
  initBulk();
}
function updateDate(){ document.getElementById('tb-date').textContent=new Date().toLocaleDateString('es-MX',{weekday:'long',year:'numeric',month:'long',day:'numeric'}); }
const today=()=>new Date().toISOString().split('T')[0];
const curMonth=()=>{ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
function monthRange(m){ const [y,mo]=m.split('-'); const ld=new Date(+y,+mo,0).getDate(); return {start:`${y}-${mo}-01`,end:`${y}-${mo}-${String(ld).padStart(2,'0')}`}; }
function fillMonths(){
  const ids=['v-mf','g-mf','rep-m','cj-m']; const months=[];
  for(let i=0;i<13;i++){ const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-i);
    months.push({val:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,lbl:d.toLocaleDateString('es-MX',{month:'long',year:'numeric'})}); }
  ids.forEach(id=>{ const s=document.getElementById(id); if(!s)return; months.forEach((m,i)=>{ const o=document.createElement('option'); o.value=m.val; o.textContent=m.lbl; if(i===0)o.selected=true; s.appendChild(o); }); });
}
const $m=n=>'$'+parseFloat(n||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});
function showAl(el,type,msg){ el.innerHTML=`<div class="al al-${type}">${msg}</div>`; setTimeout(()=>{ el.innerHTML=''; },4500); }
function openMo(id){ document.getElementById(id).classList.add('open'); }
function closeMo(id){ document.getElementById(id).classList.remove('open'); }

/* ════ SIDEBAR ════ */
function toggleSB(){
  sbCol=!sbCol;
  document.getElementById('sb').classList.toggle('col',sbCol);
  document.getElementById('main').classList.toggle('col',sbCol);
  document.getElementById('sb-tog').textContent=sbCol?'›':'‹';
}

/* ════ NAV ════ */
const pageMap={
  dashboard:['Dashboard','Vista general del negocio'],
  ventas:['Venta Rápida','Registra un servicio individual'],
  masiva:['Corte por Empleada','Captura múltiples servicios de un día'],
  gastos:['Gastos','Control de egresos del negocio'],
  catalogo:['Catálogo de Servicios','Precios y comisiones por defecto'],
  empleados:['Empleadas','Gestión de personal'],
  ahorros:['Fondo de Ahorros','Control del ahorro empresarial'],
  reportes:['Reportes y Estadísticas','Análisis de desempeño mensual'],
  cierre:['Cierre de Caja','Cálculo de ganancias y distribución'],
  config:['Configuración','Ajustes del sistema'],
};
function go(sec){
  document.querySelectorAll('.nav-it').forEach(el=>el.classList.remove('on'));
  document.querySelectorAll('.pg').forEach(el=>el.classList.remove('on'));
  document.querySelector(`[data-s="${sec}"]`)?.classList.add('on');
  document.getElementById(`pg-${sec}`)?.classList.add('on');
  curSec=sec;
  const [t,s]=pageMap[sec]||['—','—'];
  document.getElementById('tb-title').textContent=t;
  document.getElementById('tb-sub').textContent=s;
  if(sec==='dashboard') loadDash();
  else if(sec==='ventas'){ loadEmpsSelect('v-emp'); loadCatSelect('v-serv-sel'); if(typeof syncVentaRapidaComisionUi==='function')syncVentaRapidaComisionUi(); document.getElementById('v-hist-card').style.display='none'; }
  else if(sec==='masiva'){ loadEmpsSelect('bk-emp'); rebuildBulkSelects(); }
  else if(sec==='gastos') loadGastos();
  else if(sec==='catalogo') loadCatalogo();
  else if(sec==='empleados') loadEmps();
  else if(sec==='ahorros') loadAhorros();
  else if(sec==='reportes') loadReportes();
}

/* ════ CONFIG ════ */
async function loadCfg(){
  try{ const doc=await db.collection('config').doc('main').get(); if(doc.exists){ cfg=doc.data(); document.getElementById('cfg-nom').value=cfg.nombreEmpresa||''; document.getElementById('cfg-tkt').value=cfg.ticketMensaje||''; } } catch(e){}
}
async function saveConfig(){
  const al=document.getElementById('cfg-al');
  const data={nombreEmpresa:document.getElementById('cfg-nom').value.trim()||'Estética Romina',ticketMensaje:document.getElementById('cfg-tkt').value.trim()||'¡Gracias por tu preferencia!'};
  try{ await db.collection('config').doc('main').set(data,{merge:true}); cfg={...cfg,...data}; showAl(al,'ok','✅ Configuración guardada.'); } catch(e){ showAl(al,'bad','❌ Error: '+e.message); }
}

/* ════ CATÁLOGO ════ */
async function loadCatsCache(){
  try{ const snap=await db.collection('catalogo').orderBy('nombre').get(); cats=snap.docs.map(d=>({id:d.id,...d.data()})); } catch(e){ cats=[]; }
}
function syncCatComisionUi(){
  const tipoEl=document.getElementById('cat-tipo-comision'), lbl=document.getElementById('cat-com-lbl'), inp=document.getElementById('cat-com');
  if(!tipoEl||!lbl||!inp)return;
  const tipo=normalizarTipoComisionServicio(tipoEl.value);
  if(tipo==='monto_fijo'){ lbl.textContent='Monto fijo de comisión ($)'; inp.removeAttribute('max'); inp.setAttribute('min','0'); inp.setAttribute('step','0.01'); inp.placeholder='Ej: 50.00'; }
  else{ lbl.textContent='Valor comisión (%)'; inp.setAttribute('min','0'); inp.setAttribute('max','100'); inp.setAttribute('step','0.01'); inp.placeholder='Ej: 25'; }
}
async function loadCatalogo(){
  await loadCatsCache();
  const wrap=document.getElementById('cat-grid-wrap');
  if(!cats.length){
    wrap.innerHTML='<div class="empty"><div class="empty-ico">🗂️</div><p>No hay servicios en el catálogo. Agrega el primero.</p></div>'; return;
  }
  wrap.innerHTML=`<div class="cat-grid">${cats.map(c=>`
    <div class="cat-card">
      ${c.categoria?`<div style="font-size:10.5px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:5px">${c.categoria}</div>`:''}
      <div class="cat-nm">${c.nombre}</div>
      <div class="cat-pr">${$m(c.precioBase)}</div>
      <div class="cat-com">${typeof textoComisionCatalogoResumido==='function'?textoComisionCatalogoResumido(c):('Comisión: '+(c.comisionDefecto||0)+'%')}</div>
      <div class="cat-actions">
        <button class="btn btn-s btn-sm" onclick='editCat(${JSON.stringify(c)})'>✏️ Editar</button>
        <button class="btn btn-bad btn-sm" onclick="delCat('${c.id}')">🗑️</button>
      </div>
    </div>
  `).join('')}</div>`;
}
function openCatModal(){
  ['cat-nom','cat-precio','cat-com','cat-cat','cat-id'].forEach(id=>document.getElementById(id).value='');
  const ts=document.getElementById('cat-tipo-comision'); if(ts)ts.value='porcentaje'; syncCatComisionUi();
  document.getElementById('mo-cat-ttl').textContent='Nuevo Servicio';
  openMo('mo-cat');
}
function editCat(c){
  document.getElementById('cat-nom').value=c.nombre||'';
  document.getElementById('cat-precio').value=c.precioBase||'';
  document.getElementById('cat-com').value=c.comisionDefecto||'';
  document.getElementById('cat-cat').value=c.categoria||'';
  document.getElementById('cat-id').value=c.id;
  const ts=document.getElementById('cat-tipo-comision'); if(ts)ts.value=normalizarTipoComisionServicio(c.tipoComision);
  syncCatComisionUi();
  document.getElementById('mo-cat-ttl').textContent='Editar Servicio';
  openMo('mo-cat');
}
async function saveCat(){
  const nombre=document.getElementById('cat-nom').value.trim();
  const precio=parseFloat(document.getElementById('cat-precio').value)||0;
  const com=parseFloat(document.getElementById('cat-com').value)||0;
  const tipoComision=normalizarTipoComisionServicio(document.getElementById('cat-tipo-comision')?.value);
  const cat=document.getElementById('cat-cat').value.trim();
  const cid=document.getElementById('cat-id').value;
  if(!nombre){ alert('Ingresa el nombre del servicio.'); return; }
  if(tipoComision==='porcentaje'&&(com<0||com>100)){ alert('El porcentaje de comisión debe estar entre 0 y 100.'); return; }
  if(tipoComision==='monto_fijo'&&com<0){ alert('El monto fijo de comisión no puede ser negativo.'); return; }
  const data={nombre,precioBase:precio,comisionDefecto:com,tipoComision,categoria:cat};
  try{
    if(cid) await db.collection('catalogo').doc(cid).update(data);
    else     await db.collection('catalogo').add(data);
    closeMo('mo-cat');
    await loadCatsCache();
    loadCatalogo();
    // Refresh dropdowns if on those pages
    loadCatSelect('v-serv-sel');
    rebuildBulkSelects();
  } catch(e){ alert('Error: '+e.message); }
}
async function delCat(id){
  if(!confirm('¿Eliminar este servicio del catálogo?')) return;
  await db.collection('catalogo').doc(id).delete();
  await loadCatsCache(); loadCatalogo();
}

/* ════ EMPLEADAS ════ */
async function loadEmpsCache(){
  try{ const snap=await db.collection('empleados').orderBy('nombre').get(); emps=snap.docs.map(d=>({id:d.id,...d.data()})); } catch(e){ emps=[]; }
}
async function loadEmps(){
  await loadEmpsCache();
  const tb=document.getElementById('tb-emps');
  if(!emps.length){ tb.innerHTML='<tr><td colspan="4"><div class="empty"><div class="empty-ico">👩‍💼</div><p>No hay empleadas registradas.</p></div></td></tr>'; return; }
  tb.innerHTML=emps.map(e=>`
    <tr>
      <td><strong>${e.nombre}</strong></td>
      <td><span class="bdg bdg-info">${e.rol||'—'}</span></td>
      <td>${e.comisionDefecto||0}%</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-s btn-sm" onclick='editEmp(${JSON.stringify(e)})'>✏️ Editar</button>
        <button class="btn btn-bad btn-sm" onclick="delEmp('${e.id}')">🗑️</button>
      </td>
    </tr>`).join('');
}
function openEmpModal(){
  ['em-nom','em-com','em-id'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('em-rol').value='Estilista';
  document.getElementById('mo-emp-ttl').textContent='Nueva Empleada';
  openMo('mo-emp');
}
function editEmp(e){
  document.getElementById('em-nom').value=e.nombre;
  document.getElementById('em-rol').value=e.rol||'Estilista';
  document.getElementById('em-com').value=e.comisionDefecto||0;
  document.getElementById('em-id').value=e.id;
  document.getElementById('mo-emp-ttl').textContent='Editar Empleada';
  openMo('mo-emp');
}
async function saveEmp(){
  const nombre=document.getElementById('em-nom').value.trim(),
        rol=document.getElementById('em-rol').value,
        com=parseFloat(document.getElementById('em-com').value)||0,
        eid=document.getElementById('em-id').value;
  if(!nombre){ alert('Ingresa el nombre.'); return; }
  try{
    if(eid) await db.collection('empleados').doc(eid).update({nombre,rol,comisionDefecto:com});
    else     await db.collection('empleados').add({nombre,rol,comisionDefecto:com});
    closeMo('mo-emp'); await loadEmpsCache(); loadEmps();
  } catch(e){ alert('Error: '+e.message); }
}
async function delEmp(id){
  if(!confirm('¿Eliminar esta empleada?')) return;
  await db.collection('empleados').doc(id).delete();
  await loadEmpsCache(); loadEmps();
}
function loadEmpsSelect(selId){
  const sel=document.getElementById(selId);
  sel.innerHTML='<option value="">Seleccionar…</option>';
  emps.forEach(e=>{ const o=document.createElement('option'); o.value=e.id; o.textContent=e.nombre; sel.appendChild(o); });
}
function loadCatSelect(selId){
  const sel=document.getElementById(selId);
  sel.innerHTML='<option value="">Seleccionar servicio…</option>';
  cats.forEach(c=>{ const o=document.createElement('option'); o.value=c.id; o.textContent=c.nombre+(c.categoria?` (${c.categoria})`:''); o.dataset.precio=c.precioBase||0; o.dataset.com=c.comisionDefecto||0; o.dataset.tipoComision=normalizarTipoComisionServicio(c.tipoComision); o.dataset.nombre=c.nombre; sel.appendChild(o); });
}

/* ════ VENTA RÁPIDA ════ */
function syncVentaRapidaComisionUi(){
  const sel=document.getElementById('v-serv-sel'), lbl=document.getElementById('v-cpct-lbl'), inp=document.getElementById('v-cpct');
  if(!lbl||!inp)return;
  const opt=sel?.options?.[sel?.selectedIndex];
  const tipo=opt&&opt.value?normalizarTipoComisionServicio(opt.dataset.tipoComision):'porcentaje';
  if(tipo==='monto_fijo'){ lbl.innerHTML='Comisión fija ($) <small style="color:var(--text3)">(editable)</small>'; inp.removeAttribute('max'); inp.setAttribute('min','0'); inp.setAttribute('step','0.01'); }
  else{ lbl.innerHTML='% Comisión <small style="color:var(--text3)">(editable)</small>'; inp.setAttribute('min','0'); inp.setAttribute('max','100'); inp.setAttribute('step','1'); }
}
function onVentaServChange(){
  const sel=document.getElementById('v-serv-sel');
  const opt=sel.options[sel.selectedIndex];
  if(!opt||!opt.value) return;
  document.getElementById('v-monto').value=parseFloat(opt.dataset.precio||0).toFixed(2);
  document.getElementById('v-cpct').value=opt.dataset.com||0;
  syncVentaRapidaComisionUi();
  calcCom();
}
function calcCom(){
  const m=parseFloat(document.getElementById('v-monto').value)||0;
  const sel=document.getElementById('v-serv-sel');
  const opt=sel?.options?.[sel?.selectedIndex];
  const tipo=opt&&opt.value?normalizarTipoComisionServicio(opt.dataset.tipoComision):'porcentaje';
  const val=parseFloat(document.getElementById('v-cpct').value)||0;
  const com=comisionMontoDesdePrecioYValor(m,val,tipo);
  document.getElementById('v-cmonto').value=com.toFixed(2);
  document.getElementById('v-util').value=(m-com).toFixed(2);
}
async function regVenta(){
  const al=document.getElementById('v-alert');
  const fecha=document.getElementById('v-fecha').value;
  const eid=document.getElementById('v-emp').value;
  const servSel=document.getElementById('v-serv-sel');
  const catId=servSel.value;
  const opt=servSel.options[servSel.selectedIndex];
  const servNom=opt?.dataset?.nombre||'';
  const tipoComision=opt?normalizarTipoComisionServicio(opt.dataset.tipoComision):'porcentaje';
  const valorCom=parseFloat(document.getElementById('v-cpct').value)||0;
  const monto=parseFloat(document.getElementById('v-monto').value);
  const comM=comisionMontoDesdePrecioYValor(monto,valorCom,tipoComision);
  const pct=comisionPctParaGuardarEnVenta(monto,comM,tipoComision,valorCom);
  const util=Math.round((monto-comM)*100)/100;
  if(!fecha||!eid||!catId||!monto){ showAl(al,'bad','❌ Completa todos los campos, incluye el servicio.'); return; }
  const emp=emps.find(e=>e.id===eid);
  try{
    await db.collection('ventas').add({
      fecha, idEmpleado:eid, servicio:servNom, idServicio:catId,
      monto, comisionTipo:tipoComision, comisionPct:pct, comisionMonto:comM, utilidadNegocio:util,
      ts:firebase.firestore.FieldValue.serverTimestamp()
    });
    showAl(al,'ok','✅ Venta registrada correctamente.');
    buildTicket({fecha,emp:emp?.nombre||'—',serv:servNom,monto,comM,util});
    ['v-monto','v-cmonto','v-util'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('v-serv-sel').value='';
    document.getElementById('v-cpct').value='';
  } catch(e){ showAl(al,'bad','❌ Error: '+e.message); }
}
function buildTicket(d){
  const empresa=cfg.nombreEmpresa||'Estética Romina';
  const msg=cfg.ticketMensaje||'¡Gracias por tu preferencia!';
  const fLeg=new Date(d.fecha+'T12:00:00').toLocaleDateString('es-MX',{day:'2-digit',month:'long',year:'numeric'});
  const hora=new Date().toLocaleTimeString('es-MX',{hour:'2-digit',minute:'2-digit'});
  const html=`<div class="ticket-wrap">
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
  document.getElementById('tkt-preview').innerHTML=html;
  document.getElementById('tkt-card').style.display='block';
  document.getElementById('tkt-print').innerHTML=`<div style="text-align:center;font-weight:bold;font-size:15px">${empresa}</div>
    <div style="text-align:center;font-size:11px">Recibo de Servicio</div>
    <div>--------------------------------</div>
    <div>Fecha: ${fLeg}</div><div>Hora: ${hora}</div><div>Atendió: ${d.emp}</div>
    <div>--------------------------------</div><div>Servicio: ${d.serv}</div>
    <div>--------------------------------</div>
    <div style="display:flex;justify-content:space-between;font-weight:bold"><span>TOTAL:</span><span>${$m(d.monto)}</span></div>
    <div>--------------------------------</div><div style="text-align:center;font-size:11px">${msg}</div>`;
}
function toggleHist(){
  const card=document.getElementById('v-hist-card');
  const vis=card.style.display!=='none'&&card.style.display!=='';
  card.style.display=vis?'none':'block';
  if(!vis) loadVHist();
}
async function loadVHist(){
  const m=document.getElementById('v-mf').value;
  const {start,end}=monthRange(m);
  const tb=document.getElementById('tb-v-hist');
  tb.innerHTML='<tr><td colspan="7" style="text-align:center">Cargando…</td></tr>';
  try{
    const snap=await db.collection('ventas').where('fecha','>=',start).where('fecha','<=',end).orderBy('fecha','desc').get();
    if(snap.empty){ tb.innerHTML='<tr><td colspan="7" style="text-align:center;color:var(--text2)">Sin ventas en este periodo.</td></tr>'; return; }
    tb.innerHTML=snap.docs.map(d=>{
      const v=d.data(), em=emps.find(e=>e.id===v.idEmpleado);
      return `<tr>
        <td>${v.fecha}</td><td>${em?.nombre||'—'}</td><td>${v.servicio}</td>
        <td><strong>${$m(v.monto)}</strong></td>
        <td style="color:var(--warn)">${$m(v.comisionMonto)}</td>
        <td><span class="bdg bdg-info">${typeof etiquetaVentaHistorialComisionPct==='function'?etiquetaVentaHistorialComisionPct(v):(v.comisionPct||0)+'%'}</span></td>
        <td style="color:var(--ok)">${$m(v.utilidadNegocio)}</td>
      </tr>`;
    }).join('');
  } catch(e){ tb.innerHTML=`<tr><td colspan="7">Error: ${e.message}</td></tr>`; }
}

/* ════ VENTA MASIVA (BULK) ════ */
let bulkRows=[];
function initBulk(){ bulkRows=[]; renderBulkRows(); addBulkRow(); }

function buildCatOptions(selectedId=''){
  return '<option value="">Seleccionar servicio…</option>'+cats.map(c=>`<option value="${c.id}" data-precio="${c.precioBase||0}" data-com="${c.comisionDefecto||0}" data-tipo-comision="${normalizarTipoComisionServicio(c.tipoComision)}" data-nombre="${c.nombre}" ${c.id===selectedId?'selected':''}>${c.nombre}${c.categoria?' ('+c.categoria+')':''}</option>`).join('');
}

function addBulkRow(){
  const id=Date.now();
  bulkRows.push({id,catId:'',nombre:'',cantidad:1,precio:0,comPct:0,comTipo:'porcentaje',subtotal:0,comMonto:0});
  renderBulkRows();
}

function renderBulkRows(){
  const tbody=document.getElementById('bulk-rows');
  if(!bulkRows.length){
    tbody.innerHTML=`<tr><td colspan="7" style="text-align:center;color:var(--text2);padding:22px">Agrega al menos una línea de servicio.</td></tr>`;
    updateBulkTotals(); return;
  }
  tbody.innerHTML=bulkRows.map(r=>`
    <tr class="bulk-row" id="brow-${r.id}">
      <td><select onchange="onBulkServChange(${r.id},this)">${buildCatOptions(r.catId)}</select></td>
      <td><input type="number" value="${r.cantidad}" min="1" step="1" onchange="onBulkQtyChange(${r.id},this)" oninput="onBulkQtyChange(${r.id},this)"></td>
      <td><input type="number" value="${r.precio||''}" placeholder="0.00" step="0.01" onchange="onBulkPriceChange(${r.id},this)" oninput="onBulkPriceChange(${r.id},this)"></td>
      <td><input type="number" value="${r.comPct||''}" placeholder="0" step="1" onchange="onBulkComChange(${r.id},this)" oninput="onBulkComChange(${r.id},this)"></td>
      <td><input type="number" value="${r.subtotal?r.subtotal.toFixed(2):''}" readonly></td>
      <td><input type="number" value="${r.comMonto?r.comMonto.toFixed(2):''}" readonly></td>
      <td><button class="btn-icon del" onclick="removeBulkRow(${r.id})">🗑️</button></td>
    </tr>`).join('');
  updateBulkTotals();
}

function onBulkServChange(id, sel){
  const opt=sel.options[sel.selectedIndex];
  const r=bulkRows.find(x=>x.id===id); if(!r) return;
  r.catId=opt.value||'';
  r.nombre=opt.dataset.nombre||'';
  r.precio=parseFloat(opt.dataset.precio||0);
  r.comPct=parseFloat(opt.dataset.com||0);
  r.comTipo=normalizarTipoComisionServicio(opt.dataset.tipoComision);
  calcBulkRow(r);
  // Update inputs in the same row
  const tr=document.getElementById(`brow-${id}`);
  tr.querySelectorAll('input')[1].value=r.precio.toFixed(2);
  tr.querySelectorAll('input')[2].value=r.comPct;
  tr.querySelectorAll('input')[3].value=r.subtotal.toFixed(2);
  tr.querySelectorAll('input')[4].value=r.comMonto.toFixed(2);
  updateBulkTotals();
}
function onBulkQtyChange(id,inp){ const r=bulkRows.find(x=>x.id===id); if(!r)return; r.cantidad=Math.max(1,parseInt(inp.value)||1); calcBulkRow(r); refreshBulkReadonly(id,r); updateBulkTotals(); }
function onBulkPriceChange(id,inp){ const r=bulkRows.find(x=>x.id===id); if(!r)return; r.precio=parseFloat(inp.value)||0; calcBulkRow(r); refreshBulkReadonly(id,r); updateBulkTotals(); }
function onBulkComChange(id,inp){ const r=bulkRows.find(x=>x.id===id); if(!r)return; r.comPct=parseFloat(inp.value)||0; calcBulkRow(r); refreshBulkReadonly(id,r); updateBulkTotals(); }

function calcBulkRow(r){ r.subtotal=r.cantidad*r.precio; r.comMonto=comisionMontoDesdePrecioYValor(r.subtotal,r.comPct,r.comTipo||'porcentaje'); }
function refreshBulkReadonly(id,r){
  const tr=document.getElementById(`brow-${id}`); if(!tr)return;
  const ins=tr.querySelectorAll('input');
  ins[3].value=r.subtotal.toFixed(2);
  ins[4].value=r.comMonto.toFixed(2);
}
function removeBulkRow(id){ bulkRows=bulkRows.filter(r=>r.id!==id); renderBulkRows(); }
function clearBulk(){ if(!confirm('¿Limpiar todas las líneas?'))return; bulkRows=[]; renderBulkRows(); addBulkRow(); document.getElementById('bk-emp').value=''; }
function updateBulkTotals(){
  let total=0, comTot=0;
  bulkRows.forEach(r=>{ total+=r.subtotal||0; comTot+=r.comMonto||0; });
  const util=total-comTot;
  document.getElementById('bk-nrows').textContent=bulkRows.filter(r=>r.catId).length;
  document.getElementById('bk-total').textContent=$m(total);
  document.getElementById('bk-comtot').textContent=$m(comTot);
  document.getElementById('bk-util').textContent=$m(util);
}
function rebuildBulkSelects(){
  bulkRows.forEach(r=>{}); renderBulkRows();
}

async function saveBulk(){
  const al=document.getElementById('bk-alert');
  const fecha=document.getElementById('bk-fecha').value;
  const eid=document.getElementById('bk-emp').value;
  const validRows=bulkRows.filter(r=>r.catId&&r.precio>0);
  if(!fecha||!eid){ showAl(al,'bad','❌ Selecciona la fecha y la empleada.'); return; }
  if(!validRows.length){ showAl(al,'bad','❌ Agrega al menos una línea de servicio con precio.'); return; }

  const emp=emps.find(e=>e.id===eid);
  const batch=db.batch();
  validRows.forEach(r=>{
    const ref=db.collection('ventas').doc();
    const tipoCom=normalizarTipoComisionServicio(r.comTipo);
    const pct=comisionPctParaGuardarEnVenta(r.subtotal,r.comMonto,tipoCom,r.comPct);
    batch.set(ref,{
      fecha, idEmpleado:eid, servicio:r.nombre, idServicio:r.catId,
      cantidad:r.cantidad, monto:r.subtotal, comisionTipo:tipoCom, comisionPct:pct,
      comisionMonto:r.comMonto, utilidadNegocio:r.subtotal-r.comMonto,
      ts:firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  try{
    await batch.commit();
    let tot=0, com=0;
    validRows.forEach(r=>{ tot+=r.subtotal; com+=r.comMonto; });
    showAl(al,'ok',`✅ ${validRows.length} ventas guardadas. Total: ${$m(tot)} | Comisión ${emp?.nombre||''}: ${$m(com)}`);
    bulkRows=[]; renderBulkRows(); addBulkRow();
    document.getElementById('bk-emp').value='';
  } catch(e){ showAl(al,'bad','❌ Error: '+e.message); }
}

/* ════ GASTOS ════ */
async function regGasto(){
  const al=document.getElementById('g-alert');
  const fecha=document.getElementById('g-fecha').value, cat=document.getElementById('g-cat').value;
  const conc=document.getElementById('g-concepto').value.trim(), monto=parseFloat(document.getElementById('g-monto').value);
  if(!fecha||!conc||!monto){ showAl(al,'bad','❌ Completa todos los campos.'); return; }
  try{
    await db.collection('gastos').add({fecha,concepto:conc,monto,categoria:cat});
    showAl(al,'ok','✅ Gasto registrado.'); document.getElementById('g-concepto').value=''; document.getElementById('g-monto').value=''; loadGastos();
  } catch(e){ showAl(al,'bad','❌ Error: '+e.message); }
}
async function loadGastos(){
  const m=document.getElementById('g-mf').value;
  const {start,end}=monthRange(m);
  const tb=document.getElementById('tb-gastos');
  tb.innerHTML='<tr><td colspan="5" style="text-align:center">Cargando…</td></tr>';
  try{
    const snap=await db.collection('gastos').where('fecha','>=',start).where('fecha','<=',end).orderBy('fecha','desc').get();
    let fijo=0,op=0;
    snap.docs.forEach(d=>{ const g=d.data(); if(g.categoria==='Fijo')fijo+=g.monto; else op+=g.monto; });
    document.getElementById('gs-fijo').textContent=$m(fijo);
    document.getElementById('gs-op').textContent=$m(op);
    document.getElementById('gs-tot').textContent=$m(fijo+op);
    if(snap.empty){ tb.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text2)">Sin gastos en este periodo.</td></tr>'; return; }
    tb.innerHTML=snap.docs.map(d=>{
      const g=d.data(); const bc=g.categoria==='Fijo'?'bdg-fijo':'bdg-op';
      return `<tr><td>${g.fecha}</td><td>${g.concepto}</td><td><span class="bdg ${bc}">${g.categoria}</span></td><td><strong>${$m(g.monto)}</strong></td><td><button class="btn btn-bad btn-sm" onclick="delGasto('${d.id}')">🗑️</button></td></tr>`;
    }).join('');
  } catch(e){ tb.innerHTML=`<tr><td colspan="5">Error: ${e.message}</td></tr>`; }
}
async function delGasto(id){ if(!confirm('¿Eliminar?'))return; await db.collection('gastos').doc(id).delete(); loadGastos(); }

/* ════ AHORROS ════ */
async function loadAhorros(){
  try{
    const doc=await db.collection('ahorro').doc('main').get();
    const data=doc.exists?doc.data():{saldoActual:0,historial:[]};
    document.getElementById('sav-amt').textContent=$m(data.saldoActual||0);
    document.getElementById('s-aho').textContent=$m(data.saldoActual||0);
    renderAhoHist(data.historial||[]);
  } catch(e){}
}
function renderAhoHist(hist){
  const el=document.getElementById('aho-hist');
  if(!hist.length){ el.innerHTML='<div class="empty"><div class="empty-ico">🏦</div><p>Sin movimientos registrados.</p></div>'; return; }
  el.innerHTML=[...hist].sort((a,b)=>b.fecha>a.fecha?1:-1).map(h=>`
    <div class="hist-it">
      <div class="hist-l"><div class="hist-ttl">${h.motivo||'Sin descripción'}</div>
        <div class="hist-dt">${h.fecha} &bull; <span class="bdg ${h.tipo==='entrada'?'bdg-ok':'bdg-warn'}">${h.tipo==='entrada'?'⬆️ Entrada':'⬇️ Salida'}</span></div>
      </div>
      <div class="${h.tipo==='entrada'?'amt-in':'amt-out'}">${h.tipo==='entrada'?'+':'−'}${$m(h.monto)}</div>
    </div>`).join('');
}
function openAhoModal(tipo){
  document.getElementById('ah-tipo').value=tipo;
  document.getElementById('ah-monto').value=''; document.getElementById('ah-motivo').value='';
  document.getElementById('mo-aho-ttl').textContent=tipo==='entrada'?'⬆️ Ingresar al Ahorro':'⬇️ Retirar del Ahorro';
  document.getElementById('ah-btn').className=`btn btn-full ${tipo==='entrada'?'btn-ok':'btn-bad'}`;
  openMo('mo-aho');
}
async function saveAhorro(){
  const tipo=document.getElementById('ah-tipo').value, monto=parseFloat(document.getElementById('ah-monto').value), motivo=document.getElementById('ah-motivo').value.trim();
  if(!monto||monto<=0){ alert('Ingresa un monto válido.'); return; }
  try{
    const ref=db.collection('ahorro').doc('main');
    const doc=await ref.get();
    let saldo=doc.exists?(doc.data().saldoActual||0):0, hist=doc.exists?(doc.data().historial||[]):[];
    if(tipo==='entrada') saldo+=monto;
    else{ if(monto>saldo){ alert('Saldo insuficiente.'); return; } saldo-=monto; }
    hist.push({fecha:today(),monto,tipo,motivo:motivo||'—'});
    await ref.set({saldoActual:saldo,historial:hist});
    closeMo('mo-aho'); loadAhorros();
  } catch(e){ alert('Error: '+e.message); }
}

/* ════ DASHBOARD ════ */
async function loadDash(){
  const td=today(), m=curMonth(), {start,end}=monthRange(m);
  try{
    const [snapH,snapM,snapG,docAho]=await Promise.all([
      db.collection('ventas').where('fecha','==',td).get(),
      db.collection('ventas').where('fecha','>=',start).where('fecha','<=',end).orderBy('fecha','desc').get(),
      db.collection('gastos').where('fecha','>=',start).where('fecha','<=',end).get(),
      db.collection('ahorro').doc('main').get()
    ]);
    let vHoy=0; snapH.docs.forEach(d=>vHoy+=d.data().monto||0);
    document.getElementById('s-vhoy').textContent=$m(vHoy);
    let vMes=0,comMes=0,utMes=0;
    snapM.docs.forEach(d=>{ vMes+=d.data().monto||0; comMes+=d.data().comisionMonto||0; utMes+=d.data().utilidadNegocio||0; });
    document.getElementById('s-vmes').textContent=$m(vMes);
    document.getElementById('d-vb').textContent=$m(vMes);
    document.getElementById('d-com').textContent=$m(comMes);
    document.getElementById('d-util').textContent=$m(utMes);
    document.getElementById('d-emp').textContent=emps.length;
    let gMes=0; snapG.docs.forEach(d=>gMes+=d.data().monto||0);
    document.getElementById('s-gmes').textContent=$m(gMes);
    const saldo=docAho.exists?(docAho.data().saldoActual||0):0;
    document.getElementById('s-aho').textContent=$m(saldo);
    const tb=document.getElementById('tb-dash-ventas');
    const recent=snapM.docs.slice(0,7);
    if(!recent.length){ tb.innerHTML='<tr><td colspan="4" style="text-align:center;color:var(--text2)">Sin ventas este mes.</td></tr>'; }
    else tb.innerHTML=recent.map(d=>{ const v=d.data(),e=emps.find(x=>x.id===v.idEmpleado); return `<tr><td>${v.servicio}</td><td>${e?.nombre||'—'}</td><td><strong>${$m(v.monto)}</strong></td><td>${v.fecha}</td></tr>`; }).join('');
  } catch(e){ console.error('dash',e); }
}

/* ════ REPORTES ════ */
function switchTab(t,btn){
  repTab=t;
  document.querySelectorAll('.tab').forEach(el=>el.classList.remove('on')); btn.classList.add('on');
  ['ventas','empleadas','servicios','gastos'].forEach(id=>{ document.getElementById(`rt-${id}`).style.display=id===t?'block':'none'; });
  loadReportes();
}
async function loadReportes(){
  const m=document.getElementById('rep-m').value;
  const {start,end}=monthRange(m);
  const [snapV,snapG]=await Promise.all([
    db.collection('ventas').where('fecha','>=',start).where('fecha','<=',end).get(),
    db.collection('gastos').where('fecha','>=',start).where('fecha','<=',end).get()
  ]);
  const ventas=snapV.docs.map(d=>({id:d.id,...d.data()}));
  const gastos=snapG.docs.map(d=>({id:d.id,...d.data()}));
  if(repTab==='ventas')          renderChVentas(ventas);
  else if(repTab==='empleadas')  renderRepEmps(ventas);
  else if(repTab==='servicios')  renderRepSvcs(ventas);
  else if(repTab==='gastos')     renderRepGastos(gastos);
}
function renderChVentas(ventas){
  const sem={'Sem 1':0,'Sem 2':0,'Sem 3':0,'Sem 4':0,'Sem 5':0};
  ventas.forEach(v=>{ const d=parseInt(v.fecha.split('-')[2]); const k=d<=7?'Sem 1':d<=14?'Sem 2':d<=21?'Sem 3':d<=28?'Sem 4':'Sem 5'; sem[k]+=v.monto||0; });
  const ctx=document.getElementById('ch-vsem').getContext('2d');
  if(chVentas) chVentas.destroy();
  chVentas=new Chart(ctx,{type:'bar',data:{labels:Object.keys(sem),datasets:[{label:'Ventas ($)',data:Object.values(sem),backgroundColor:'rgba(201,147,106,.72)',borderColor:'rgb(201,147,106)',borderWidth:2,borderRadius:10}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,grid:{color:'rgba(0,0,0,.04)'},ticks:{callback:v=>'$'+v.toLocaleString('es-MX')}},x:{grid:{display:false}}}}});
}
function renderRepEmps(ventas){
  const tb=document.getElementById('tb-rep-emps');
  const st={};
  emps.forEach(e=>{ st[e.id]={nombre:e.nombre,svcs:0,total:0,com:0,util:0}; });
  ventas.forEach(v=>{ if(st[v.idEmpleado]){ st[v.idEmpleado].svcs++; st[v.idEmpleado].total+=v.monto||0; st[v.idEmpleado].com+=v.comisionMonto||0; st[v.idEmpleado].util+=v.utilidadNegocio||0; } });
  tb.innerHTML=Object.values(st).map(e=>`<tr><td><strong>${e.nombre}</strong></td><td>${e.svcs}</td><td>${$m(e.total)}</td><td style="color:var(--warn)">${$m(e.com)}</td><td style="color:var(--ok)">${$m(e.util)}</td></tr>`).join('');
}
function renderRepSvcs(ventas){
  // Aggregate by service name
  const st={};
  ventas.forEach(v=>{
    const k=v.servicio||'Sin nombre';
    if(!st[k]) st[k]={nombre:k,count:0,total:0};
    st[k].count+=(v.cantidad||1); st[k].total+=v.monto||0;
  });
  const sorted=Object.values(st).sort((a,b)=>b.total-a.total).slice(0,10);
  const ctx=document.getElementById('ch-svcs').getContext('2d');
  if(chSvcs) chSvcs.destroy();
  const colors=['rgba(201,147,106,.8)','rgba(91,141,238,.8)','rgba(76,175,137,.8)','rgba(240,160,87,.8)','rgba(149,102,201,.8)','rgba(224,92,107,.8)','rgba(78,205,196,.8)','rgba(255,218,121,.8)','rgba(108,117,125,.8)','rgba(255,164,116,.8)'];
  chSvcs=new Chart(ctx,{type:'bar',data:{labels:sorted.map(s=>s.nombre),datasets:[{label:'Total Generado ($)',data:sorted.map(s=>s.total),backgroundColor:sorted.map((_,i)=>colors[i%colors.length]),borderWidth:0,borderRadius:8}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{beginAtZero:true,ticks:{callback:v=>'$'+v.toLocaleString('es-MX')}},y:{grid:{display:false}}}}});
  const tb=document.getElementById('tb-rep-svcs');
  tb.innerHTML=sorted.map((s,i)=>`<tr><td><strong>#${i+1}</strong></td><td>${s.nombre}</td><td>${s.count}</td><td><strong>${$m(s.total)}</strong></td></tr>`).join('');
}
function renderRepGastos(gastos){
  let fijo=0,op=0;
  gastos.forEach(g=>{ if(g.categoria==='Fijo')fijo+=g.monto; else op+=g.monto; });
  const ctx=document.getElementById('ch-gdist').getContext('2d');
  if(chGastos) chGastos.destroy();
  chGastos=new Chart(ctx,{type:'doughnut',data:{labels:['Gastos Fijos','Gastos Operativos'],datasets:[{data:[fijo,op],backgroundColor:['rgba(91,141,238,.78)','rgba(149,102,201,.78)'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom'}}}});
  const tb=document.getElementById('tb-rep-gas');
  tb.innerHTML=gastos.map(g=>{ const bc=g.categoria==='Fijo'?'bdg-fijo':'bdg-op'; return `<tr><td>${g.concepto}</td><td><span class="bdg ${bc}">${g.categoria}</span></td><td>${$m(g.monto)}</td></tr>`; }).join('');
}

/* ════ CIERRE ════ */
async function calcCierre(){
  const m=document.getElementById('cj-m').value, pct=parseFloat(document.getElementById('cj-pct').value)||0;
  const {start,end}=monthRange(m);
  try{
    const [snapV,snapG]=await Promise.all([
      db.collection('ventas').where('fecha','>=',start).where('fecha','<=',end).get(),
      db.collection('gastos').where('fecha','>=',start).where('fecha','<=',end).get()
    ]);
    let tv=0,tc=0; snapV.docs.forEach(d=>{ tv+=d.data().monto||0; tc+=d.data().comisionMonto||0; });
    let tg=0; snapG.docs.forEach(d=>tg+=d.data().monto||0);
    const rem=tv-tc-tg, amo=rem*pct/100, dis=rem-amo, xd=dis/2;
    cierreData={tv,tc,tg,rem,amo,dis,xd,pct};
    document.getElementById('cj-v').textContent=$m(tv);
    document.getElementById('cj-c').textContent=$m(tc);
    document.getElementById('cj-g').textContent=$m(tg);
    document.getElementById('cj-rem').textContent=$m(rem);
    document.getElementById('cj-apct').textContent=pct;
    document.getElementById('cj-amo').textContent=$m(amo);
    document.getElementById('cj-dis').textContent=$m(dis);
    document.getElementById('cj-d1').textContent=$m(xd);
    document.getElementById('cj-d2').textContent=$m(xd);
    document.getElementById('cj-apply').style.display=pct>0?'flex':'none';
  } catch(e){ alert('Error al calcular cierre: '+e.message); }
}
async function aplicarCierre(){
  if(!cierreData||cierreData.amo<=0)return;
  if(!confirm(`¿Enviar ${$m(cierreData.amo)} al fondo de ahorro?`))return;
  try{
    const ref=db.collection('ahorro').doc('main');
    const doc=await ref.get();
    let saldo=doc.exists?(doc.data().saldoActual||0):0, hist=doc.exists?(doc.data().historial||[]):[];
    saldo+=cierreData.amo;
    hist.push({fecha:today(),monto:cierreData.amo,tipo:'entrada',motivo:'Cierre de caja automático'});
    await ref.set({saldoActual:saldo,historial:hist});
    alert(`✅ ${$m(cierreData.amo)} enviados al fondo de ahorro.`);
    document.getElementById('cj-apply').style.display='none'; cierreData=null;
  } catch(e){ alert('Error: '+e.message); }
}
