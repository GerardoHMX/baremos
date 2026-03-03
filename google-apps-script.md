# Google Apps Script — CRUD de Alumnos

Guía completa para configurar el backend de Google Apps Script que permite
**registrar, editar y eliminar** desde la app *Evaluación EF* y
persistirlos directamente en la hojas de Google Spreadsheet.

---

## Cómo funciona

```
Navegador (app.js)                Google Apps Script (Web App)         Google Sheets
        │                                      │                             │
        │── POST /exec  ─────────────────────▶ │                             │
        │   { action, payload }                │── leer / escribir ────────▶ │ ALUMNOS
        │                                      │                             │ DATOS
        │◀── { ok, message } ─────────────────│                             │
```

- El frontend envía peticiones **HTTP POST** al mismo endpoint del Web App ya
  desplegado para Clases.
- Se añaden  acciones al `switch` del `doPost`
- La hojas de Google Spreadsheet son la fuente de verdad para los registros.

---
 
## Añadir las acciones al script existente

Abre el proyecto en [script.google.com](https://script.google.com) y realiza
los siguientes cambios.

### 3.1 Ampliar el `switch` en `doPost`

Localiza el bloque `switch (action)` y añade los tres nuevos casos:

```javascript
switch (action) {
  case 'addClass':      result = addClass(payload);      break;
  case 'editClass':     result = editClass(payload);     break;
  case 'deleteClass':   result = deleteClass(payload);   break;
  // ── NUEVOS ──────────────────────────────────────────
  case 'addStudent':    result = addStudent(payload);    break;
  case 'editStudent':   result = editStudent(payload);   break;
  case 'deleteStudent': result = deleteStudent(payload); break;
  // ────────────────────────────────────────────────────
  default:
    result = { ok: false, error: 'Acción no reconocida: ' + action };
}
```

### 3.2 Añadir las tres funciones al final del script

Pega estas tres funciones **al final** del archivo `Código.gs`, después de
la función `deleteClass`:

```javascript
// ============================================================
// Evaluación EF · Google Apps Script
// CRUD de Clases sobre Google Sheets
// ============================================================

const SPREADSHEET_ID = '1-TOIRNPEryA5f5ni9_Cs1LuT0EwIrWkwuNjC8Q6YzP8'; // ← reemplaza esto

// ────────────────────────────────────────────────────────────
// ENTRADA: petición POST desde el navegador
// ────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    const data    = JSON.parse(e.postData.contents);
    const action  = data.action;
    const payload = data.payload || {};

    let result;
    switch (action) {
      case 'addClass':    result = addClass(payload);    break;
      case 'editClass':   result = editClass(payload);   break;
      case 'deleteClass': result = deleteClass(payload); break;
      case 'addStudent':    result = addStudent(payload);    break;
      case 'editStudent':   result = editStudent(payload);   break;
      case 'deleteStudent': result = deleteStudent(payload); break;
      case 'addTest':    result = addTest(payload);    break;
      case 'editTest':   result = editTest(payload);   break;
      case 'toggleTest': result = toggleTest(payload); break;
      case 'deleteTest': result = deleteTest(payload); break;
      case 'saveMeasurements': result = saveMeasurements(payload); break;
      default:
        result = { ok: false, error: 'Acción no reconocida: ' + action };
    }

    return jsonResponse(result);

  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// Responde a peticiones GET (útil para verificar que el Web App está activo)
function doGet(e) {
  return jsonResponse({ ok: true, message: 'API Evaluación EF activa.' });
}

// ────────────────────────────────────────────────────────────
// UTILIDADES
// ────────────────────────────────────────────────────────────

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

/**
 * Devuelve un mapa { NOMBRE_COLUMNA: índice_0based }
 * a partir de la fila de cabeceras de la hoja.
 */
function getHeaderMap(sheet) {
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    if (h) map[String(h).trim()] = i;
  });
  return map;
}

/**
 * Compara CICLO, GRADO y CURSO de una fila con los valores dados.
 */
function matchesClass(row, hdrs, ciclo, grado, curso) {
  return (
    String(row[hdrs.CICLO] || '').trim() === ciclo &&
    String(row[hdrs.GRADO] || '').trim() === grado &&
    String(row[hdrs.CURSO] || '').trim() === curso
  );
}

// ────────────────────────────────────────────────────────────
// AÑADIR CLASE
// ────────────────────────────────────────────────────────────

function addClass(p) {
  const { ciclo, grado, curso, anioAcademico } = p;

  if (!ciclo || !grado || !curso) {
    return { ok: false, error: 'Ciclo, Grado y Curso son obligatorios.' };
  }

  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName('CONFIGURACION');
  if (!sheet) return { ok: false, error: 'Hoja CONFIGURACION no encontrada.' };

  const hdrs = getHeaderMap(sheet);
  const data = sheet.getDataRange().getValues();

  // Verificar que la clase no exista ya
  for (let i = 1; i < data.length; i++) {
    if (matchesClass(data[i], hdrs, ciclo, grado, curso)) {
      return {
        ok:    false,
        error: `La clase "${ciclo} ${grado} ${curso}" ya existe en la hoja.`
      };
    }
  }

  // Construir nueva fila con tantas celdas como columnas hay en la hoja
  const numCols = sheet.getLastColumn();
  const newRow  = new Array(numCols).fill('');

  if (hdrs.ANIO_ACADEMICO !== undefined) newRow[hdrs.ANIO_ACADEMICO] = anioAcademico || '';
  if (hdrs.CICLO          !== undefined) newRow[hdrs.CICLO]          = ciclo;
  if (hdrs.GRADO          !== undefined) newRow[hdrs.GRADO]          = grado;
  if (hdrs.CURSO          !== undefined) newRow[hdrs.CURSO]          = curso;

  sheet.appendRow(newRow);
  SpreadsheetApp.flush();

  return { ok: true, message: `Clase "${ciclo} ${grado} ${curso}" creada correctamente.` };
}

// ────────────────────────────────────────────────────────────
// EDITAR CLASE
// ────────────────────────────────────────────────────────────

function editClass(p) {
  const { oldCiclo, oldGrado, oldCurso, ciclo, grado, curso, anioAcademico } = p;

  if (!oldCiclo || !oldGrado || !oldCurso) {
    return { ok: false, error: 'Se necesitan los valores originales (oldCiclo, oldGrado, oldCurso).' };
  }
  if (!ciclo || !grado || !curso) {
    return { ok: false, error: 'Ciclo, Grado y Curso nuevos son obligatorios.' };
  }

  const ss      = getSpreadsheet();
  let   updated = 0;

  // ── CONFIGURACION ──
  const configSheet = ss.getSheetByName('CONFIGURACION');
  if (configSheet) {
    const hdrs = getHeaderMap(configSheet);
    const data = configSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (!matchesClass(data[i], hdrs, oldCiclo, oldGrado, oldCurso)) continue;

      if (hdrs.CICLO !== undefined)
        configSheet.getRange(i + 1, hdrs.CICLO + 1).setValue(ciclo);
      if (hdrs.GRADO !== undefined)
        configSheet.getRange(i + 1, hdrs.GRADO + 1).setValue(grado);
      if (hdrs.CURSO !== undefined)
        configSheet.getRange(i + 1, hdrs.CURSO + 1).setValue(curso);
      if (anioAcademico && hdrs.ANIO_ACADEMICO !== undefined)
        configSheet.getRange(i + 1, hdrs.ANIO_ACADEMICO + 1).setValue(anioAcademico);

      updated++;
    }
  }

  // ── ALUMNOS ──
  const alumnosSheet = ss.getSheetByName('ALUMNOS');
  if (alumnosSheet) {
    const hdrs = getHeaderMap(alumnosSheet);
    const data = alumnosSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (!matchesClass(data[i], hdrs, oldCiclo, oldGrado, oldCurso)) continue;

      if (hdrs.CICLO !== undefined)
        alumnosSheet.getRange(i + 1, hdrs.CICLO + 1).setValue(ciclo);
      if (hdrs.GRADO !== undefined)
        alumnosSheet.getRange(i + 1, hdrs.GRADO + 1).setValue(grado);
      if (hdrs.CURSO !== undefined)
        alumnosSheet.getRange(i + 1, hdrs.CURSO + 1).setValue(curso);
    }
  }

  // ── DATOS ──
  const datosSheet = ss.getSheetByName('DATOS');
  if (datosSheet) {
    const hdrs = getHeaderMap(datosSheet);
    const data = datosSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (!matchesClass(data[i], hdrs, oldCiclo, oldGrado, oldCurso)) continue;

      if (hdrs.CICLO !== undefined)
        datosSheet.getRange(i + 1, hdrs.CICLO + 1).setValue(ciclo);
      if (hdrs.GRADO !== undefined)
        datosSheet.getRange(i + 1, hdrs.GRADO + 1).setValue(grado);
      if (hdrs.CURSO !== undefined)
        datosSheet.getRange(i + 1, hdrs.CURSO + 1).setValue(curso);
    }
  }

  SpreadsheetApp.flush();

  if (updated === 0) {
    return {
      ok:    false,
      error: `No se encontró la clase "${oldCiclo} ${oldGrado} ${oldCurso}" en CONFIGURACION.`
    };
  }

  return {
    ok:      true,
    message: `Clase actualizada a "${ciclo} ${grado} ${curso}". ` +
             `${updated} fila(s) modificada(s) en CONFIGURACION.`
  };
}

// ────────────────────────────────────────────────────────────
// ELIMINAR CLASE
// ────────────────────────────────────────────────────────────

function deleteClass(p) {
  const { ciclo, grado, curso } = p;

  if (!ciclo || !grado || !curso) {
    return { ok: false, error: 'Ciclo, Grado y Curso son obligatorios.' };
  }

  const ss = getSpreadsheet();

  // ── DATOS (primero, para no afectar índices de otras hojas) ──
  const datosSheet = ss.getSheetByName('DATOS');
  if (datosSheet) {
    const hdrs = getHeaderMap(datosSheet);
    const data = datosSheet.getDataRange().getValues();
    // Recorrer de abajo a arriba para que deleteRow no desplace índices
    for (let i = data.length - 1; i >= 1; i--) {
      if (matchesClass(data[i], hdrs, ciclo, grado, curso)) {
        datosSheet.deleteRow(i + 1);
      }
    }
  }

  // ── ALUMNOS ──
  const alumnosSheet = ss.getSheetByName('ALUMNOS');
  if (alumnosSheet) {
    const hdrs = getHeaderMap(alumnosSheet);
    const data = alumnosSheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (matchesClass(data[i], hdrs, ciclo, grado, curso)) {
        alumnosSheet.deleteRow(i + 1);
      }
    }
  }

  // ── CONFIGURACION ──
  // Si la fila tiene también datos de PRUEBA → solo vaciar CICLO/GRADO/CURSO
  // Si la fila es solo de clase (sin PRUEBA)  → eliminar la fila completa
  const configSheet = ss.getSheetByName('CONFIGURACION');
  if (configSheet) {
    const hdrs = getHeaderMap(configSheet);
    const data = configSheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (!matchesClass(data[i], hdrs, ciclo, grado, curso)) continue;

      const tienePrueba = String(data[i][hdrs.PRUEBA] || '').trim() !== '';
      if (tienePrueba) {
        // Limpiar solo los campos de clase; conservar la configuración de prueba
        if (hdrs.CICLO !== undefined) configSheet.getRange(i + 1, hdrs.CICLO + 1).setValue('');
        if (hdrs.GRADO !== undefined) configSheet.getRange(i + 1, hdrs.GRADO + 1).setValue('');
        if (hdrs.CURSO !== undefined) configSheet.getRange(i + 1, hdrs.CURSO + 1).setValue('');
      } else {
        // Fila exclusiva de clase → eliminar
        configSheet.deleteRow(i + 1);
      }
    }
  }

  SpreadsheetApp.flush();

  return {
    ok:      true,
    message: `Clase "${ciclo} ${grado} ${curso}" eliminada junto con sus alumnos y resultados.`
  };
}

// ────────────────────────────────────────────────────────────
// AÑADIR ALUMNO
// ────────────────────────────────────────────────────────────

/**
 * Añade una fila a la hoja ALUMNOS.
 * payload: { ciclo, grado, curso, fullName, gender }
 *   gender: 'M' | 'F'  (la app lo envía como inicial)
 */
function addStudent(p) {
  const { ciclo, grado, curso, fullName, gender } = p;

  if (!ciclo || !grado || !curso) {
    return { ok: false, error: 'Ciclo, Grado y Curso son obligatorios.' };
  }
  if (!fullName) {
    return { ok: false, error: 'El nombre del alumno es obligatorio.' };
  }

  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName('ALUMNOS');
  if (!sheet) return { ok: false, error: 'Hoja ALUMNOS no encontrada.' };

  const hdrs = getHeaderMap(sheet);
  const data = sheet.getDataRange().getValues();

  // Verificar que el alumno no exista ya en esa clase
  for (let i = 1; i < data.length; i++) {
    if (
      matchesClass(data[i], hdrs, ciclo, grado, curso) &&
      String(data[i][hdrs.NOMBRE_ALUMNO] || '').trim() === fullName
    ) {
      return {
        ok:    false,
        error: `El alumno "${fullName}" ya existe en ${ciclo} ${grado} ${curso}.`
      };
    }
  }

  // Convertir inicial de género al texto completo que usa la hoja
  const generoTexto = gender === 'F' ? 'FEMENINO' : 'MASCULINO';

  // Construir nueva fila
  const numCols = sheet.getLastColumn();
  const newRow  = new Array(numCols).fill('');

  if (hdrs.CICLO          !== undefined) newRow[hdrs.CICLO]          = ciclo;
  if (hdrs.GRADO          !== undefined) newRow[hdrs.GRADO]          = grado;
  if (hdrs.CURSO          !== undefined) newRow[hdrs.CURSO]          = curso;
  if (hdrs.NOMBRE_ALUMNO  !== undefined) newRow[hdrs.NOMBRE_ALUMNO]  = fullName;
  if (hdrs.GENERO         !== undefined) newRow[hdrs.GENERO]         = generoTexto;

  sheet.appendRow(newRow);
  SpreadsheetApp.flush();

  return {
    ok:      true,
    message: `Alumno "${fullName}" añadido a ${ciclo} ${grado} ${curso}.`
  };
}

// ────────────────────────────────────────────────────────────
// EDITAR ALUMNO
// ────────────────────────────────────────────────────────────

/**
 * Actualiza NOMBRE_ALUMNO y/o GENERO en ALUMNOS y,
 * si cambió el nombre, también en DATOS.
 * payload: { ciclo, grado, curso, oldFullName, newFullName, gender }
 */
function editStudent(p) {
  const { ciclo, grado, curso, oldFullName, newFullName, gender } = p;

  if (!ciclo || !grado || !curso) {
    return { ok: false, error: 'Ciclo, Grado y Curso son obligatorios.' };
  }
  if (!oldFullName || !newFullName) {
    return { ok: false, error: 'oldFullName y newFullName son obligatorios.' };
  }

  const ss          = getSpreadsheet();
  const generoTexto = gender === 'F' ? 'FEMENINO' : 'MASCULINO';
  let   updated     = 0;

  // ── ALUMNOS ──
  const alumnosSheet = ss.getSheetByName('ALUMNOS');
  if (alumnosSheet) {
    const hdrs = getHeaderMap(alumnosSheet);
    const data = alumnosSheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (
        !matchesClass(data[i], hdrs, ciclo, grado, curso) ||
        String(data[i][hdrs.NOMBRE_ALUMNO] || '').trim() !== oldFullName
      ) continue;

      if (hdrs.NOMBRE_ALUMNO !== undefined)
        alumnosSheet.getRange(i + 1, hdrs.NOMBRE_ALUMNO + 1).setValue(newFullName);
      if (hdrs.GENERO !== undefined)
        alumnosSheet.getRange(i + 1, hdrs.GENERO + 1).setValue(generoTexto);

      updated++;
    }
  }

  if (updated === 0) {
    return {
      ok:    false,
      error: `No se encontró al alumno "${oldFullName}" en ${ciclo} ${grado} ${curso}.`
    };
  }

  // ── DATOS: actualizar NOMBRE_ALUMNO si cambió ──
  if (oldFullName !== newFullName) {
    const datosSheet = ss.getSheetByName('DATOS');
    if (datosSheet) {
      const hdrs = getHeaderMap(datosSheet);
      const data = datosSheet.getDataRange().getValues();

      for (let i = 1; i < data.length; i++) {
        if (
          !matchesClass(data[i], hdrs, ciclo, grado, curso) ||
          String(data[i][hdrs.NOMBRE_ALUMNO] || '').trim() !== oldFullName
        ) continue;

        if (hdrs.NOMBRE_ALUMNO !== undefined)
          datosSheet.getRange(i + 1, hdrs.NOMBRE_ALUMNO + 1).setValue(newFullName);
      }
    }
  }

  SpreadsheetApp.flush();

  return {
    ok:      true,
    message: `Alumno actualizado a "${newFullName}" en ${ciclo} ${grado} ${curso}.`
  };
}

// ────────────────────────────────────────────────────────────
// ELIMINAR ALUMNO
// ────────────────────────────────────────────────────────────

/**
 * Elimina al alumno de ALUMNOS y todos sus resultados de DATOS.
 * payload: { ciclo, grado, curso, fullName }
 */
function deleteStudent(p) {
  const { ciclo, grado, curso, fullName } = p;

  if (!ciclo || !grado || !curso) {
    return { ok: false, error: 'Ciclo, Grado y Curso son obligatorios.' };
  }
  if (!fullName) {
    return { ok: false, error: 'El nombre del alumno es obligatorio.' };
  }

  const ss = getSpreadsheet();

  // ── DATOS (primero, para no desplazar índices de ALUMNOS) ──
  const datosSheet = ss.getSheetByName('DATOS');
  if (datosSheet) {
    const hdrs = getHeaderMap(datosSheet);
    const data = datosSheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (
        matchesClass(data[i], hdrs, ciclo, grado, curso) &&
        String(data[i][hdrs.NOMBRE_ALUMNO] || '').trim() === fullName
      ) {
        datosSheet.deleteRow(i + 1);
      }
    }
  }

  // ── ALUMNOS ──
  const alumnosSheet = ss.getSheetByName('ALUMNOS');
  let deleted = 0;
  if (alumnosSheet) {
    const hdrs = getHeaderMap(alumnosSheet);
    const data = alumnosSheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (
        matchesClass(data[i], hdrs, ciclo, grado, curso) &&
        String(data[i][hdrs.NOMBRE_ALUMNO] || '').trim() === fullName
      ) {
        alumnosSheet.deleteRow(i + 1);
        deleted++;
      }
    }
  }

  SpreadsheetApp.flush();

  if (deleted === 0) {
    return {
      ok:    false,
      error: `No se encontró al alumno "${fullName}" en ${ciclo} ${grado} ${curso}.`
    };
  }

  return {
    ok:      true,
    message: `Alumno "${fullName}" eliminado junto con sus resultados.`
  };
}

function testAddStudent() {
  const result = addStudent({
    ciclo:    'ESO',
    grado:    '1º',
    curso:    'A',
    fullName: 'TEST Borrar, Alumno',
    gender:   'M'
  });
  Logger.log(JSON.stringify(result));
}

function debugAlumnos() {
  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName('ALUMNOS');

  if (!sheet) {
    Logger.log('ERROR: Hoja ALUMNOS no encontrada.');
    Logger.log('Hojas existentes: ' + ss.getSheets().map(s => s.getName()).join(', '));
    return;
  }

  const lastRow  = sheet.getLastRow();
  const lastCol  = sheet.getLastColumn();
  const headers  = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];

  Logger.log('Spreadsheet: ' + ss.getName());
  Logger.log('Última fila: ' + lastRow + ' | Última columna: ' + lastCol);
  Logger.log('Cabeceras fila 1: ' + JSON.stringify(headers));
  Logger.log('Mapa de cabeceras: ' + JSON.stringify(getHeaderMap(sheet)));

  // Intenta escribir una fila directamente
  sheet.appendRow(['DEBUG-CICLO', 'DEBUG-GRADO', 'DEBUG-CURSO', 'DEBUG Alumno', 'MASCULINO']);
  SpreadsheetApp.flush();
  Logger.log('appendRow ejecutado — revisa la hoja ALUMNOS ahora.');
}

// ────────────────────────────────────────────────────────────
// UTILIDAD · comprueba si una fila tiene datos de prueba
// ────────────────────────────────────────────────────────────

function matchesTest(row, hdrs, prueba) {
  return String(row[hdrs.PRUEBA] || '').trim() === prueba;
}

// ────────────────────────────────────────────────────────────
// AÑADIR PRUEBA
// ────────────────────────────────────────────────────────────

/**
 * Añade una fila nueva en CONFIGURACION con los datos de la prueba.
 * payload: { prueba, habilitar, nombrePrueba, unidad,
 *            tipo, objetivo, medio, material, descripcion, valoracion }
 */
function addTest(p) {
  const { prueba, habilitar, nombrePrueba, unidad,
          tipo, objetivo, medio, material, descripcion, valoracion } = p;

  if (!prueba)      return { ok: false, error: 'El identificador PRUEBA es obligatorio.' };
  if (!nombrePrueba) return { ok: false, error: 'NOMBRE_PRUEBA es obligatorio.' };
  if (!unidad)      return { ok: false, error: 'UNIDAD es obligatoria.' };

  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName('CONFIGURACION');
  if (!sheet) return { ok: false, error: 'Hoja CONFIGURACION no encontrada.' };

  const hdrs = getHeaderMap(sheet);
  const data = sheet.getDataRange().getValues();

  // Verificar unicidad del identificador
  for (let i = 1; i < data.length; i++) {
    if (matchesTest(data[i], hdrs, prueba)) {
      return {
        ok:    false,
        error: `Ya existe una prueba con el identificador "${prueba}".`
      };
    }
  }

  const numCols = sheet.getLastColumn();
  const newRow  = new Array(numCols).fill('');

  const set = (col, val) => { if (hdrs[col] !== undefined) newRow[hdrs[col]] = val || ''; };
  set('PRUEBA',       prueba);
  set('HABILITAR',    habilitar || 'SI');
  set('NOMBRE_PRUEBA', nombrePrueba);
  set('UNIDAD',       unidad);
  set('TIPO',         tipo);
  set('OBJETIVO',     objetivo);
  set('MEDIO',        medio);
  set('MATERIAL',     material);
  set('DESCRIPCION',  descripcion);
  set('VALORACION',   valoracion);

  sheet.appendRow(newRow);
  SpreadsheetApp.flush();

  return { ok: true, message: `Prueba "${prueba}" creada correctamente.` };
}

// ────────────────────────────────────────────────────────────
// EDITAR PRUEBA
// ────────────────────────────────────────────────────────────

/**
 * Actualiza los campos de una prueba en todas las filas de CONFIGURACION
 * que tengan ese identificador PRUEBA. No toca campos de clase (CICLO/GRADO/CURSO).
 * payload: { prueba, habilitar, nombrePrueba, unidad,
 *            tipo, objetivo, medio, material, descripcion, valoracion }
 */
function editTest(p) {
  const { prueba, habilitar, nombrePrueba, unidad,
          tipo, objetivo, medio, material, descripcion, valoracion } = p;

  if (!prueba) return { ok: false, error: 'El identificador PRUEBA es obligatorio.' };

  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName('CONFIGURACION');
  if (!sheet) return { ok: false, error: 'Hoja CONFIGURACION no encontrada.' };

  const hdrs = getHeaderMap(sheet);
  const data = sheet.getDataRange().getValues();
  let updated = 0;

  const setCell = (row, col, val) => {
    if (hdrs[col] !== undefined)
      sheet.getRange(row + 1, hdrs[col] + 1).setValue(val || '');
  };

  for (let i = 1; i < data.length; i++) {
    if (!matchesTest(data[i], hdrs, prueba)) continue;

    setCell(i, 'HABILITAR',    habilitar || 'SI');
    setCell(i, 'NOMBRE_PRUEBA', nombrePrueba);
    setCell(i, 'UNIDAD',       unidad);
    setCell(i, 'TIPO',         tipo);
    setCell(i, 'OBJETIVO',     objetivo);
    setCell(i, 'MEDIO',        medio);
    setCell(i, 'MATERIAL',     material);
    setCell(i, 'DESCRIPCION',  descripcion);
    setCell(i, 'VALORACION',   valoracion);

    updated++;
  }

  SpreadsheetApp.flush();

  if (updated === 0) {
    return { ok: false, error: `No se encontró la prueba "${prueba}" en CONFIGURACION.` };
  }

  return { ok: true, message: `Prueba "${prueba}" actualizada en ${updated} fila(s).` };
}

// ────────────────────────────────────────────────────────────
// ACTIVAR / DESACTIVAR PRUEBA
// ────────────────────────────────────────────────────────────

/**
 * Actualiza únicamente el campo HABILITAR de todas las filas con ese PRUEBA.
 * payload: { prueba, habilitar }  →  habilitar: 'SI' | 'NO'
 */
function toggleTest(p) {
  const { prueba, habilitar } = p;

  if (!prueba)    return { ok: false, error: 'El identificador PRUEBA es obligatorio.' };
  if (!habilitar) return { ok: false, error: 'El campo HABILITAR es obligatorio (SI/NO).' };

  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName('CONFIGURACION');
  if (!sheet) return { ok: false, error: 'Hoja CONFIGURACION no encontrada.' };

  const hdrs = getHeaderMap(sheet);
  const data = sheet.getDataRange().getValues();
  let updated = 0;

  for (let i = 1; i < data.length; i++) {
    if (!matchesTest(data[i], hdrs, prueba)) continue;
    if (hdrs.HABILITAR !== undefined)
      sheet.getRange(i + 1, hdrs.HABILITAR + 1).setValue(habilitar);
    updated++;
  }

  SpreadsheetApp.flush();

  if (updated === 0) {
    return { ok: false, error: `No se encontró la prueba "${prueba}" en CONFIGURACION.` };
  }

  return { ok: true, message: `Prueba "${prueba}" → HABILITAR = ${habilitar}.` };
}

// ────────────────────────────────────────────────────────────
// ELIMINAR PRUEBA
// ────────────────────────────────────────────────────────────

/**
 * Elimina la prueba de CONFIGURACION y todos sus resultados de DATOS.
 * - Si la fila tiene también datos de clase (CICLO/GRADO/CURSO) → solo limpia
 *   los campos de prueba, conserva los de clase.
 * - Si la fila es exclusiva de prueba → elimina la fila completa.
 * payload: { prueba }
 */
function deleteTest(p) {
  const { prueba } = p;

  if (!prueba) return { ok: false, error: 'El identificador PRUEBA es obligatorio.' };

  const ss           = getSpreadsheet();
  const testFields   = ['PRUEBA','HABILITAR','NOMBRE_PRUEBA','UNIDAD',
                        'TIPO','OBJETIVO','MEDIO','MATERIAL','DESCRIPCION','VALORACION'];

  // ── DATOS (primero, para no desplazar índices de CONFIGURACION) ──
  const datosSheet = ss.getSheetByName('DATOS');
  if (datosSheet) {
    const hdrs = getHeaderMap(datosSheet);
    const data = datosSheet.getDataRange().getValues();
    for (let i = data.length - 1; i >= 1; i--) {
      if (String(data[i][hdrs.PRUEBA] || '').trim() === prueba) {
        datosSheet.deleteRow(i + 1);
      }
    }
  }

  // ── CONFIGURACION ──
  const configSheet = ss.getSheetByName('CONFIGURACION');
  if (configSheet) {
    const hdrs = getHeaderMap(configSheet);
    const data = configSheet.getDataRange().getValues();

    for (let i = data.length - 1; i >= 1; i--) {
      if (!matchesTest(data[i], hdrs, prueba)) continue;

      const tieneClase = String(data[i][hdrs.CICLO] || '').trim() !== '';
      if (tieneClase) {
        // Limpiar solo los campos de prueba; conservar los de clase
        testFields.forEach(col => {
          if (hdrs[col] !== undefined)
            configSheet.getRange(i + 1, hdrs[col] + 1).setValue('');
        });
      } else {
        // Fila exclusiva de prueba → eliminar
        configSheet.deleteRow(i + 1);
      }
    }
  }

  SpreadsheetApp.flush();

  return { ok: true, message: `Prueba "${prueba}" eliminada junto con sus resultados en DATOS.` };
}

// ────────────────────────────────────────────────────────────
// GUARDAR MEDICIONES (upsert masivo por alumno y trimestre)
// ────────────────────────────────────────────────────────────

/**
 * Upsert masivo de mediciones en la hoja DATOS.
 *
 * Para cada ítem del array recibido:
 *   - Si medicion está vacío  → elimina la fila existente (si la hay).
 *   - Si ya existe una fila   → actualiza MEDICION y BAREMO.
 *   - Si no existe ninguna    → añade una fila nueva.
 *
 * payload: {
 *   measurements: [
 *     {
 *       ciclo, grado, curso,   // identifican la clase
 *       nombreAlumno,          // NOMBRE_ALUMNO tal como está en ALUMNOS
 *       genero,                // 'MASCULINO' | 'FEMENINO'
 *       prueba,                // clave de prueba (PRUEBA)
 *       periodo,               // '1 TRIMESTRE' | '2 TRIMESTRE' | '3 TRIMESTRE'
 *       medicion,              // string numérico, o '' para borrar
 *     },
 *     …
 *   ]
 * }
 */
function saveMeasurements(p) {
  const { measurements } = p;

  if (!Array.isArray(measurements) || measurements.length === 0) {
    return { ok: false, error: 'No se recibieron mediciones.' };
  }

  const ss    = getSpreadsheet();
  const sheet = ss.getSheetByName('DATOS');
  if (!sheet) return { ok: false, error: 'Hoja DATOS no encontrada.' };

  const hdrs = getHeaderMap(sheet);

  // Verificar que las columnas de escritura existen
  const required = ['CICLO','GRADO','GENERO','CURSO','NOMBRE_ALUMNO','PRUEBA','PERIODO','MEDICION'];
  for (const col of required) {
    if (hdrs[col] === undefined) {
      return { ok: false, error: `Columna "${col}" no encontrada en la hoja DATOS.` };
    }
  }

  // Columnas con fórmulas: el script NO escribe valores en ellas.
  // Al insertar una fila nueva, se propaga la fórmula desde la fila anterior.
  const FORMULA_COLS = ['NOMBRE_CORTO', 'POSICION_TABLA_BAREMO', 'BAREMO'];

  let inserted = 0;
  let updated  = 0;
  let deleted  = 0;

  for (const m of measurements) {
    const { ciclo, grado, curso, nombreAlumno, genero, prueba, periodo, medicion } = m;

    if (!ciclo || !grado || !curso || !nombreAlumno || !prueba || !periodo) continue;

    // Leer datos frescos en cada iteración para que los índices sean correctos
    // tras posibles deleteRow anteriores.
    const data = sheet.getDataRange().getValues();

    // Buscar fila existente (clave compuesta)
    let foundRow = -1;
    for (let i = 1; i < data.length; i++) {
      if (
        String(data[i][hdrs.CICLO]          || '').trim() === ciclo        &&
        String(data[i][hdrs.GRADO]          || '').trim() === grado        &&
        String(data[i][hdrs.CURSO]          || '').trim() === curso        &&
        String(data[i][hdrs.NOMBRE_ALUMNO]  || '').trim() === nombreAlumno &&
        String(data[i][hdrs.PRUEBA]         || '').trim() === prueba       &&
        String(data[i][hdrs.PERIODO]        || '').trim() === periodo
      ) {
        foundRow = i + 1; // número de fila (base 1 para Sheets)
        break;
      }
    }

    const medStr = String(medicion ?? '').trim();

    if (medStr === '') {
      // Sin medición → borrar la fila si existe
      if (foundRow !== -1) {
        sheet.deleteRow(foundRow);
        deleted++;
      }
    } else if (foundRow !== -1) {
      // Actualizar fila existente: solo MEDICION y GENERO
      // Las columnas de fórmula (BAREMO, NOMBRE_CORTO, POSICION_TABLA_BAREMO)
      // se recalculan solas; no las tocamos.
      sheet.getRange(foundRow, hdrs.MEDICION + 1).setValue(medStr);
      if (hdrs.GENERO !== undefined)
        sheet.getRange(foundRow, hdrs.GENERO + 1).setValue(genero || '');
      updated++;
    } else {
      // Insertar fila nueva: solo columnas de datos (sin columnas de fórmula)
      const numCols = sheet.getLastColumn();
      const newRow  = new Array(numCols).fill('');
      newRow[hdrs.CICLO]         = ciclo;
      newRow[hdrs.GRADO]         = grado;
      newRow[hdrs.CURSO]         = curso;
      newRow[hdrs.NOMBRE_ALUMNO] = nombreAlumno;
      if (hdrs.GENERO  !== undefined) newRow[hdrs.GENERO]  = genero || '';
      newRow[hdrs.PRUEBA]   = prueba;
      newRow[hdrs.PERIODO]  = periodo;
      newRow[hdrs.MEDICION] = medStr;
      sheet.appendRow(newRow);

      // Propagar fórmulas desde la fila anterior hacia la fila recién insertada
      const lastRow = sheet.getLastRow();
      if (lastRow >= 3) {
        for (const col of FORMULA_COLS) {
          if (hdrs[col] !== undefined) {
            const srcRange  = sheet.getRange(lastRow - 1, hdrs[col] + 1);
            const destRange = sheet.getRange(lastRow,     hdrs[col] + 1);
            srcRange.copyTo(destRange, SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
          }
        }
      }

      inserted++;
    }
  }

  SpreadsheetApp.flush();

  return {
    ok:      true,
    message: `Mediciones guardadas: ${inserted} nuevas, ${updated} actualizadas, ${deleted} eliminadas.`
  };
}

```

---

## 4. Redesplegar el script

Cada vez que modificas el código del script es necesario crear una **nueva
implementación** para que los cambios sean efectivos en el endpoint `/exec`.

1. En el editor de Apps Script, haz clic en **Implementar → Administrar
   implementaciones**.
2. Selecciona la implementación existente (`API Clases v1`) y haz clic en el
   icono del lápiz (editar).
3. En el campo **Versión**, elige **Nueva versión**.
4. Añade una descripción opcional.
5. Haz clic en **Implementar**.

> La URL del Web App **no cambia** — no hace falta actualizar `data.js`.

---

## 5. Modificar `app.js` para persistir alumnos

Las funciones `saveNew()` y `delete()` actuales solo actualizan
los arrays en memoria. Hay que hacerlas `async` y añadir las llamadas a `callGAS`.

---

## 6. Pruebas manuales

### Desde la consola del navegador

Abre las DevTools (F12) → pestaña **Consola** con la app cargada:

```js
// ── Añadir un alumno de prueba ──
window.__callGAS('addStudent', {
  ciclo: 'ESO', grado: '1º', curso: 'A',
  fullName: 'Prueba López, Juan',
  gender: 'M'
}).then(r => console.log(r));

// ── Editar el alumno (cambiar nombre y género) ──
window.__callGAS('editStudent', {
  ciclo: 'ESO', grado: '1º', curso: 'A',
  oldFullName: 'Prueba López, Juan',
  newFullName: 'Prueba López, Juana',
  gender: 'F'
}).then(r => console.log(r));

// ── Eliminar el alumno ──
window.__callGAS('deleteStudent', {
  ciclo: 'ESO', grado: '1º', curso: 'A',
  fullName: 'Prueba López, Juana'
}).then(r => console.log(r));
```

Respuesta esperada en cada operación exitosa:

```json
{ "ok": true, "message": "..." }
```

### Desde el editor de Apps Script

Añade una función de prueba temporal y ejecútala con el botón ▶:

```javascript
function testAddStudent() {
  const result = addStudent({
    ciclo: 'ESO', grado: '1º', curso: 'A',
    fullName: 'Prueba López, Juan',
    gender: 'M'
  });
  Logger.log(JSON.stringify(result));
}

function testDeleteStudent() {
  const result = deleteStudent({
    ciclo: 'ESO', grado: '1º', curso: 'A',
    fullName: 'Prueba López, Juan'
  });
  Logger.log(JSON.stringify(result));
}
```

---

## 7. Solución de problemas frecuentes

| Síntoma | Causa probable | Solución |
|---|---|---|
| `Hoja no encontrada` | Nombre de pestaña distinto | Verifica que la pestaña sea exactamente (mayúsculas, sin tilde) |
| `El "..." ya existe` | Nombre idéntico en la misma clase | Normal — es una protección contra duplicados; revisa el nombre |
| `No se encontró  "..."` | El nombre en la app difiere del de la hoja (espacios, puntos, tildes) | Comprueba la celda en la hoja; el matching es exacto |
| Error CORS en el navegador | Web App no redesplegd tras el cambio | Crea una nueva versión en "Administrar implementaciones" |
| El alumno se añade en la app pero no en la hoja | `GAS_URL` incorrecta o script no redesplegd | Verifica que la URL termine en `/exec` y que la versión sea la última |
| Los cambios no se ven al recargar la app | El CSV publicado tarda en actualizarse (~1 min) | Espera un momento y recarga la página |
| `Acción no reconocida: ` | `switch` en `doPost` no fue actualizado | Añade los tres nuevos `case` y redesplega |

---

## Resumen de cambios en el proyecto

El script de Google Apps Script vive en [script.google.com](https://script.google.com),
**fuera** del repositorio local, vinculado al mismo Google Spreadsheet de la app.
