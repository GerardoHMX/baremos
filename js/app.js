// ============================================================
// EVALUACIÓN EF · app.js
// Single-page app for a Physical Education teacher.
// Tech: Vanilla JS + Bootstrap 5 (modals/offcanvas/tabs)
//       + Tailwind CSS (layout/styling)
// ============================================================

import { loadAllData, GAS_URL } from './data.js';


// ────────────────────────────────────────────────────────────
// GOOGLE APPS SCRIPT · helper de escritura
// ────────────────────────────────────────────────────────────

async function callGAS(action, payload) {
    const res = await fetch(GAS_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body:    JSON.stringify({ action, payload }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
}


// ────────────────────────────────────────────────────────────
// DATA MODEL  (poblado desde Google Sheets en initApp)
// ────────────────────────────────────────────────────────────

let tests         = [];
let classes       = [];
let students      = [];
let results       = [];
let baremos       = [];
let anioAcademico = '2024-2025'; // se sobreescribe con el valor de CONFIGURACION

// Auto-increment ID counter
let _nextId = 0;
const getNextId = () => ++_nextId;


// ────────────────────────────────────────────────────────────
// INIT · carga datos de las hojas y construye el modelo
// ────────────────────────────────────────────────────────────

async function initApp() {
    showLoading(true);
    try {
        const { CONFIGURACION, ALUMNOS, DATOS, BAREMOS } = await loadAllData();
        baremos = BAREMOS;

        // ── Año académico (CONFIGURACION: columna ANIO_ACADEMICO) ──
        const anioRow = CONFIGURACION.find(row => (row.ANIO_ACADEMICO || '').trim());
        anioAcademico = anioRow ? anioRow.ANIO_ACADEMICO.trim() : '2024-2025';

        // ── Pruebas (CONFIGURACION: PRUEBA/HABILITAR/NOMBRE_PRUEBA/UNIDAD/TIPO/…) ──
        const seenTests = new Set();
        tests = [];
        for (const row of CONFIGURACION) {
            const key = (row.PRUEBA || '').trim();
            if (!key || seenTests.has(key)) continue;
            seenTests.add(key);
            tests.push({
                id:          getNextId(),
                key,
                name:        (row.NOMBRE_PRUEBA || key).trim(),
                unit:        (row.UNIDAD        || '').trim(),
                active:      (row.HABILITAR     || '').trim().toUpperCase() === 'SI',
                tipo:        (row.TIPO          || '').trim(),
                objetivo:    (row.OBJETIVO      || '').trim(),
                medio:       (row.MEDIO         || '').trim(),
                material:    (row.MATERIAL      || '').trim(),
                descripcion: (row.DESCRIPCION   || '').trim(),
                valoracion:  (row.VALORACION    || '').trim(),
            });
        }

        // ── Clases (CONFIGURACION: combinaciones únicas CICLO+GRADO+CURSO) ──
        // ANIO_ACADEMICO se obtiene de la columna A de esa misma hoja.
        const classMap = new Map(); // classKey → class object
        classes = [];
        for (const row of CONFIGURACION) {
            const ciclo = (row.CICLO  || '').trim();
            const grado = (row.GRADO  || '').trim();
            const curso = (row.CURSO  || '').trim();
            if (!ciclo) continue; // fila sin clase (sólo datos de prueba)
            const classKey = `${ciclo}-${grado}-${curso}`;
            if (!classMap.has(classKey)) {
                const cls = {
                    id:   getNextId(),
                    key:  classKey,
                    ciclo, grado, curso,
                    name: `${ciclo} ${grado} ${curso}`.trim(), // CICLO + " " + GRADO + " " + CURSO
                    year: anioAcademico,
                };
                classMap.set(classKey, cls);
                classes.push(cls);
            }
        }
        // Ordenar clases: CICLO descendente, GRADO y CURSO ascendente
        classes.sort((a, b) => {
            const c = (b.ciclo || '').localeCompare(a.ciclo || '', undefined, { sensitivity: 'base' });
            if (c !== 0) return c;
            const g = (a.grado || '').localeCompare(b.grado || '', undefined, { sensitivity: 'base' });
            if (g !== 0) return g;
            return (a.curso || '').localeCompare(b.curso || '', undefined, { sensitivity: 'base' });
        });

        // ── Alumnos (ALUMNOS: CICLO/GRADO/CURSO/NOMBRE_ALUMNO/GENERO) ──
        const studentMap = new Map(); // studentKey → student object
        students = [];
        for (const row of ALUMNOS) {
            const fullName = (row.NOMBRE_ALUMNO || '').trim().replace(/\.$/, '');
            if (!fullName) continue;
            const ciclo = (row.CICLO  || '').trim();
            const grado = (row.GRADO  || '').trim();
            const curso = (row.CURSO  || '').trim();
            const classKey = `${ciclo}-${grado}-${curso}`;
            const cls = classMap.get(classKey);
            if (!cls) continue;

            const parts    = fullName.split(' ');
            const name     = parts[0];
            const surnames = parts.slice(1).join(' ');
            const gender   = (row.GENERO || '').toUpperCase().trim() === 'FEMENINO' ? 'F' : 'M';

            const student = {
                id:       getNextId(),
                classId:  cls.id,
                fullName,
                name,
                surnames,
                gender,
            };
            students.push(student);
            // clave compuesta para cruzar con DATOS
            const studentKey = `${ciclo}-${grado}-${curso}-${fullName}`;
            studentMap.set(studentKey, student);
        }

        // ── Resultados (DATOS: CICLO/GRADO/CURSO/NOMBRE_ALUMNO/PRUEBA/PERIODO/MEDICION/BAREMO) ──
        results = [];
        for (const row of DATOS) {
            const fullName  = (row.NOMBRE_ALUMNO || '').trim().replace(/\.$/, '');
            const ciclo     = (row.CICLO  || '').trim();
            const grado     = (row.GRADO  || '').trim();
            const curso     = (row.CURSO  || '').trim();
            const pruebaKey = (row.PRUEBA || '').trim();
            const periodo   = (row.PERIODO || '').trim();
            const medicion  = (row.MEDICION || '').trim();
            const baremo    = (row.BAREMO  || '').trim();

            const studentKey = `${ciclo}-${grado}-${curso}-${fullName}`;
            const student    = studentMap.get(studentKey);
            const test       = tests.find(t => t.key === pruebaKey);
            const trimester  = parseInt(periodo) || 1; // '1 TRIMESTRE' / '2 TRIMESTRE' / '3 TRIMESTRE' → 1/2/3

            if (!student || !test) continue;

            const baremoVal = parseFloat(baremo);
            results.push({
                studentId:   student.id,
                testId:      test.id,
                trimester,
                measurement: medicion,
                grade:       Number.isFinite(baremoVal) ? baremoVal : null,
            });
        }

    } catch (err) {
        console.error('Error cargando datos desde Google Sheets:', err);
    }

    showLoading(false);
    renderClasses();
    renderTests();
}

function showLoading(show) {
    const el = document.getElementById('loading-overlay');
    if (el) el.classList.toggle('hidden', !show);
}

// ── Toast de notificación (no bloqueante) ─────────────────
function showToast(msg, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const colors = {
        info:    'bg-gray-700 text-white',
        success: 'bg-emerald-600 text-white',
        error:   'bg-red-600 text-white',
    };

    const el = document.createElement('div');
    el.className = `px-4 py-2 rounded-lg text-sm shadow-lg transition-opacity duration-300 ${colors[type] ?? colors.info}`;
    el.textContent = msg;
    container.appendChild(el);

    // Fade-out y eliminar
    setTimeout(() => { el.style.opacity = '0'; }, 2500);
    setTimeout(() => { el.remove(); }, 2800);
}


// ────────────────────────────────────────────────────────────
// STATE
// ────────────────────────────────────────────────────────────
let currentClassId    = null;
let currentTrimester  = 1;
let currentStudentId  = null;
let studentSortBy     = 'name';
let studentSortDir    = 'asc';
let classCicloFilter  = 'TODOS';


// ────────────────────────────────────────────────────────────
// UTILITIES
// ────────────────────────────────────────────────────────────

function gradeColorClass(grade) {
    if (grade >= 7) return 'text-emerald-600 font-semibold';
    if (grade >= 5) return 'text-amber-500 font-semibold';
    return 'text-red-500 font-semibold';
}

function gradeBadgeClass(grade) {
    if (grade >= 7) return 'bg-emerald-50 text-emerald-600 font-semibold';
    if (grade >= 5) return 'bg-amber-50 text-amber-600 font-semibold';
    return 'bg-red-50 text-red-500 font-semibold';
}

const getModal     = id => bootstrap.Modal.getOrCreateInstance(document.getElementById(id));
const getOffcanvas = id => bootstrap.Offcanvas.getOrCreateInstance(document.getElementById(id));
const hideModal    = id => bootstrap.Modal.getInstance(document.getElementById(id))?.hide();
const hideOffcanvas = id => bootstrap.Offcanvas.getInstance(document.getElementById(id))?.hide();

function fieldEmpty(el) {
    if (!el.value.trim()) {
        el.style.borderColor = '#ef4444';
        el.focus();
        setTimeout(() => el.style.borderColor = '', 1500);
        return true;
    }
    return false;
}


// ────────────────────────────────────────────────────────────
// SECTION NAVIGATION
// ────────────────────────────────────────────────────────────

function showSection(name) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-pill').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
        b.removeAttribute('aria-current');
    });
    document.getElementById(`section-${name}`)?.classList.add('active');
    const pill = document.getElementById(`nav-${name}`);
    if (pill) {
        pill.classList.add('active');
        pill.setAttribute('aria-pressed', 'true');
        pill.setAttribute('aria-current', 'page');
    }
    if (name === 'clases')  renderClasses();
    if (name === 'pruebas') renderTests();
    if (name === 'alumnos') renderStudentsTable();
    if (name === 'baremos') renderBaremos();
}


