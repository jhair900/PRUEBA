
const SHEET_NAME = 'Liquidaciones';
const USERS_SHEET = 'Usuarios';
const GLOSSARY_SHEET = 'Glosario';
const PAYMENTS_SHEET = 'Pagos';
const VENTAS_SHEET = 'Ventas';
const SESSION_TTL_MINUTES = 60 * 12; // 12 horas

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'ping';
  return outputJson(handleAction_(action, e && e.parameter ? e.parameter : {}));
}

function doPost(e) {
  try {
    const body = e && e.postData && e.postData.contents
      ? JSON.parse(e.postData.contents)
      : {};
    const action = body.action || 'ping';
    return outputJson(handleAction_(action, body));
  } catch (err) {
    return outputJson({
      ok: false,
      message: 'Error en doPost: ' + err.message
    });
  }
}

function handleAction_(action, payload) {
  ensureSheet_();
  ensureUsersSheet_();
  ensureGlossarySheet_();
  ensurePaymentsSheet_();
  ensureVentasSheet_();

  if (action === 'ping') return { ok: true, message: 'API funcionando' };
  if (action === 'setupUsers') return setupInitialUsers_();
  if (action === 'login') return login_(payload.username, payload.password);
  if (action === 'changePassword') return changePassword_(payload.username, payload.currentPassword, payload.newPassword);
  if (action === 'adminResetPassword') return adminResetPassword_(payload.adminUsername, payload.targetUsername, payload.newPassword);
  if (action === 'listUsers') return listUsers_(payload.adminUsername);

  if (action === 'listGlossary') return listGlossary_();
  if (action === 'saveGlossaryTerm') {
    const session = validateSession_(payload.sessionToken);
    if (!session.ok) return session;
    return saveGlossaryTerm_(payload.term, payload.description, session);
  }
  if (action === 'deleteGlossaryTerm') {
    const session = validateSession_(payload.sessionToken);
    if (!session.ok) return session;
    return deleteGlossaryTerm_(payload.term, session);
  }
  if (action === 'resetGlossary') {
    const session = validateSession_(payload.sessionToken);
    if (!session.ok) return session;
    return resetGlossary_(session);
  }

  if (action === 'save') {
    const session = validateSession_(payload.sessionToken);
    if (!session.ok) return session;
    return saveLiquidacion_(payload.data, session);
  }

  if (action === 'getByPlaca') {
    const session = validateSession_(payload.sessionToken);
    if (!session.ok) return session;
    return getByPlaca_(payload.placa, session);
  }

  if (action === 'list') {
    const session = validateSession_(payload.sessionToken);
    if (!session.ok) return session;
    return listLiquidaciones_(payload.mode, session);
  }

  if (action === 'delete') {
    const session = validateSession_(payload.sessionToken);
    if (!session.ok) return session;
    return deleteByPlaca_(payload.placa, session);
  }

  if (action === 'savePago') {
    const session = validateSession_(payload.sessionToken);
    if (!session.ok) return session;
    return savePago_(payload.data, session);
  }

  if (action === 'getPagoByPlaca') {
    const session = validateSession_(payload.sessionToken);
    if (!session.ok) return session;
    return getPagoByPlaca_(payload.placa, session);
  }

  if (action === 'listPagos') {
    const session = validateSession_(payload.sessionToken);
    if (!session.ok) return session;
    return listPagos_(payload.mode, session);
  }

  if (action === 'deletePago') {
    const session = validateSession_(payload.sessionToken);
    if (!session.ok) return session;
    return deletePagoByPlaca_(payload.placa, session);
  }

  if (action === 'saveVenta') {
    const session = validateSession_(payload.sessionToken);
    if (!session.ok) return session;
    return saveVenta_(payload.data, session);
  }

  if (action === 'getVentaByPlaca') {
    const session = validateSession_(payload.sessionToken);
    if (!session.ok) return session;
    return getVentaByPlaca_(payload.placa, session);
  }

  if (action === 'listVentas') {
    const session = validateSession_(payload.sessionToken);
    if (!session.ok) return session;
    return listVentas_(payload.mode, session);
  }

  if (action === 'deleteVenta') {
    const session = validateSession_(payload.sessionToken);
    if (!session.ok) return session;
    return deleteVentaByPlaca_(payload.placa, session);
  }

  return { ok: false, message: 'Acción no válida: ' + action };
}

