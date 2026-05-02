/* Registro de resumen diario pasado (un documento en ventas por día/empleada) */
async function saveHistoricoDiario() {
  const fecha = document.getElementById('rh-fecha').value;
  const eid = document.getElementById('rh-emp').value;
  const utilEst = parseFloat(document.getElementById('rh-monto').value);
  const com = parseFloat(document.getElementById('rh-com').value);
  if (!fecha || !eid) {
    showToast('bad', '❌ Selecciona la fecha y la empleada.');
    return;
  }
  if (!turnoSeleccionValido('rh-turno')) {
    showToast('bad', '❌ Selecciona un turno (configúralos en Configuración).');
    return;
  }
  if (Number.isNaN(utilEst) || utilEst <= 0) {
    showToast('bad', '❌ Ingresa el total que corresponde a la estética (mayor a 0).');
    return;
  }
  if (Number.isNaN(com) || com < 0) {
    showToast('bad', '❌ Ingresa la comisión de la empleada (0 o más).');
    return;
  }
  const bruto = utilEst + com;
  const pct = bruto > 0 ? Math.round((com / bruto) * 10000) / 100 : 0;
  const turno = readTurnoFromSelect('rh-turno');
  try {
    await db.collection('ventas').add({
      tipo: 'historico_diario',
      fecha,
      idEmpleado: eid,
      servicio: '📅 Resumen diario (histórico)',
      idServicio: '',
      monto: bruto,
      comisionMonto: com,
      comisionTipo: 'porcentaje',
      comisionPct: pct,
      utilidadNegocio: utilEst,
      montoEsBruto: true,
      turnoId: turno.turnoId,
      turnoNombre: turno.turnoNombre,
      ts: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('ok', '✅ Registro histórico diario guardado. Venta bruta = estética + comisión; se contabiliza en reportes y cierre.');
    document.getElementById('rh-monto').value = '';
    document.getElementById('rh-com').value = '';
  } catch (e) {
    showToast('bad', '❌ Error: ' + e.message);
  }
}