// ════════════════════════════════════════════════════════════
// SECTION 1 · CLASES
// ════════════════════════════════════════════════════════════

function setCicloFilter(ciclo) {
    classCicloFilter = ciclo;
    document.querySelectorAll('.ciclo-filter-btn').forEach(btn => {
        const active = btn.id === `filter-ciclo-${ciclo.toLowerCase()}`;
        btn.classList.toggle('bg-gray-900',  active);
        btn.classList.toggle('text-white',   active);
        btn.classList.toggle('bg-white',     !active);
        btn.classList.toggle('text-gray-600', !active);
    });
    renderClasses();
}

function renderClasses() {
    const grid  = document.getElementById('clases-grid');
    const empty = document.getElementById('clases-empty');

    const filtered = classCicloFilter === 'TODOS'
        ? classes
        : classes.filter(c => c.ciclo.toUpperCase() === classCicloFilter);

    if (filtered.length === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }
    empty.classList.add('hidden');

    grid.innerHTML = filtered.map(cls => {
        const count = students.filter(s => s.classId === cls.id).length;
        return `
      <article class="class-card bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-6">
        <div class="flex items-start justify-between">
          <div>
            <h3 class="text-base sm:text-lg lg:text-xl xl:text-2xl font-bold text-gray-900">${cls.name}</h3>
            <p class="text-sm sm:text-base text-gray-400">${cls.year}</p>
          </div>
          <div class="flex gap-1 -mt-1">
            <button onclick="openEditClassModal(${cls.id})"
              class="p-1.5 border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title="Editar clase">
              ${iconEdit()}
            </button>
            <button onclick="confirmDeleteClass(${cls.id})"
              class="p-1.5 border border-gray-200 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              title="Eliminar clase">
              ${iconTrash()}
            </button>
          </div>
        </div>

        <div class="flex items-center gap-2 text-sm sm:text-base text-gray-500 mb-3">
          <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M17 20H7m10 0a2 2 0 002-2v-1a6 6 0 00-12 0v1a2 2 0 002 2m10 0H7M12 10a4 4 0 100-8 4 4 0 000 8z"/>
          </svg>
          ${count} alumno${count !== 1 ? 's' : ''}
        </div>

        <button onclick="enterClass(${cls.id})"
          class="w-full bg-gray-900 text-white py-1 rounded-lg text-xs sm:text-sm font-medium hover:bg-gray-700 transition-colors">
          Entrar →
        </button>
      </article>
    `;
    }).join('');
}

function enterClass(classId) {
    currentClassId   = classId;
    currentTrimester = 1;

    const cls = classes.find(c => c.id === classId);
    document.getElementById('alumnos-title').textContent = cls.name;

    const toolbar  = document.getElementById('alumnos-toolbar');
    if (toolbar) toolbar.classList.remove('hidden');
    const searchEl = document.getElementById('student-search');
    const genderEl = document.getElementById('student-gender-filter');
    if (searchEl) searchEl.value = '';
    if (genderEl) genderEl.value = 'all';
    studentSortBy  = 'name';
    studentSortDir = 'asc';

    bootstrap.Tab.getOrCreateInstance(document.getElementById('t1-tab')).show();
    showSection('alumnos');
    renderStudentsTable();
}

function applyStudentFilters() {
    renderStudentsTable();
}

function setStudentSort(by) {
    if (studentSortBy === by) {
        studentSortDir = studentSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        studentSortBy  = by;
        studentSortDir = 'asc';
    }
    renderStudentsTable();
}

// ── Class modal ────────────────────────────────────────────

/** Actualiza el campo "Nombre de la clase" concatenando Ciclo + Grado + Curso */
function updateClassName() {
    const ciclo = document.getElementById('ciclo-formativo').value.trim();
    const grado = document.getElementById('grado').value.trim();
    const curso = document.getElementById('curso').value.trim();
    document.getElementById('class-name').value = [ciclo, grado, curso].filter(Boolean).join(' ');
}

function openAddClassModal() {
    document.getElementById('classModalTitle').textContent = 'Añadir clase';
    document.getElementById('class-edit-id').value   = '';
    document.getElementById('class-year').value      = anioAcademico;
    document.getElementById('ciclo-formativo').value = '';
    document.getElementById('grado').value           = '';
    document.getElementById('curso').value           = '';
    document.getElementById('class-name').value      = '';
    getModal('classModal').show();
}