function outputJson(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME);
}

function ensureSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);

  if (!sh) sh = ss.insertSheet(SHEET_NAME);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 8).setValues([[
      'PLACA',
      'CLIENTE',
      'FECHA',
      'RIESGO',
      'ASESOR',
      'TIPO_DOCUMENTO',
      'UPDATED_AT',
      'DATA_JSON'
    ]]);
  }

  return sh;
}

function ensureUsersSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(USERS_SHEET);

  if (!sh) sh = ss.insertSheet(USERS_SHEET);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 8).setValues([[
      'USERNAME',
      'DISPLAY_NAME',
      'PASSWORD',
      'IS_ADMIN',
      'IS_ACTIVE',
      'MUST_CHANGE_PASSWORD',
      'SESSION_TOKEN',
      'SESSION_EXPIRES_AT'
    ]]);
  }

  return sh;
}

function ensureGlossarySheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(GLOSSARY_SHEET);

  if (!sh) sh = ss.insertSheet(GLOSSARY_SHEET);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 4).setValues([[
      'TERM',
      'DESCRIPTION',
      'UPDATED_BY',
      'UPDATED_AT'
    ]]);
  }

  return sh;
}

function getPaymentsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(PAYMENTS_SHEET);
}

function ensurePaymentsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(PAYMENTS_SHEET);

  if (!sh) sh = ss.insertSheet(PAYMENTS_SHEET);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 6).setValues([[
      'PLACA',
      'RESPONSABLE',
      'CLIENTE',
      'DICTAMEN',
      'UPDATED_AT',
      'DATA_JSON'
    ]]);
  }

  return sh;
}

function normalizeUser_(u) {
  return String(u || '').trim().toUpperCase();
}

function normalizePlaca_(placa) {
  return String(placa || '').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeTerm_(term) {
  return String(term || '').trim().toUpperCase();
}

function uniqueUsers_(list) {
  const out = [];
  const seen = {};
  (Array.isArray(list) ? list : []).forEach(function(u) {
    const x = normalizeUser_(u);
    if (x && !seen[x]) {
      seen[x] = true;
      out.push(x);
    }
  });
  return out;
}

function buildHistory_(existingData, incomingData, sessionUser) {
  const base = []
    .concat(existingData && existingData.historialUsuarios ? existingData.historialUsuarios : [])
    .concat(incomingData && incomingData.historialUsuarios ? incomingData.historialUsuarios : [])
    .concat(existingData && existingData.asesorCreador ? [existingData.asesorCreador] : [])
    .concat(existingData && existingData.asesorEditor ? [existingData.asesorEditor] : [])
    .concat(incomingData && incomingData.asesorCreador ? [incomingData.asesorCreador] : [])
    .concat(incomingData && incomingData.asesorEditor ? [incomingData.asesorEditor] : [])
    .concat(sessionUser ? [sessionUser] : []);
  return uniqueUsers_(base);
}

function buildResponsablesLabel_(history) {
  const hist = uniqueUsers_(history);
  return hist.join(' / ');
}

function firstUser_(history) {
  const hist = uniqueUsers_(history);
  return hist.length ? hist[0] : '';
}

function lastEditor_(history) {
  const hist = uniqueUsers_(history);
  return hist.length > 1 ? hist[hist.length - 1] : '';
}

function findUserRow_(sheet, username) {
  const u = normalizeUser_(username);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (normalizeUser_(values[i][0]) === u) return i + 2;
  }
  return 0;
}

function findRowByPlaca_(sheet, placa) {
  const placaNorm = normalizePlaca_(placa);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (normalizePlaca_(values[i][0]) === placaNorm) return i + 2;
  }
  return 0;
}

