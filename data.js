
// URLS de las hojas de calculo (formato CSV para poder parsear)
export const URLS = {
    ALUMNOS:       "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ0vU155axyNEvUVrz8T-ygOr8T4VZ8lOKTXZ0rT7C1pYKz4XfWNmoOD7Xfd49QJirwUi9Q59aK01OW/pub?gid=594249441&single=true&output=csv",
    CONFIGURACION: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ0vU155axyNEvUVrz8T-ygOr8T4VZ8lOKTXZ0rT7C1pYKz4XfWNmoOD7Xfd49QJirwUi9Q59aK01OW/pub?gid=0&single=true&output=csv",
    DATOS:         "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ0vU155axyNEvUVrz8T-ygOr8T4VZ8lOKTXZ0rT7C1pYKz4XfWNmoOD7Xfd49QJirwUi9Q59aK01OW/pub?gid=1735801903&single=true&output=csv",
    BAREMOS:       "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ0vU155axyNEvUVrz8T-ygOr8T4VZ8lOKTXZ0rT7C1pYKz4XfWNmoOD7Xfd49QJirwUi9Q59aK01OW/pub?gid=728908977&single=true&output=csv"
};

export const GAS_URL = 'https://script.google.com/macros/s/AKfycbzVjEcxKZvTqrObNPm8Q-ejJKefmMTMip3E91mnzsw0-dxUq9JSFExvrlb4GgGTEHs/exec';

// Función para obtener y parsear CSV
export async function fetchCSV(url) {
    const bust = `&t=${Date.now()}`;
    const r = await fetch(url + bust, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    return csvToObjects(text);
}

// Función para obtener las filas sin parsear
export async function fetchCSVRows(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    return csvToRows(text);
}

// Convierte CSV a array de filas (sin convertir a objetos)
function csvToRows(csv) {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let insideQuotes = false;

    for (let i = 0; i < csv.length; i++) {
        const char = csv[i];
        const nextChar = csv[i + 1];

        if (char === '"') {
            if (insideQuotes && nextChar === '"') {
                currentField += '"';
                i++;
            } else {
                insideQuotes = !insideQuotes;
            }
        } else if (char === ',' && !insideQuotes) {
            currentRow.push(currentField.trim());
            currentField = '';
        } else if ((char === '\n' || (char === '\r' && nextChar !== '\n')) && !insideQuotes) {
            if (char === '\r' && nextChar === '\n') i++;
            currentRow.push(currentField.trim());
            currentField = '';
            if (currentRow.some(field => field !== '')) rows.push(currentRow);
            currentRow = [];
        } else {
            currentField += char;
        }
    }

    if (currentField.trim() !== '' || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some(field => field !== '')) rows.push(currentRow);
    }

    return rows;
}

// Convierte CSV a array de objetos.
// Fila 1 (index 0) = cabeceras, resto = datos.
function csvToObjects(csv) {
    const rows = csvToRows(csv);
    if (rows.length < 2) return [];
    const headers = rows[0];
    const dataRows = rows.slice(1);
    return dataRows.map(r =>
        Object.fromEntries(headers.map((h, i) => [h ? h.trim() : `col_${i}`, (r[i] ?? '').trim()]))
    );
}

// Carga todas las hojas en paralelo
export async function loadAllData() {
    const settled = await Promise.allSettled([
        fetchCSV(URLS.CONFIGURACION),
        fetchCSV(URLS.ALUMNOS),
        fetchCSV(URLS.DATOS),
        fetchCSV(URLS.BAREMOS)
    ]);

    const names = ['CONFIGURACION', 'ALUMNOS', 'DATOS', 'BAREMOS'];
    const [CONFIGURACION, ALUMNOS, DATOS, BAREMOS] = settled.map((result, i) => {
        if (result.status === 'fulfilled') return result.value;
        console.warn(`No se logró cargar la hoja ${names[i]}:`, result.reason?.message || result.reason);
        return [];
    });

    return { CONFIGURACION, ALUMNOS, DATOS, BAREMOS };
}