function openEditClassModal(classId) {
    const cls = classes.find(c => c.id === classId);
    // Intentar descomponer el nombre (CICLO GRADO CURSO) si la clase viene de la hoja
    const parts = (cls.name || '').split(' ');
    document.getElementById('classModalTitle').textContent = 'Editar clase';
    document.getElementById('class-edit-id').value   = cls.id;
    document.getElementById('class-year').value      = cls.year;
    document.getElementById('ciclo-formativo').value = cls.ciclo || parts[0] || '';
    document.getElementById('grado').value           = cls.grado || parts[1] || '';
    document.getElementById('curso').value           = cls.curso || parts.slice(2).join(' ') || '';
    document.getElementById('class-name').value      = cls.name;
    getModal('classModal').show();
}

async function saveClass() {
  const cicloEl = document.getElementById('ciclo-formativo');
  const gradoEl = document.getElementById('grado');
  const cursoEl = document.getElementById('curso');
  const yearEl  = document.getElementById('class-year');
  if (fieldEmpty(cicloEl) || fieldEmpty(gradoEl) || fieldEmpty(cursoEl) || fieldEmpty(yearEl)) return;

  const ciclo = cicloEl.value.trim();
  const grado = gradoEl.value.trim();
  const curso = cursoEl.value.trim();
  const year  = yearEl.value.trim();
  const name  = [ciclo, grado, curso].join(' ');
  const id    = document.getElementById('class-edit-id').value;

  hideModal('classModal');

  if (id) {
    // ── Editar clase existente — actualización optimista ──
    const cls      = classes.find(c => c.id === parseInt(id));
    const snapshot = { ciclo: cls.ciclo, grado: cls.grado, curso: cls.curso,
                       name: cls.name, year: cls.year, key: cls.key };
    cls.ciclo = ciclo; cls.grado = grado; cls.curso = curso;
    cls.name  = name;  cls.year  = year;  cls.key   = `${ciclo}-${grado}-${curso}`;
    renderClasses();
    showToast('Guardando…', 'info');
    try {
      const result = await callGAS('editClass', {
        oldCiclo: snapshot.ciclo, oldGrado: snapshot.grado, oldCurso: snapshot.curso,
        ciclo, grado, curso, anioAcademico: year,
      });
      showToast(result.ok ? 'Clase guardada' : `Error: ${result.error}`, result.ok ? 'success' : 'error');
      if (!result.ok) { Object.assign(cls, snapshot); renderClasses(); }
    } catch (err) {
      showToast(`Error de red: ${err.message}`, 'error');
      Object.assign(cls, snapshot); renderClasses();
    }
  } else {
    // ── Añadir nueva clase — actualización optimista ──
    const newCls = { id: getNextId(), key: `${ciclo}-${grado}-${curso}`, ciclo, grado, curso, name, year };
    classes.push(newCls);
    classes.sort((a, b) => {
      const c = (b.ciclo || '').localeCompare(a.ciclo || '', undefined, { sensitivity: 'base' });
      if (c !== 0) return c;
      const g = (a.grado || '').localeCompare(b.grado || '', undefined, { sensitivity: 'base' });
      if (g !== 0) return g;
      return (a.curso || '').localeCompare(b.curso || '', undefined, { sensitivity: 'base' });
    });
    renderClasses();
    showToast('Guardando…', 'info');
    try {
      const result = await callGAS('addClass', { ciclo, grado, curso, anioAcademico: year });
      showToast(result.ok ? 'Clase añadida' : `Error: ${result.error}`, result.ok ? 'success' : 'error');
      if (!result.ok) { classes = classes.filter(c => c !== newCls); renderClasses(); }
    } catch (err) {
      showToast(`Error de red: ${err.message}`, 'error');
      classes = classes.filter(c => c !== newCls); renderClasses();
    }
  }
}

function confirmDeleteClass(classId) {
    const cls = classes.find(c => c.id === classId);
    document.getElementById('confirmDeleteTitle').textContent   = 'Eliminar clase';
    document.getElementById('confirmDeleteMessage').textContent =
        `¿Eliminar la clase "${cls.name}"? Se eliminarán también todos sus alumnos y resultados.`;
    document.getElementById('confirmDeleteBtn').onclick = () => deleteClass(classId);
    getModal('confirmDeleteModal').show();
}

async function deleteClass(classId) {
  const cls = classes.find(c => c.id === classId);
  hideModal('confirmDeleteModal');

  // Actualización optimista
  const removedStudentIds = students.filter(s => s.classId === classId).map(s => s.id);
  const prevClasses  = classes;
  const prevStudents = students;
  const prevResults  = results;
  classes  = classes.filter(c => c.id !== classId);
  students = students.filter(s => s.classId !== classId);
  results  = results.filter(r => !removedStudentIds.includes(r.studentId));
  renderClasses();
  showToast('Guardando…', 'info');

  try {
    const result = await callGAS('deleteClass', { ciclo: cls.ciclo, grado: cls.grado, curso: cls.curso });
    showToast(result.ok ? 'Clase eliminada' : `Error: ${result.error}`, result.ok ? 'success' : 'error');
    if (!result.ok) { classes = prevClasses; students = prevStudents; results = prevResults; renderClasses(); }
  } catch (err) {
    showToast(`Error de red: ${err.message}`, 'error');
    classes = prevClasses; students = prevStudents; results = prevResults; renderClasses();
  }
}


// ════════════════════════════════════════════════════════════
// SECTION 2 · ALUMNOS
// ════════════════════════════════════════════════════════════

function setCurrentTrimester(t) {
    currentTrimester = t;
}

function renderStudentsTable() {
    [1, 2, 3].forEach(t => renderTrimesterTable(t));
}