function findGlossaryRow_(sheet, term) {
  const t = normalizeTerm_(term);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < values.length; i++) {
    if (normalizeTerm_(values[i][0]) === t) return i + 2;
  }
  return 0;
}

function generateToken_() {
  return Utilities.getUuid() + '-' + new Date().getTime();
}

function hashPassword_(password) {
  return Utilities.base64Encode(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      String(password || ''),
      Utilities.Charset.UTF_8
    )
  );
}

function setupInitialUsers_() {
  try {
    const sh = ensureUsersSheet_();

    const users = [
      { username: 'YROMERO', displayName: 'YROMERO', password: '123456', isAdmin: false },
      { username: 'NPADILLA', displayName: 'NPADILLA', password: '123456', isAdmin: false },
      { username: 'PCHAMORRO', displayName: 'PCHAMORRO', password: '123456', isAdmin: false },
      { username: 'SORTIZ', displayName: 'SORTIZ', password: '123456', isAdmin: false },
      { username: 'JSANCHEZ', displayName: 'JSANCHEZ', password: '123456', isAdmin: true },
      { username: 'TANDRADE', displayName: 'TANDRADE', password: '123456', isAdmin: false },
      { username: 'JPRADO', displayName: 'JPRADO', password: '123456', isAdmin: false },
      { username: 'PFERNANDEZ', displayName: 'PFERNANDEZ', password: '123456', isAdmin: false },
      { username: 'FPROAÑO', displayName: 'FPROAÑO', password: '123456', isAdmin: false },
      { username: 'IBATALLAS', displayName: 'IBATALLAS', password: '123456', isAdmin: false },
      { username: 'ACIFUENTES', displayName: 'ACIFUENTES', password: '123456', isAdmin: false },
      { username: 'PQUEZADA', displayName: 'PQUEZADA', password: '123456', isAdmin: false }
    ];

    users.forEach(function(u) {
      const row = findUserRow_(sh, u.username);
      const rowData = [
        normalizeUser_(u.username),
        u.displayName || normalizeUser_(u.username),
        hashPassword_(u.password),
        u.isAdmin ? true : false,
        true,
        true,
        '',
        ''
      ];

      if (row > 0) sh.getRange(row, 1, 1, 8).setValues([rowData]);
      else sh.appendRow(rowData);
    });

    return { ok: true, message: 'Usuarios iniciales creados/actualizados.' };
  } catch (err) {
    return { ok: false, message: 'Error en setupInitialUsers_: ' + err.message };
  }
}

function crearUsuariosAhora() {
  return setupInitialUsers_();
}

function login_(username, password) {
  try {
    const sh = ensureUsersSheet_();
    const row = findUserRow_(sh, username);

    if (!row) return { ok: false, message: 'Usuario no encontrado o inactivo.' };

    const values = sh.getRange(row, 1, 1, 8).getValues()[0];
    const isActive = values[4] === true || String(values[4]).toUpperCase() === 'TRUE';
    if (!isActive) return { ok: false, message: 'Usuario no encontrado o inactivo.' };

    if ((values[2] || '') !== hashPassword_(password)) {
      return { ok: false, message: 'Clave incorrecta.' };
    }

    const token = generateToken_();
    const expires = new Date(Date.now() + SESSION_TTL_MINUTES * 60 * 1000);
    sh.getRange(row, 7, 1, 2).setValues([[token, expires]]);

    return {
      ok: true,
      sessionToken: token,
      user: {
        username: values[0],
        displayName: values[1],
        isAdmin: values[3] === true || String(values[3]).toUpperCase() === 'TRUE',
        mustChangePassword: values[5] === true || String(values[5]).toUpperCase() === 'TRUE'
      }
    };
  } catch (err) {
    return { ok: false, message: 'Error al iniciar sesión: ' + err.message };
  }
}

function validateSession_(token) {
  try {
    if (!token) return { ok: false, code: 'AUTH_REQUIRED', message: 'Sesión no válida.' };

    const sh = ensureUsersSheet_();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return { ok: false, code: 'AUTH_REQUIRED', message: 'Sesión no válida.' };

    const values = sh.getRange(2, 1, lastRow - 1, 8).getValues();

    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const sessionToken = row[6];
      const expiresAt = row[7];
      const isActive = row[4] === true || String(row[4]).toUpperCase() === 'TRUE';

      if (sessionToken === token && isActive) {
        if (!expiresAt || new Date(expiresAt).getTime() < Date.now()) {
          return { ok: false, code: 'AUTH_REQUIRED', message: 'Sesión expirada.' };
        }
        return {
          ok: true,
          user: normalizeUser_(row[0]),
          displayName: row[1] || normalizeUser_(row[0]),
          isAdmin: row[3] === true || String(row[3]).toUpperCase() === 'TRUE',
          rowIndex: i + 2
        };
      }
    }

    return { ok: false, code: 'AUTH_REQUIRED', message: 'Sesión no válida.' };
  } catch (err) {
    return { ok: false, code: 'AUTH_REQUIRED', message: 'Error validando sesión: ' + err.message };
  }
}

function changePassword_(username, currentPassword, newPassword) {
  try {
    const sh = ensureUsersSheet_();
    const row = findUserRow_(sh, username);

    if (!row) return { ok: false, message: 'Usuario no encontrado.' };
    if (!newPassword || String(newPassword).length < 4) {
      return { ok: false, message: 'La nueva clave debe tener al menos 4 caracteres.' };
    }

    const values = sh.getRange(row, 1, 1, 8).getValues()[0];
    if ((values[2] || '') !== hashPassword_(currentPassword)) {
      return { ok: false, message: 'La clave actual no es correcta.' };
    }

    sh.getRange(row, 3, 1, 5).setValues([[
      hashPassword_(newPassword),
      values[3],
      values[4],
      false,
      ''
    ]]);
    sh.getRange(row, 8).setValue('');

    return { ok: true, message: 'Clave actualizada correctamente.' };
  } catch (err) {
    return { ok: false, message: 'Error al cambiar clave: ' + err.message };
  }
}

function adminResetPassword_(adminUsername, targetUsername, newPassword) {
  try {
    const sh = ensureUsersSheet_();
    const adminRow = findUserRow_(sh, adminUsername);
    const targetRow = findUserRow_(sh, targetUsername);

    if (!adminRow) return { ok: false, message: 'Administrador no encontrado.' };
    if (!targetRow) return { ok: false, message: 'Usuario destino no encontrado.' };
    if (!newPassword || String(newPassword).length < 4) {
      return { ok: false, message: 'La nueva clave debe tener al menos 4 caracteres.' };
    }

    const adminValues = sh.getRange(adminRow, 1, 1, 8).getValues()[0];
    const isAdmin = adminValues[3] === true || String(adminValues[3]).toUpperCase() === 'TRUE';
    if (!isAdmin) return { ok: false, message: 'No autorizado.' };

    sh.getRange(targetRow, 3, 1, 5).setValues([[
      hashPassword_(newPassword),
      sh.getRange(targetRow, 4).getValue(),
      sh.getRange(targetRow, 5).getValue(),
      true,
      ''
    ]]);
    sh.getRange(targetRow, 8).setValue('');

    return { ok: true, message: 'Clave reseteada correctamente.' };
  } catch (err) {
    return { ok: false, message: 'Error al resetear clave: ' + err.message };
  }
}

function listUsers_(adminUsername) {
  try {
    const sh = ensureUsersSheet_();
    const adminRow = findUserRow_(sh, adminUsername);
    if (!adminRow) return { ok: false, message: 'Administrador no encontrado.' };

    const adminValues = sh.getRange(adminRow, 1, 1, 8).getValues()[0];
    const isAdmin = adminValues[3] === true || String(adminValues[3]).toUpperCase() === 'TRUE';
    if (!isAdmin) return { ok: false, message: 'No autorizado.' };

    const lastRow = sh.getLastRow();
    if (lastRow < 2) return { ok: true, rows: [] };

    const values = sh.getRange(2, 1, lastRow - 1, 8).getValues();
    const rows = values.map(function(r) {
      return {
        username: r[0] || '',
        displayName: r[1] || '',
        isAdmin: r[3] === true || String(r[3]).toUpperCase() === 'TRUE',
        isActive: r[4] === true || String(r[4]).toUpperCase() === 'TRUE',
        mustChangePassword: r[5] === true || String(r[5]).toUpperCase() === 'TRUE'
      };
    });

    return { ok: true, rows: rows };
  } catch (err) {
    return { ok: false, message: 'Error listando usuarios: ' + err.message };
  }
}