function renderTrimesterTable(trimester) {
    const container = document.getElementById(`students-table-t${trimester}`);
    if (!container) return;

    const activeTests   = tests.filter(t => t.active);
    let classStudents   = students.filter(s => s.classId === currentClassId);

    if (classStudents.length === 0) {
        container.innerHTML = `
      <div class="text-center py-14">
        <svg class="mx-auto w-10 h-10 text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M17 20H7m10 0a2 2 0 002-2v-1a6 6 0 00-12 0v1a2 2 0 002 2m10 0H7M12 10a4 4 0 100-8 4 4 0 000 8z"/>
        </svg>
        <p class="text-sm sm:text-base text-gray-400">No hay alumnos en esta clase</p>
        <p class="text-sm sm:text-base text-gray-300 mt-1">Añade el primer alumno para comenzar</p>
      </div>`;
        return;
    }

    const searchText   = (document.getElementById('student-search')?.value || '').trim().toLowerCase();
    const genderFilter = document.getElementById('student-gender-filter')?.value || 'all';

    if (searchText) {
        classStudents = classStudents.filter(s => {
            const full = `${s.surnames || ''} ${s.name || ''}`.toLowerCase();
            return full.includes(searchText);
        });
    }
    if (genderFilter !== 'all') {
        classStudents = classStudents.filter(s => s.gender === genderFilter);
    }

    if (classStudents.length === 0) {
        container.innerHTML = `
      <div class="text-center py-14">
        <svg class="mx-auto w-10 h-10 text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <p class="text-sm sm:text-base text-gray-400">Ningún alumno coincide con la búsqueda o el filtro</p>
      </div>`;
        return;
    }

    function studentAvg(student) {
        const grades = activeTests.map(test => {
            const r = results.find(r => r.studentId === student.id && r.testId === test.id && r.trimester === trimester);
            return (r && r.grade !== null) ? r.grade : null;
        }).filter(g => g !== null);
        return grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : 0;
    }

    classStudents = [...classStudents].sort((a, b) => {
        let cmp = 0;
        if (studentSortBy === 'name') {
            const na = `${a.surnames || ''} ${a.name || ''}`.toLowerCase();
            const nb = `${b.surnames || ''} ${b.name || ''}`.toLowerCase();
            cmp = na.localeCompare(nb);
        } else if (studentSortBy === 'gender') {
            cmp = (a.gender || '').localeCompare(b.gender || '');
        } else if (studentSortBy === 'media') {
            cmp = studentAvg(a) - studentAvg(b);
        }
        return studentSortDir === 'desc' ? -cmp : cmp;
    });

    const colAvgs = activeTests.map(test => {
        const grades = classStudents
            .map(s => {
                const r = results.find(r => r.studentId === s.id && r.testId === test.id && r.trimester === trimester);
                return (r && r.grade !== null) ? r.grade : null;
            })
            .filter(g => g !== null);
        return grades.length ? grades.reduce((a, b) => a + b, 0) / grades.length : 0;
    });
    const overallAvg = colAvgs.length ? colAvgs.reduce((a, b) => a + b, 0) / colAvgs.length : 0;

    const testHeaders = activeTests.map(t =>
        `<th class="hidden sm:table-cell text-xs sm:text-sm text-center px-2 sm:px-3 py-3.5 sm:py-3 font-bold uppercase tracking-wide text-gray-600 border-b-2 border-gray-200 whitespace-nowrap" title="${t.name} (${t.unit})">${t.key}</th>`
    ).join('');

    const rows = classStudents.map(student => {
        const rowGrades = activeTests.map(test => {
            const r = results.find(r => r.studentId === student.id && r.testId === test.id && r.trimester === trimester);
            return (r && r.grade !== null) ? r.grade : null;
        });
        const validGrades = rowGrades.filter(g => g !== null);
        const avg = validGrades.length
            ? (validGrades.reduce((a, b) => a + b, 0) / validGrades.length).toFixed(1)
            : '—';

        const gradeCells = rowGrades.map(g =>
            g !== null
                ? `<td class="hidden sm:table-cell text-center px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-100"><span class="${gradeColorClass(g)}">${g.toFixed(1)}</span></td>`
                : `<td class="hidden sm:table-cell text-center text-gray-300 px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-100">—</td>`
        ).join('');
        const displayName = student.fullName;

        return `
      <tr class="odd:bg-white even:bg-slate-50/70 border-b border-gray-100 hover:bg-slate-200/80 transition-colors duration-150 cursor-pointer" onclick="openStudentDrawer(${student.id})">
        <td class="font-medium text-gray-900 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-100">${displayName}</td>
        <td class="hidden sm:table-cell text-xs sm:text-sm text-center text-gray-600 px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-100">${student.gender === 'FEMENINO' ? 'F' : 'M'}</td>
        ${gradeCells}
        <td class="text-xs sm:text-sm text-center font-bold px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-100 ${gradeColorClass(parseFloat(avg) || 0)}">${avg}</td>
        <td class="text-xs sm:text-sm text-right px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-100">
          <div class="flex items-center justify-end gap-1">
            <button onclick="event.stopPropagation(); openEditStudentDrawer(${student.id})"
              class="p-1.5 border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Editar alumno">
              ${iconEdit()}
            </button>
            <button onclick="event.stopPropagation(); confirmDeleteStudent(${student.id})"
              class="p-1.5 border border-gray-200 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar alumno">
              ${iconTrash()}
            </button>
          </div>
        </td>
      </tr>`;
    }).join('');

    const footerCells = colAvgs.map(a =>
        `<td class="hidden sm:table-cell text-center text-xs sm:text-sm px-2 sm:px-3 py-3.5 sm:py-3 font-semibold text-gray-700 bg-slate-100 border-t-2 border-slate-200 ${gradeColorClass(a)}">${a.toFixed(1)}</td>`
    ).join('');

    function sortIcon(column) {
        const active = studentSortBy === column;
        const color  = active ? 'text-gray-700' : 'text-gray-400';
        if (active && studentSortDir === 'desc') {
            return `<svg class="w-3.5 h-3.5 ml-0.5 inline ${color}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>`;
        }
        if (active && studentSortDir === 'asc') {
            return `<svg class="w-3.5 h-3.5 ml-0.5 inline ${color}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>`;
        }
        return `<svg class="w-3.5 h-3.5 ml-0.5 inline ${color} opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/></svg>`;
    }

    const thAlumno = `<th class="text-xs sm:text-sm text-left px-2 sm:px-3 py-3.5 sm:py-3 font-bold uppercase tracking-wide text-gray-600 border-b-2 border-gray-200 whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none" onclick="setStudentSort('name')" title="Ordenar por nombre">Alumno${sortIcon('name')}</th>`;
    const thGenero = `<th class="hidden sm:table-cell text-xs sm:text-sm text-center px-2 sm:px-3 py-3.5 sm:py-3 font-bold uppercase tracking-wide text-gray-600 border-b-2 border-gray-200 whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none" onclick="setStudentSort('gender')" title="Ordenar por género">Género${sortIcon('gender')}</th>`;
    const thMedia  = `<th class="text-xs sm:text-sm text-center px-2 sm:px-3 py-3.5 sm:py-3 font-bold uppercase tracking-wide text-gray-600 border-b-2 border-gray-200 whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none" onclick="setStudentSort('media')" title="Ordenar por media">Media${sortIcon('media')}</th>`;

    container.innerHTML = `
    <table class="w-full border-collapse text-xs sm:text-sm">
      <thead class="sticky top-0 bg-slate-50">
        <tr>
          ${thAlumno}
          ${thGenero}
          ${testHeaders}
          ${thMedia}
          <th class="w-8 px-2 py-3.5 sm:py-3 border-b-2 border-gray-200"></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="sm:hidden">
          <td class="text-xs sm:text-sm px-2 sm:px-3 py-3.5 sm:py-3 font-semibold text-gray-700 bg-slate-100 border-t-2 border-slate-200">Media de la clase</td>
          <td class="text-center text-xs sm:text-sm px-2 sm:px-3 py-3.5 sm:py-3 font-semibold text-gray-700 bg-slate-100 border-t-2 border-slate-200 ${gradeColorClass(overallAvg)}">${overallAvg.toFixed(1)}</td>
          <td class="bg-slate-100 border-t-2 border-slate-200 w-8 py-3.5 sm:py-3"></td>
        </tr>
        <tr class="hidden sm:table-row">
          <td colspan="2" class="text-xs sm:text-sm px-2 sm:px-3 py-3.5 sm:py-3 font-semibold text-gray-700 bg-slate-100 border-t-2 border-slate-200">Media de la clase</td>
          ${footerCells}
          <td class="text-center text-xs sm:text-sm px-2 sm:px-3 py-3.5 sm:py-3 font-semibold text-gray-700 bg-slate-100 border-t-2 border-slate-200 ${gradeColorClass(overallAvg)}">${overallAvg.toFixed(1)}</td>
          <td class="bg-slate-100 border-t-2 border-slate-200 py-3.5 sm:py-3"></td>
        </tr>
      </tfoot>
    </table>`;
}