function listGlossary_() {
  try {
    const sh = ensureGlossarySheet_();
    const lastRow = sh.getLastRow();
    const items = {};
    if (lastRow >= 2) {
      const values = sh.getRange(2, 1, lastRow - 1, 2).getValues();
      values.forEach(function(r) {
        const term = normalizeTerm_(r[0]);
        const description = String(r[1] || '').trim();
        if (term && description) items[term] = description;
      });
    }
    return { ok: true, items: items };
  } catch (err) {
    return { ok: false, message: 'Error listando glosario: ' + err.message };
  }
}

function saveGlossaryTerm_(term, description, session) {
  try {
    if (!session.isAdmin) return { ok: false, message: 'No autorizado.' };

    const key = normalizeTerm_(term);
    const desc = String(description || '').trim();
    if (!key) return { ok: false, message: 'El término es obligatorio.' };
    if (!desc) return { ok: false, message: 'La descripción es obligatoria.' };

    const sh = ensureGlossarySheet_();
    const row = findGlossaryRow_(sh, key);
    const rowData = [key, desc, session.user, new Date()];

    if (row > 0) sh.getRange(row, 1, 1, 4).setValues([rowData]);
    else sh.appendRow(rowData);

    return { ok: true, message: 'Término guardado.' };
  } catch (err) {
    return { ok: false, message: 'Error guardando término: ' + err.message };
  }
}

function deleteGlossaryTerm_(term, session) {
  try {
    if (!session.isAdmin) return { ok: false, message: 'No autorizado.' };
    const key = normalizeTerm_(term);
    if (!key) return { ok: false, message: 'El término es obligatorio.' };

    const sh = ensureGlossarySheet_();
    const row = findGlossaryRow_(sh, key);
    if (!row) return { ok: false, message: 'Término no encontrado.' };

    sh.deleteRow(row);
    return { ok: true, message: 'Término eliminado.' };
  } catch (err) {
    return { ok: false, message: 'Error eliminando término: ' + err.message };
  }
}

function resetGlossary_(session) {
  try {
    if (!session.isAdmin) return { ok: false, message: 'No autorizado.' };
    const sh = ensureGlossarySheet_();
    const lastRow = sh.getLastRow();
    if (lastRow >= 2) sh.getRange(2, 1, lastRow - 1, 4).clearContent();
    return { ok: true, message: 'Glosario restablecido.' };
  } catch (err) {
    return { ok: false, message: 'Error restableciendo glosario: ' + err.message };
  }
}

function saveLiquidacion_(data, session) {
  try {
    if (!data) return { ok: false, message: 'No se recibió data.' };

    const sheet = getSheet_();
    const placa = normalizePlaca_(data.placa);
    if (!placa) return { ok: false, message: 'La placa es obligatoria.' };

    let existingData = null;
    const row = findRowByPlaca_(sheet, placa);
    if (row > 0) {
      const existingJson = sheet.getRange(row, 8).getValue();
      existingData = existingJson ? JSON.parse(existingJson) : null;
    }

    const history = buildHistory_(existingData, data, session.user);
    data.placa = placa;
    data.historialUsuarios = history;
    data.asesorCreador = firstUser_(history);
    data.asesorEditor = lastEditor_(history);
    data.asesor = buildResponsablesLabel_(history);

    const rowData = [
      placa,
      data.cliente || '',
      data.fecha || '',
      data.riesgo || '',
      data.asesor || '',
      data.tipoDocumento || '',
      new Date(),
      JSON.stringify(data)
    ];

    if (row > 0) {
      sheet.getRange(row, 1, 1, 8).setValues([rowData]);
      return { ok: true, message: 'Registro actualizado.', placa: placa, updated: true, data: data };
    } else {
      sheet.appendRow(rowData);
      return { ok: true, message: 'Registro guardado.', placa: placa, updated: false, data: data };
    }
  } catch (err) {
    return { ok: false, message: 'Error al guardar: ' + err.message };
  }
}