// ── Add student drawer ─────────────────────────────────────

function openAddStudentDrawer() {
    const cls = classes.find(c => c.id === currentClassId);
    document.getElementById('addStudentDrawerTitle').textContent   = 'Añadir alumno';
    document.getElementById('student-edit-id').value               = '';
    document.getElementById('student-ciclo-display').value         = cls ? cls.ciclo : '';
    document.getElementById('student-grado-display').value         = cls ? cls.grado : '';
    document.getElementById('student-curso-display').value         = cls ? cls.curso : '';
    document.getElementById('student-class-name-display').value    = cls ? cls.name  : '';
    document.getElementById('new-student-nombre-alumno').value     = '';
    document.getElementById('new-student-gender').value            = 'M';
    document.getElementById('addStudentBtn').textContent           = 'Añadir alumno';
    getOffcanvas('addStudentDrawer').show();
}

function openEditStudentDrawer(studentId) {
    const student = students.find(s => s.id === studentId);
    const cls     = classes.find(c => c.id === student.classId);
    document.getElementById('addStudentDrawerTitle').textContent   = 'Editar alumno';
    document.getElementById('student-edit-id').value               = studentId;
    document.getElementById('student-ciclo-display').value         = cls ? cls.ciclo : '';
    document.getElementById('student-grado-display').value         = cls ? cls.grado : '';
    document.getElementById('student-curso-display').value         = cls ? cls.curso : '';
    document.getElementById('student-class-name-display').value    = cls ? cls.name  : '';
    document.getElementById('new-student-nombre-alumno').value     = student.fullName;
    document.getElementById('new-student-gender').value            = student.gender;
    document.getElementById('addStudentBtn').textContent           = 'Guardar cambios';
    getOffcanvas('addStudentDrawer').show();
}

async function saveNewStudent() {
  const nombreEl = document.getElementById('new-student-nombre-alumno');
  if (fieldEmpty(nombreEl)) return;

  const fullName = nombreEl.value.trim();
  const gender   = document.getElementById('new-student-gender').value;
  const editId   = document.getElementById('student-edit-id').value; 

  const cls = classes.find(c => c.id === currentClassId);
  if (!cls) return;

  hideOffcanvas('addStudentDrawer');

  if (editId) {
      // ── Editar alumno existente — actualización optimista ──
      const student   = students.find(s => s.id === parseInt(editId));
      const oldName   = student.fullName;
      const oldGender = student.gender;
      student.fullName = fullName;
      student.gender   = gender;
      renderStudentsTable();
      showToast('Guardando…', 'info');
      try {
          const result = await callGAS('editStudent', {
              ciclo: cls.ciclo, grado: cls.grado, curso: cls.curso,
              oldFullName: oldName, newFullName: fullName, gender,
          });
          showToast(result.ok ? 'Alumno guardado' : `Error: ${result.error}`, result.ok ? 'success' : 'error');
          if (!result.ok) { student.fullName = oldName; student.gender = oldGender; renderStudentsTable(); }
      } catch (err) {
          showToast(`Error de red: ${err.message}`, 'error');
          student.fullName = oldName; student.gender = oldGender; renderStudentsTable();
      }
  } else {
      // ── Añadir nuevo alumno — actualización optimista ──
      const parts      = fullName.split(' ');
      const newStudent = {
          id: getNextId(), classId: currentClassId,
          fullName, name: parts[0], surnames: parts.slice(1).join(' '), gender,
      };
      students.push(newStudent);
      [1, 2, 3].forEach(trimester => {
          tests.forEach(test => {
              results.push({ studentId: newStudent.id, testId: test.id, trimester, measurement: '', grade: 0 });
          });
      });
      renderStudentsTable();
      showToast('Guardando…', 'info');
      try {
          const result = await callGAS('addStudent', {
              ciclo: cls.ciclo, grado: cls.grado, curso: cls.curso, fullName, gender,
          });
          showToast(result.ok ? 'Alumno añadido' : `Error: ${result.error}`, result.ok ? 'success' : 'error');
          if (!result.ok) {
              students = students.filter(s => s !== newStudent);
              results  = results.filter(r => r.studentId !== newStudent.id);
              renderStudentsTable();
          }
      } catch (err) {
          showToast(`Error de red: ${err.message}`, 'error');
          students = students.filter(s => s !== newStudent);
          results  = results.filter(r => r.studentId !== newStudent.id);
          renderStudentsTable();
      }
  }
}

// ── Delete student ─────────────────────────────────────────

function confirmDeleteStudent(studentId) {
    const s = students.find(s => s.id === studentId);
    const displayName = s.surnames ? `${s.surnames}, ${s.name}` : s.name;
    document.getElementById('confirmDeleteTitle').textContent   = 'Eliminar alumno';
    document.getElementById('confirmDeleteMessage').textContent =
        `¿Eliminar a "${displayName}"? Se perderán todos sus resultados.`;
    document.getElementById('confirmDeleteBtn').onclick = () => deleteStudent(studentId);
    getModal('confirmDeleteModal').show();
}

async function deleteStudent(studentId) {
  const student = students.find(s => s.id === studentId);
  const cls     = classes.find(c => c.id === student.classId);
  hideModal('confirmDeleteModal');

  // Actualización optimista
  const prevStudents = students;
  const prevResults  = results;
  students = students.filter(s => s.id !== studentId);
  results  = results.filter(r => r.studentId !== studentId);
  renderStudentsTable();
  showToast('Guardando…', 'info');

  try {
      const result = await callGAS('deleteStudent', {
          ciclo: cls.ciclo, grado: cls.grado, curso: cls.curso, fullName: student.fullName,
      });
      showToast(result.ok ? 'Alumno eliminado' : `Error: ${result.error}`, result.ok ? 'success' : 'error');
      if (!result.ok) { students = prevStudents; results = prevResults; renderStudentsTable(); }
  } catch (err) {
      showToast(`Error de red: ${err.message}`, 'error');
      students = prevStudents; results = prevResults; renderStudentsTable();
  }
}


// ════════════════════════════════════════════════════════════
// STUDENT DETAIL DRAWER
// ════════════════════════════════════════════════════════════

function openStudentDrawer(studentId) {
    currentStudentId = studentId;

    const student = students.find(s => s.id === studentId);
    const cls     = classes.find(c => c.id === student.classId);
    const displayName = student.surnames
        ? `${student.surnames}, ${student.name}`
        : student.name;

    document.getElementById('drawer-student-name').textContent   = displayName;
    document.getElementById('drawer-student-gender').textContent = student.gender === 'F' ? 'FEMENINO' : 'MASCULINO';
    document.getElementById('drawer-student-class').textContent  = cls.name;

    [1, 2, 3].forEach(t => renderDrawerTrimester(studentId, t));
    bootstrap.Tab.getOrCreateInstance(document.getElementById(`dt${currentTrimester}-tab`)).show();
    getOffcanvas('studentDrawer').show();
}

function renderDrawerTrimester(studentId, trimester) {
    const container   = document.getElementById(`drawer-tests-t${trimester}`);
    const activeTests = tests.filter(t => t.active);

    container.innerHTML = activeTests.map(test => {
        const r           = results.find(r => r.studentId === studentId && r.testId === test.id && r.trimester === trimester);
        const measurement = r ? r.measurement : '';
        const grade       = r && measurement !== '' ? r.grade : null;
        const gradeTxt    = grade !== null ? grade.toFixed(1) : '—';
        const badgeCls    = grade !== null ? gradeBadgeClass(grade) : 'bg-gray-100 text-gray-300';
        return `
      <div class="flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 bg-gray-50 border border-gray-100 rounded-xl mb-2">
        <div class="flex-1 min-w-0">
          <p class="text-xs sm:text-sm font-medium text-gray-800">${test.name}</p>
          <p class="text-xs sm:text-sm text-gray-400">${test.unit}</p>
        </div>
        <input type="number" step="0.01" min="0"
          class="w-full max-w-[130px] min-w-[80px] text-xs sm:text-sm border border-gray-200 rounded-lg px-2 py-1.5 text-center bg-white focus:outline-none focus:ring-2 focus:ring-gray-800 focus:border-gray-800"
          value="${measurement}"
          placeholder="—"
          data-student-id="${studentId}"
          data-test-id="${test.id}"
          data-trimester="${trimester}"
          oninput="updateGrade(this)"
        />
        <div class="min-w-[34px] w-10 sm:w-11 text-center text-xs sm:text-sm font-bold py-1 rounded-md ${badgeCls}"
          id="grade-display-${studentId}-${test.id}-${trimester}">
          ${gradeTxt}
        </div>
      </div>`;
    }).join('');

    updateDrawerAverage(studentId, trimester);
}

function updateGrade(input) {
    const studentId = parseInt(input.dataset.studentId);
    const testId    = parseInt(input.dataset.testId);
    const trimester = parseInt(input.dataset.trimester);
    const raw       = input.value.trim();

    let r = results.find(r => r.studentId === studentId && r.testId === testId && r.trimester === trimester);
    if (!r) {
        r = { studentId, testId, trimester, measurement: '', grade: 0 };
        results.push(r);
    }

    r.measurement = raw;
    if (raw !== '' && !isNaN(parseFloat(raw))) {
        r.grade = parseFloat((4 + Math.random() * 6).toFixed(1));
    } else {
        r.grade = 0;
    }

    const badge = document.getElementById(`grade-display-${studentId}-${testId}-${trimester}`);
    if (badge) {
        const baseCls = 'min-w-[34px] w-10 sm:w-11 text-center text-xs sm:text-sm font-bold py-1 rounded-md';
        if (raw !== '') {
            badge.textContent = r.grade.toFixed(1);
            badge.className   = `${baseCls} ${gradeBadgeClass(r.grade)}`;
        } else {
            badge.textContent = '—';
            badge.className   = `${baseCls} bg-gray-100 text-gray-300`;
        }
    }

    updateDrawerAverage(studentId, trimester);
}

function updateDrawerAverage(studentId, trimester) {
    const activeTests = tests.filter(t => t.active);
    const grades = activeTests
        .map(test => {
            const r = results.find(r => r.studentId === studentId && r.testId === test.id && r.trimester === trimester);
            return r && r.measurement !== '' ? r.grade : null;
        })
        .filter(g => g !== null);

    const avgEl = document.getElementById(`drawer-avg-t${trimester}`);
    if (avgEl) {
        if (grades.length > 0) {
            const avg = grades.reduce((a, b) => a + b, 0) / grades.length;
            avgEl.textContent = avg.toFixed(1);
            avgEl.className   = `text-lg sm:text-xl font-bold ${gradeColorClass(avg)}`;
        } else {
            avgEl.textContent = '—';
            avgEl.className   = 'text-lg sm:text-xl font-bold text-gray-400';
        }
    }
}

async function saveStudentResults() {
    const student = students.find(s => s.id === currentStudentId);
    const cls     = student ? classes.find(c => c.id === student.classId) : null;

    if (!student || !cls) {
        hideOffcanvas('studentDrawer');
        renderStudentsTable();
        return;
    }

    // Mapeo trimestre (número) → valor de la columna PERIODO en la hoja
    const PERIODO_MAP = {
        1: '1 TRIMESTRE',
        2: '2 TRIMESTRE',
        3: '3 TRIMESTRE',
    };

    // Construir el array de mediciones del alumno para TODOS los trimestres
    // (permitirá borrar datos de trimestres si se dejaron vacíos)
    const measurements = [];
    for (const trimester of [1, 2, 3]) {
        const periodo = PERIODO_MAP[trimester];
        for (const test of tests) {
            const r = results.find(
                r => r.studentId === currentStudentId &&
                     r.testId    === test.id          &&
                     r.trimester === trimester
            );
            measurements.push({
                ciclo:        cls.ciclo,
                grado:        cls.grado,
                curso:        cls.curso,
                nombreAlumno: student.fullName,
                genero:       student.gender === 'F' ? 'FEMENINO' : 'MASCULINO',
                prueba:       test.key,
                periodo,
                medicion:     r ? (r.measurement ?? '') : '',
            });
        }
    }

    // Cerrar drawer de inmediato — los datos ya están en memoria
    hideOffcanvas('studentDrawer');
    renderStudentsTable();
    showToast('Guardando…', 'info');

    try {
        const result = await callGAS('saveMeasurements', { measurements });
        showToast(result.ok ? 'Mediciones guardadas' : `Error: ${result.error}`, result.ok ? 'success' : 'error');
    } catch (err) {
        showToast(`Error de red: ${err.message}`, 'error');
    }
}


// ════════════════════════════════════════════════════════════
// SECTION 3 · PRUEBAS Y BAREMOS
// ════════════════════════════════════════════════════════════