function getByPlaca_(placa, session) {
  try {
    const sheet = getSheet_();
    const row = findRowByPlaca_(sheet, placa);
    if (!row) return { ok: false, message: 'No existe registro para esa placa.' };

    const json = sheet.getRange(row, 8).getValue();
    const data = JSON.parse(json || '{}');

    const history = buildHistory_(data, {}, null);
    data.historialUsuarios = history;
    data.asesorCreador = firstUser_(history);
    data.asesorEditor = lastEditor_(history);
    data.asesor = buildResponsablesLabel_(history);

    return {
      ok: true,
      data: data,
      openedBy: session.user
    };
  } catch (err) {
    return { ok: false, message: 'Error al buscar: ' + err.message };
  }
}

function listLiquidaciones_(mode, session) {
  try {
    const sheet = getSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, rows: [] };

    const values = sheet.getRange(2, 1, lastRow - 1, 8).getValues();

    let rows = values.map(function(r) {
      let data = {};
      try { data = JSON.parse(r[7] || '{}'); } catch(e) {}
      const history = buildHistory_(data, {}, null);
      const asesor = buildResponsablesLabel_(history);
      return {
        placa: r[0] || '',
        cliente: r[1] || '',
        fecha: r[2] || '',
        riesgo: r[3] || '',
        asesor: asesor || r[4] || '',
        asesorCreador: firstUser_(history),
        asesorEditor: lastEditor_(history),
        historialUsuarios: history,
        tipoDocumento: r[5] || '',
        updatedAt: r[6] || ''
      };
    });

    if (mode === 'mio') {
      rows = rows.filter(function(x) {
        return uniqueUsers_(x.historialUsuarios).indexOf(normalizeUser_(session.user)) > -1;
      });
    }

    rows.sort(function(a, b) {
      return ((a.asesor || '') + (a.placa || '')).localeCompare((b.asesor || '') + (b.placa || ''));
    });

    return { ok: true, rows: rows };
  } catch (err) {
    return { ok: false, message: 'Error al listar: ' + err.message };
  }
}

function deleteByPlaca_(placa, session) {
  try {
    const sheet = getSheet_();
    const row = findRowByPlaca_(sheet, placa);
    if (!row) return { ok: false, message: 'No existe registro para esa placa.' };

    const json = sheet.getRange(row, 8).getValue();
    let data = {};
    try { data = JSON.parse(json || '{}'); } catch(e) {}

    const history = buildHistory_(data, {}, null);
    if (!session.isAdmin && uniqueUsers_(history).indexOf(normalizeUser_(session.user)) === -1) {
      return { ok: false, message: 'No autorizado para eliminar este registro.' };
    }

    sheet.deleteRow(row);
    return { ok: true, message: 'Registro eliminado.' };
  } catch (err) {
    return { ok: false, message: 'Error al eliminar: ' + err.message };
  }
}