function renderTests() {
    const tbody = document.getElementById('pruebas-tbody');
    if (!tbody) return;

    tbody.innerHTML = tests.map(test => `
    <tr class="odd:bg-white even:bg-slate-50/70 border-b border-gray-100 hover:bg-slate-200/80 transition-colors duration-150">
      <td class="text-gray-900 font-medium text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-100">${test.name}</td>
      <td class="text-gray-500 text-xs sm:text-sm px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-100">${test.unit}</td>
      <td class="px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-100">
        <label class="toggle-wrap">
          <input type="checkbox" class="toggle-input"
            ${test.active ? 'checked' : ''}
            onchange="toggleTest(${test.id}, this.checked)" />
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
        </label>
      </td>
      <td class="text-right px-2 sm:px-3 py-1.5 sm:py-2 border-b border-slate-100">
        <div class="flex items-center justify-end gap-1">
          <button onclick="openEditTestModal(${test.id})"
            class="p-1.5 border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            title="Editar prueba">
            ${iconEdit()}
          </button>
          <button onclick="confirmDeleteTest(${test.id})"
            class="p-1.5 border border-gray-200 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
            title="Eliminar prueba">
            ${iconTrash()}
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function toggleTest(testId, active) {
    const test = tests.find(t => t.id === testId);
    if (!test) return;
    test.active = active; // actualización optimista
    try {
        const result = await callGAS('toggleTest', {
            prueba:    test.key,
            habilitar: active ? 'SI' : 'NO',
        });
        if (!result.ok) {
            test.active = !active; // revertir
            renderTests();
            showToast(`Error: ${result.error}`, 'error');
        }
    } catch (err) {
        test.active = !active; // revertir
        renderTests();
        showToast(`Error de red: ${err.message}`, 'error');
    }
}

function openAddTestModal() {
    document.getElementById('testModalTitle').textContent  = 'Añadir prueba';
    document.getElementById('test-edit-id').value         = '';
    document.getElementById('test-prueba').value          = '';
    document.getElementById('test-prueba').disabled       = false;
    document.getElementById('test-habilitar').checked     = true;
    document.getElementById('test-name').value            = '';
    document.getElementById('test-unit').value            = '';
    document.getElementById('test-tipo').value            = '';
    document.getElementById('test-objetivo').value        = '';
    document.getElementById('test-medio').value           = '';
    document.getElementById('test-material').value        = '';
    document.getElementById('test-descripcion').value     = '';
    document.getElementById('test-valoracion').value      = '';
    getModal('testModal').show();
}

function openEditTestModal(testId) {
    const test = tests.find(t => t.id === testId);
    document.getElementById('testModalTitle').textContent  = 'Editar prueba';
    document.getElementById('test-edit-id').value         = test.id;
    document.getElementById('test-prueba').value          = test.key;
    document.getElementById('test-prueba').disabled       = true;
    document.getElementById('test-habilitar').checked     = test.active;
    document.getElementById('test-name').value            = test.name;
    document.getElementById('test-unit').value            = test.unit;
    document.getElementById('test-tipo').value            = test.tipo        || '';
    document.getElementById('test-objetivo').value        = test.objetivo    || '';
    document.getElementById('test-medio').value           = test.medio       || '';
    document.getElementById('test-material').value        = test.material    || '';
    document.getElementById('test-descripcion').value     = test.descripcion || '';
    document.getElementById('test-valoracion').value      = test.valoracion  || '';
    getModal('testModal').show();
}

async function saveTest() {
    const pruebaEl = document.getElementById('test-prueba');
    const nameEl   = document.getElementById('test-name');
    const unitEl   = document.getElementById('test-unit');
    if (fieldEmpty(pruebaEl) || fieldEmpty(nameEl) || fieldEmpty(unitEl)) return;

    const id          = document.getElementById('test-edit-id').value;
    const prueba      = pruebaEl.value.trim().toUpperCase();
    const active      = document.getElementById('test-habilitar').checked;
    const name        = nameEl.value.trim();
    const unit        = unitEl.value.trim();
    const tipo        = document.getElementById('test-tipo').value.trim();
    const objetivo    = document.getElementById('test-objetivo').value.trim();
    const medio       = document.getElementById('test-medio').value.trim();
    const material    = document.getElementById('test-material').value.trim();
    const descripcion = document.getElementById('test-descripcion').value.trim();
    const valoracion  = document.getElementById('test-valoracion').value.trim();

    if (!id && tests.some(t => t.key === prueba)) {
        pruebaEl.style.borderColor = '#ef4444';
        pruebaEl.focus();
        setTimeout(() => pruebaEl.style.borderColor = '', 2000);
        showToast(`Ya existe una prueba con el identificador "${prueba}"`, 'error');
        return;
    }

    hideModal('testModal');

    if (id) {
        // ── Editar prueba — actualización optimista ──
        const test     = tests.find(t => t.id === parseInt(id));
        const snapshot = { ...test };
        Object.assign(test, { active, name, unit, tipo, objetivo, medio, material, descripcion, valoracion });
        renderTests();
        showToast('Guardando…', 'info');
        try {
            const result = await callGAS('editTest', {
                prueba, habilitar: active ? 'SI' : 'NO',
                nombrePrueba: name, unidad: unit,
                tipo, objetivo, medio, material, descripcion, valoracion,
            });
            showToast(result.ok ? 'Prueba guardada' : `Error: ${result.error}`, result.ok ? 'success' : 'error');
            if (!result.ok) { Object.assign(test, snapshot); renderTests(); }
        } catch (err) {
            showToast(`Error de red: ${err.message}`, 'error');
            Object.assign(test, snapshot); renderTests();
        }
    } else {
        // ── Añadir prueba — actualización optimista ──
        const newTest = { id: getNextId(), key: prueba, name, unit, active, tipo, objetivo, medio, material, descripcion, valoracion };
        tests.push(newTest);
        renderTests();
        showToast('Guardando…', 'info');
        try {
            const result = await callGAS('addTest', {
                prueba, habilitar: active ? 'SI' : 'NO',
                nombrePrueba: name, unidad: unit,
                tipo, objetivo, medio, material, descripcion, valoracion,
            });
            showToast(result.ok ? 'Prueba añadida' : `Error: ${result.error}`, result.ok ? 'success' : 'error');
            if (!result.ok) { tests = tests.filter(t => t !== newTest); renderTests(); }
        } catch (err) {
            showToast(`Error de red: ${err.message}`, 'error');
            tests = tests.filter(t => t !== newTest); renderTests();
        }
    }
}

function confirmDeleteTest(testId) {
    const test = tests.find(t => t.id === testId);
    document.getElementById('confirmDeleteTitle').textContent   = 'Eliminar prueba';
    document.getElementById('confirmDeleteMessage').textContent =
        `¿Eliminar la prueba "${test.name}"? Se eliminarán todos los resultados asociados.`;
    document.getElementById('confirmDeleteBtn').onclick = () => deleteTest(testId);
    getModal('confirmDeleteModal').show();
}

async function deleteTest(testId) {
    const test = tests.find(t => t.id === testId);
    hideModal('confirmDeleteModal');

    // Actualización optimista
    const prevTests   = tests;
    const prevResults = results;
    tests   = tests.filter(t => t.id !== testId);
    results = results.filter(r => r.testId !== testId);
    renderTests();
    showToast('Guardando…', 'info');

    try {
        const result = await callGAS('deleteTest', { prueba: test.key });
        showToast(result.ok ? 'Prueba eliminada' : `Error: ${result.error}`, result.ok ? 'success' : 'error');
        if (!result.ok) { tests = prevTests; results = prevResults; renderTests(); }
    } catch (err) {
        showToast(`Error de red: ${err.message}`, 'error');
        tests = prevTests; results = prevResults; renderTests();
    }
}


// ────────────────────────────────────────────────────────────
// INLINE SVG ICONS
// ────────────────────────────────────────────────────────────

function iconEdit() {
    return `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5
         m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
  </svg>`;
}

function iconTrash() {
    return `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7
         m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
  </svg>`;
}


// ════════════════════════════════════════════════════════════
// SECTION 4 · TABLA BAREMOS (consulta)
// ════════════════════════════════════════════════════════════

const BAREMOS_SCORE_COLS = ['1','1.5','2','2.5','3','3.5','4','4.5','5','5.5','6','6.5','7','7.5','8','8.5','9','9.5','10'];

let baremosSortBy  = 'PRUEBA';
let baremosSortDir = 'asc';

function setBaremosSort(col) {
    if (baremosSortBy === col) {
        baremosSortDir = baremosSortDir === 'asc' ? 'desc' : 'asc';
    } else {
        baremosSortBy  = col;
        baremosSortDir = 'asc';
    }
    applyBaremosFilters();
}

function _baremosDataRows() {
    // Excluye filas de cabecera repetidas dentro del CSV (CICLO === 'CICLO')
    return baremos.filter(r => r.CICLO && r.CICLO !== 'CICLO' && r.PRUEBA && r.PRUEBA !== 'PRUEBA' && r.PRUEBA !== 'PRUEBA / PUNTUACION');
}

function _populateBaremosFilters() {
    const data = _baremosDataRows();
    const fill = (id, values) => {
        const sel = document.getElementById(id);
        if (!sel || sel.dataset.populated) return;
        values.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = v;
            sel.appendChild(opt);
        });
        sel.dataset.populated = '1';
    };
    fill('baremos-filter-ciclo',  [...new Set(data.map(r => r.CICLO))].sort());
    fill('baremos-filter-grado',  [...new Set(data.map(r => r.GRADO))].sort((a, b) => +a - +b));
    fill('baremos-filter-genero', [...new Set(data.map(r => r.GENERO))].sort());
    fill('baremos-filter-prueba', [...new Set(data.map(r => r.PRUEBA))].sort());
}

function renderBaremos() {
    _populateBaremosFilters();
    applyBaremosFilters();
}

function applyBaremosFilters() {
    const ciclo  = document.getElementById('baremos-filter-ciclo')?.value  || '';
    const grado  = document.getElementById('baremos-filter-grado')?.value  || '';
    const genero = document.getElementById('baremos-filter-genero')?.value || '';
    const prueba = document.getElementById('baremos-filter-prueba')?.value || '';

    let data = _baremosDataRows();
    if (ciclo)  data = data.filter(r => r.CICLO  === ciclo);
    if (grado)  data = data.filter(r => r.GRADO  === grado);
    if (genero) data = data.filter(r => r.GENERO === genero);
    if (prueba) data = data.filter(r => r.PRUEBA === prueba);

    data = [...data].sort((a, b) => {
        const va = (a[baremosSortBy] ?? '').toLowerCase();
        const vb = (b[baremosSortBy] ?? '').toLowerCase();
        return baremosSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });

    const wrap = document.getElementById('baremos-table-wrap');
    if (!wrap) return;

    if (!data.length) {
        wrap.innerHTML = `<div class="text-center py-12 text-gray-400 text-sm">Sin resultados para los filtros seleccionados</div>`;
        return;
    }

    const thFix   = 'text-xs font-bold uppercase tracking-wide text-white border-b-2 border-gray-700 whitespace-nowrap px-3 py-3 text-left bg-gray-800';
    const thSort  = 'text-xs font-bold uppercase tracking-wide text-white border-b-2 border-gray-700 whitespace-nowrap px-3 py-3 text-left bg-gray-800 cursor-pointer select-none hover:bg-gray-700';
    const thScore = 'text-xs font-bold uppercase tracking-wide text-gray-300 border-b-2 border-gray-700 whitespace-nowrap px-3 py-3 text-right bg-gray-800';
    const tdFix   = 'px-3 py-2 text-xs border-b border-gray-200 whitespace-nowrap font-semibold text-gray-900 sticky left-0 bg-slate-100 border-r border-gray-200';
    const tdMeta  = 'px-3 py-2 text-xs border-b border-gray-100 whitespace-nowrap text-gray-600';
    const tdScore = 'px-3 py-2 text-xs border-b border-gray-100 whitespace-nowrap text-right text-gray-700';

    const sortIcon = col => {
        if (baremosSortBy !== col) return ' <span class="opacity-30">⇅</span>';
        return baremosSortDir === 'asc' ? ' <span>↑</span>' : ' <span>↓</span>';
    };

    const scoreThs = BAREMOS_SCORE_COLS.map((c, i) => `<th class="${thScore}" data-col="${i + 5}">${c}</th>`).join('');

    const rows = data.map(r => {
        const unit = tests.find(t => t.key === r.PRUEBA)?.unit ?? '';
        const scoreTds = BAREMOS_SCORE_COLS.map((c, i) => `<td class="${tdScore}" data-col="${i + 5}">${r[c] ?? ''}</td>`).join('');
        return `<tr>
            <td class="${tdFix}" data-col="0">${r.PRUEBA}</td>
            <td class="${tdMeta}" data-col="1">${unit}</td>
            <td class="${tdMeta}" data-col="2">${r.CICLO}</td>
            <td class="${tdMeta}" data-col="3">${r.GRADO}</td>
            <td class="${tdMeta}" data-col="4">${r.GENERO}</td>
            ${scoreTds}
        </tr>`;
    }).join('');

    wrap.innerHTML = `<table class="w-full border-collapse text-xs sm:text-sm">
        <thead class="sticky top-0">
            <tr>
                <th class="${thSort} sticky left-0 z-10" data-col="0" onclick="setBaremosSort('PRUEBA')">Prueba${sortIcon('PRUEBA')}</th>
                <th class="${thFix}" data-col="1">Unidad</th>
                <th class="${thSort}" data-col="2" onclick="setBaremosSort('CICLO')">Ciclo${sortIcon('CICLO')}</th>
                <th class="${thFix}" data-col="3">Grado</th>
                <th class="${thSort}" data-col="4" onclick="setBaremosSort('GENERO')">Género${sortIcon('GENERO')}</th>
                ${scoreThs}
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>`;

    // Cross-highlight: resalta fila + columna de la celda señalada
    const table = wrap.querySelector('table');
    table.addEventListener('mouseover', e => {
        const td = e.target.closest('td');
        if (!td) return;
        const col = td.dataset.col;
        table.querySelectorAll('.bh-row, .bh-col, .bh-cell').forEach(el =>
            el.classList.remove('bh-row', 'bh-col', 'bh-cell'));
        td.closest('tr').querySelectorAll('td').forEach(c => c.classList.add('bh-row'));
        table.querySelectorAll(`[data-col="${col}"]`).forEach(c => c.classList.add('bh-col'));
        td.classList.remove('bh-row', 'bh-col');
        td.classList.add('bh-cell');
    });
    table.addEventListener('mouseleave', () => {
        table.querySelectorAll('.bh-row, .bh-col, .bh-cell').forEach(el =>
            el.classList.remove('bh-row', 'bh-col', 'bh-cell'));
    });
}

function resetBaremosFilters() {
    ['baremos-filter-ciclo','baremos-filter-grado','baremos-filter-genero','baremos-filter-prueba']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    applyBaremosFilters();
}


// ────────────────────────────────────────────────────────────
// EXPOSE FUNCTIONS TO WINDOW (requerido por inline handlers
// cuando app.js se carga como módulo ES)
// ────────────────────────────────────────────────────────────

Object.assign(window, {
    showSection,
    setCicloFilter,
    openAddClassModal,
    openEditClassModal,
    saveClass,
    updateClassName,
    confirmDeleteClass,
    enterClass,
    applyStudentFilters,
    setStudentSort,
    openAddStudentDrawer,
    openEditStudentDrawer,
    saveNewStudent,
    confirmDeleteStudent,
    openStudentDrawer,
    updateGrade,
    saveStudentResults,
    openAddTestModal,
    openEditTestModal,
    saveTest,
    confirmDeleteTest,
    toggleTest,
    setCurrentTrimester,
    applyBaremosFilters,
    resetBaremosFilters,
    setBaremosSort,
});


// ────────────────────────────────────────────────────────────
// INITIALISATION
// ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

// Exponer callGAS en window para poder probarlo desde la consola del navegador
window.__callGAS = callGAS; 