function savePago_(data, session) {
  try {
    if (!data) return { ok: false, message: 'No se recibió data del pago.' };

    const sheet = getPaymentsSheet_();
    const placa = normalizePlaca_(data.placaValue || data.placa);
    if (!placa) return { ok: false, message: 'La placa es obligatoria.' };

    // Leer data existente para fusionar historial correctamente
    let existingData = null;
    const row = findRowByPlaca_(sheet, placa);
    if (row > 0) {
      const existingJson = sheet.getRange(row, 6).getValue();
      existingData = existingJson ? JSON.parse(existingJson) : null;
    }

    // Construir historial acumulativo: existente + entrante + sesión actual
    const history = buildHistory_(existingData, data, session.user);
    data.placaValue = placa;
    data.placa = placa;
    data.historialUsuarios = history;
    data.asesorCreador = firstUser_(history);   // primer guardador
    data.asesorEditor = lastEditor_(history);   // último editor
    if (!data.responsableValue) data.responsableValue = session.user;

    const rowData = [
      placa,
      data.responsableValue || session.user || '',
      data.clienteValue || '',
      data.dictamenValue || '',
      new Date(),
      JSON.stringify(data)
    ];

    if (row > 0) {
      sheet.getRange(row, 1, 1, 6).setValues([rowData]);
      return { ok: true, message: 'Pago actualizado.', placa: placa, updated: true, data: data };
    }

    sheet.appendRow(rowData);
    return { ok: true, message: 'Pago guardado.', placa: placa, updated: false, data: data };
  } catch (err) {
    return { ok: false, message: 'Error al guardar pago: ' + err.message };
  }
}

function getPagoByPlaca_(placa, session) {
  try {
    const sheet = getPaymentsSheet_();
    const row = findRowByPlaca_(sheet, placa);
    if (!row) return { ok: false, message: 'No existe registro de pago para esa placa.' };

    const json = sheet.getRange(row, 6).getValue();
    const data = JSON.parse(json || '{}');

    // Reconstruir historial desde los campos guardados
    const history = buildHistory_(data, {}, null);
    data.historialUsuarios = history;
    data.asesorCreador = firstUser_(history);
    data.asesorEditor = lastEditor_(history);

    if (!data.responsableValue) data.responsableValue = session.user || '';
    return { ok: true, data: data, openedBy: session.user };
  } catch (err) {
    return { ok: false, message: 'Error al buscar pago: ' + err.message };
  }
}

function listPagos_(mode, session) {
  try {
    const sheet = getPaymentsSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, rows: [] };

    let rows = sheet.getRange(2, 1, lastRow - 1, 6).getValues().map(function(r) {
      let data = {};
      try { data = JSON.parse(r[5] || '{}'); } catch(e) {}
      return {
        placa: r[0] || '',
        responsable: r[1] || '',
        cliente: r[2] || '',
        dictamen: r[3] || '',
        updatedAt: r[4] || '',
        data: data
      };
    });

    if (mode === 'mio') {
      rows = rows.filter(function(x) {
        return normalizeUser_(x.responsable || x.data.responsableValue) === normalizeUser_(session.user);
      });
    }

    rows.sort(function(a, b) {
      return (a.placa || '').localeCompare(b.placa || '');
    });

    return { ok: true, rows: rows };
  } catch (err) {
    return { ok: false, message: 'Error al listar pagos: ' + err.message };
  }
}

function deletePagoByPlaca_(placa, session) {
  try {
    const sheet = getPaymentsSheet_();
    const row = findRowByPlaca_(sheet, placa);
    if (!row) return { ok: false, message: 'No existe registro de pago para esa placa.' };

    const responsable = normalizeUser_(sheet.getRange(row, 2).getValue());
    if (!session.isAdmin && responsable !== normalizeUser_(session.user)) {
      return { ok: false, message: 'No autorizado para eliminar este pago.' };
    }

    sheet.deleteRow(row);
    return { ok: true, message: 'Pago eliminado.' };
  } catch (err) {
    return { ok: false, message: 'Error al eliminar pago: ' + err.message };
  }
}

// ─────────────────────────────────────────────────────────────────
// VENTAS
// ─────────────────────────────────────────────────────────────────

function getVentasSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(VENTAS_SHEET);
}

function ensureVentasSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(VENTAS_SHEET);

  if (!sh) sh = ss.insertSheet(VENTAS_SHEET);

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, 6).setValues([[
      'PLACA',
      'ASESOR_CREADOR',
      'CLIENTE',
      'DICTAMEN',
      'UPDATED_AT',
      'DATA_JSON'
    ]]);
  }

  return sh;
}

function saveVenta_(data, session) {
  try {
    if (!data) return { ok: false, message: 'No se recibió data de la venta.' };

    const sheet = getVentasSheet_();
    const placa = normalizePlaca_(data.placaValue || data.placa);
    if (!placa) return { ok: false, message: 'La placa es obligatoria.' };

    // Leer data existente para fusionar historial
    let existingData = null;
    const row = findRowByPlaca_(sheet, placa);
    if (row > 0) {
      const existingJson = sheet.getRange(row, 6).getValue();
      existingData = existingJson ? JSON.parse(existingJson) : null;
    }

    // Construir historial acumulativo: existente + entrante + sesión actual
    const history = buildHistory_(existingData, data, session.user);
    data.placaValue = placa;
    data.placa = placa;
    data.historialUsuarios = history;
    data.asesorCreador = firstUser_(history);  // primer guardador
    data.asesorEditor  = lastEditor_(history); // último editor

    const rowData = [
      placa,
      data.asesorCreador || session.user || '',
      data.clienteValue  || '',
      data.dictamenValue || '',
      new Date(),
      JSON.stringify(data)
    ];

    if (row > 0) {
      sheet.getRange(row, 1, 1, 6).setValues([rowData]);
      return { ok: true, message: 'Venta actualizada.', placa: placa, updated: true, data: data };
    }

    sheet.appendRow(rowData);
    return { ok: true, message: 'Venta guardada.', placa: placa, updated: false, data: data };
  } catch (err) {
    return { ok: false, message: 'Error al guardar venta: ' + err.message };
  }
}

function getVentaByPlaca_(placa, session) {
  try {
    const sheet = getVentasSheet_();
    const row = findRowByPlaca_(sheet, placa);
    if (!row) return { ok: false, message: 'No existe registro de venta para esa placa.' };

    const json = sheet.getRange(row, 6).getValue();
    const data = JSON.parse(json || '{}');

    // Reconstruir historial desde los campos guardados
    const history = buildHistory_(data, {}, null);
    data.historialUsuarios = history;
    data.asesorCreador = firstUser_(history);
    data.asesorEditor  = lastEditor_(history);

    return { ok: true, data: data, openedBy: session.user };
  } catch (err) {
    return { ok: false, message: 'Error al buscar venta: ' + err.message };
  }
}

function listVentas_(mode, session) {
  try {
    const sheet = getVentasSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, rows: [] };

    let rows = sheet.getRange(2, 1, lastRow - 1, 6).getValues().map(function(r) {
      let data = {};
      try { data = JSON.parse(r[5] || '{}'); } catch(e) {}
      const history = buildHistory_(data, {}, null);
      return {
        placa:          r[0] || '',
        asesorCreador:  firstUser_(history) || r[1] || '',
        asesorEditor:   lastEditor_(history),
        historialUsuarios: history,
        cliente:        r[2] || '',
        dictamen:       r[3] || '',
        updatedAt:      r[4] || '',
        data:           data
      };
    });

    if (mode === 'mio') {
      rows = rows.filter(function(x) {
        return uniqueUsers_(x.historialUsuarios).indexOf(normalizeUser_(session.user)) > -1;
      });
    }

    rows.sort(function(a, b) {
      return (a.placa || '').localeCompare(b.placa || '');
    });

    return { ok: true, rows: rows };
  } catch (err) {
    return { ok: false, message: 'Error al listar ventas: ' + err.message };
  }
}

function deleteVentaByPlaca_(placa, session) {
  try {
    const sheet = getVentasSheet_();
    const row = findRowByPlaca_(sheet, placa);
    if (!row) return { ok: false, message: 'No existe registro de venta para esa placa.' };

    const json = sheet.getRange(row, 6).getValue();
    let data = {};
    try { data = JSON.parse(json || '{}'); } catch(e) {}

    const history = buildHistory_(data, {}, null);
    if (!session.isAdmin && uniqueUsers_(history).indexOf(normalizeUser_(session.user)) === -1) {
      return { ok: false, message: 'No autorizado para eliminar este registro de venta.' };
    }

    sheet.deleteRow(row);
    return { ok: true, message: 'Venta eliminada.' };
  } catch (err) {
    return { ok: false, message: 'Error al eliminar venta: ' + err.message };
  }
}
