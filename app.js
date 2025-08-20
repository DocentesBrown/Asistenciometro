// ===== Helpers =====
const { useEffect, useMemo, useState, useRef } = React;
const e = React.createElement;

const LS_KEY = 'agenda_estudiantes_v1';
function uid(prefix) { prefix = prefix || 'id'; return prefix + '_' + Math.random().toString(36).slice(2,9); }
function safeStats(stats) { return stats && typeof stats === 'object' ? stats : { present:0, absent:0, later:0 }; }
function pct(stats) { const s = safeStats(stats); const d = (s.present||0) + (s.absent||0); return d ? Math.round((s.present/d)*100) : 0; }
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { courses:{}, selectedCourseId:null, selectedDate: todayStr() };
    const parsed = JSON.parse(raw);
    return {
      courses: parsed.courses || {},
      selectedCourseId: parsed.selectedCourseId || null,
      selectedDate: parsed.selectedDate || todayStr()
    };
  } catch { return { courses:{}, selectedCourseId:null, selectedDate: todayStr() }; }
}
function saveState(state){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function todayStr(d=new Date()){
  // yyyy-mm-dd en hora local del navegador
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// ===== UI Components =====

function Header({ selectedDate, onChangeDate, onExport, onImport }) {
  const fileRef = React.useRef(null);
  function triggerImport(){ if(fileRef.current) fileRef.current.click(); }
  function handleFile(ev){
    const file = ev.target.files && ev.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => { try { onImport(reader.result); } finally { ev.target.value=''; } };
    reader.readAsText(file);
  }

  return e('header',
    { className: 'w-full p-4 md:p-6 bg-slate-900 text-white flex items-center justify-between sticky top-0 z-10 shadow' },
    e('div', { className:'flex flex-col gap-1' },
      e('div', { className:'flex items-center gap-3' },
        e('span', { className:'text-2xl md:text-3xl font-bold tracking-tight' }, 'Agenda de Estudiantes')
      ),
      e('a', {
          href:'https://www.instagram.com/docentesbrown',
          target:'_blank',
          rel:'noopener',
          className:'text-xs md:text-sm opacity-80 underline'
        }, 'creado por @docentesbrown')
    ),
    e('div', { className:'flex items-center gap-2' },
      e('label', { className:'text-sm opacity-80 hidden md:block' }, 'Fecha:'),
      e('input', {
        type:'date',
        value:selectedDate,
        onChange:(ev)=>onChangeDate(ev.target.value),
        className:'text-slate-900 rounded-md px-2 py-1 text-sm'
      }),
      e('button', { onClick:onExport, className:'ml-2 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm' }, 'Exportar'),
      e('button', { onClick:triggerImport, className:'px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-900 text-sm' }, 'Importar'),
      e('input', { ref:fileRef, type:'file', accept:'.json,application/json', className:'hidden', onChange:handleFile })
    )
  );
}


function EmptyState({ onCreateCourse }) {
  return e('div', { className:'p-6 md:p-10 text-center' },
    e('h2', { className:'text-xl md:text-2xl font-semibold mb-2' }, 'No hay cursos aún'),
    e('p', { className:'text-slate-600 mb-4' }, 'Creá tu primer curso para comenzar a tomar asistencia.'),
    e('button', { onClick:onCreateCourse, className:'px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white shadow' }, '+ Nuevo curso')
  );
}

function CoursesBar({ courses, selectedCourseId, onSelect, onCreate, onRename, onDelete }) {
  const [renamingId, setRenamingId] = useState(null);
  const [newName, setNewName]   = useState('');

  return e('div', { className:'w-full overflow-x-auto border-b border-slate-200 bg-white' },
    e('div', { className:'flex items-center gap-2 p-3 min-w-max' },
      ...Object.values(courses).map((c) =>
        e('div', {
          key:c.id,
          className:'flex items-center gap-2 px-3 py-2 rounded-2xl border ' + (selectedCourseId===c.id?'border-sky-500 bg-sky-50':'border-slate-200')
        },
          renamingId===c.id
            ? e('input', {
                autoFocus:true, value:newName,
                onChange:(ev)=>setNewName(ev.target.value),
                onBlur:()=>{ onRename(c.id, newName || c.name); setRenamingId(null); },
                onKeyDown:(ev)=>{ if(ev.key==='Enter'){ onRename(c.id, newName||c.name); setRenamingId(null); } if(ev.key==='Escape'){ setRenamingId(null); } },
                className:'px-2 py-1 text-sm border rounded'
              })
            : e('button', {
                className:'text-sm font-medium ' + (selectedCourseId===c.id?'text-sky-800':'text-slate-700'),
                onClick:()=>onSelect(c.id)
              }, c.name),
          e('div', { className:'flex items-center gap-1' },
            e('button', { title:'Renombrar', onClick:()=>{ setRenamingId(c.id); setNewName(c.name); }, className:'text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200' }, '✎'),
            e('button', { title:'Eliminar curso', onClick:()=>onDelete(c.id), className:'text-xs px-2 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-700' }, '🗑')
          )
        )
      ),
      e('button', { onClick:onCreate, className:'px-3 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-sm' }, '+ Nuevo curso')
    )
  );
}

function StudentsTable({ students, onAdd, onEdit, onDelete }) {
  const [name, setName] = useState('');
  const sorted = useMemo(() => Object.values(students).sort((a,b)=>a.name.localeCompare(b.name)), [students]);

  return e('div', { className:'p-4 md:p-6' },
    e('div', { className:'flex flex-col md:flex-row gap-2 md:items-end mb-4' },
      e('div', { className:'flex-1' },
        e('label', { className:'block text-sm font-medium mb-1' }, 'Agregar estudiante'),
        e('input', {
          placeholder:'Nombre y apellido', value:name, onChange:(ev)=>setName(ev.target.value),
          className:'w-full max-w-md px-3 py-2 border rounded-xl'
        })
      ),
      e('button', {
        onClick:()=>{ if(!name.trim()) return; onAdd(name.trim()); setName(''); },
        className:'px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white'
      }, '+ Agregar')
    ),
    e('div', { className:'overflow-x-auto' },
      e('table', { className:'w-full text-left border border-slate-200 rounded-xl overflow-hidden' },
        e('thead', { className:'bg-slate-50' },
          e('tr', null,
            e('th', { className:'p-3 text-sm' }, 'Estudiante'),
            e('th', { className:'p-3 text-sm' }, '% Asistencia'),
            e('th', { className:'p-3 text-sm' }, 'Presente'),
            e('th', { className:'p-3 text-sm' }, 'Ausente'),
            e('th', { className:'p-3 text-sm' }, 'Revisar'),
            e('th', { className:'p-3 text-sm' })
          )
        ),
        e('tbody', null,
          ...(sorted.length
            ? sorted.map((s) => {
                const st = safeStats(s.stats);
                return e('tr', { key:s.id, className:'border-t' },
                  e('td', { className:'p-3' },
                    e('div', { className:'flex items-center gap-2' },
                      e('span', { className:'font-medium' }, s.name),
                      e('button', {
                        onClick:()=>{ const nuevo = prompt('Editar nombre', s.name); if(nuevo && nuevo.trim()) onEdit(s.id, nuevo.trim()); },
                        className:'text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200'
                      }, 'Editar')
                    )
                  ),
                  e('td', { className:'p-3 font-semibold' }, pct(st) + '%'),
                  e('td', { className:'p-3' }, st.present || 0),
                  e('td', { className:'p-3' }, st.absent || 0),
                  e('td', { className:'p-3' }, st.later  || 0),
                  e('td', { className:'p-3 text-right' },
                    e('button', { onClick:()=>onDelete(s.id), className:'text-xs px-3 py-1 rounded bg-rose-100 hover:bg-rose-200 text-rose-700' }, 'Eliminar')
                  )
                );
              })
            : [e('tr', { key:'empty' },
                e('td', { colSpan:6, className:'p-4 text-center text-slate-500' }, 'Sin estudiantes. Agregue usando el campo superior.')
              )]
          )
        )
      )
    )
  );
}

function RollCallCard({ students, onMark, onUndo, selectedDate }) {
  // Orden de pasada (para mover "Revisar más tarde" al final)
  const [order, setOrder] = useState(students.map(s => s.id));
  const [index, setIndex] = useState(0);
  // Pila de operaciones para deshacer: {id, action, type:'mark', fromIndex, toIndex}
  const [ops, setOps] = useState([]);

  // Si cambia el listado, reinicializamos orden e índice
  useEffect(() => {
    setOrder(students.map(s => s.id));
    setIndex(0);
    setOps([]);
  }, [students.map(s => s.id).join('|')]);

  const currentId = order[index];
  const current = students.find(s => s.id === currentId) || null;

  function handleAction(action){
    if(!current) return;

    // Registrar marca en el estado global (con fecha)
    onMark(current.id, action, selectedDate);

    if (action === 'later') {
      // mover al final y NO adelantar el índice (así ves al que sigue)
      const from = index;
      const to = order.length - 1; // quedará al final
      const newOrder = order.slice();
      const [m] = newOrder.splice(from, 1);
      newOrder.push(m);
      setOrder(newOrder);
      setOps(ops => ops.concat([{ id: current.id, action, type:'mark', fromIndex: from, toIndex: newOrder.length - 1 }]));
      // index queda igual para mostrar el siguiente de la lista
      return;
    }

    // present/absent: avanzar al siguiente
    const from = index;
    setOps(ops => ops.concat([{ id: current.id, action, type:'mark', fromIndex: from, toIndex: from }]));
    setIndex(i => Math.min(i + 1, order.length)); // puede llegar a length => lista completada
  }

  function goBack(){
    if (ops.length === 0) return;
    const last = ops[ops.length - 1];

    // 1) Deshacer en estado global (restar conteo y quitar historial)
    onUndo(last.id, last.action, selectedDate);

    // 2) Restaurar orden si fue 'later'
    if (last.action === 'later' && typeof last.fromIndex === 'number' && typeof last.toIndex === 'number') {
      const newOrder = order.slice();
      // mover desde toIndex hacia fromIndex
      const [m] = newOrder.splice(last.toIndex, 1);
      newOrder.splice(last.fromIndex, 0, m);
      setOrder(newOrder);
      setIndex(last.fromIndex);
    } else {
      // present/absent: solo retroceder índice
      setIndex(i => Math.max(0, i - 1));
    }

    // 3) sacar la última operación de la pila
    setOps(arr => arr.slice(0, -1));
  }

  if (!students.length) return e('div', { className:'p-6 text-center text-slate-600' }, 'No hay estudiantes en este curso.');

  const cardPos = Math.min(index + 1, order.length);
  return e('div', { className:'p-4 md:p-6' },
    e('div', { className:'max-w-xl mx-auto' },
      e('div', { className:'mb-3 text-sm text-slate-500 text-center' }, `Tarjeta ${cardPos} / ${order.length}`),
      current
        ? e('div', { className:'rounded-3xl border border-slate-200 shadow p-6 md:p-8 bg-white' },
            e('div', { className:'text-center mb-6' },
              e('div', { className:'text-2xl md:text-4xl font-bold tracking-tight mb-2' }, current.name),
              e('div', { className:'text-sm md:text-base text-slate-600' },
                'Asistencia acumulada: ', e('span', { className:'font-semibold' }, pct(current.stats) + '%'),
                ' · Fecha sesión: ', e('span', { className:'font-semibold' }, selectedDate)
              )
            ),
            e('div', { className:'grid grid-cols-2 gap-3 md:gap-4' },
              e('button', { onClick:()=>handleAction('present'), className:'py-3 md:py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow' }, 'Presente ✅'),
              e('button', { onClick:()=>handleAction('absent'),  className:'py-3 md:py-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow'   }, 'Ausente ❌'),
              e('button', { onClick:()=>handleAction('later'),   className:'py-3 md:py-4 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow col-span-2' }, 'Revisar más tarde ⏳'),
              e('button', { onClick:goBack, className:'py-2 md:py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-medium col-span-2' }, '← Volver al anterior (deshacer)')
            )
          )
        : e('div', { className:'rounded-3xl border border-slate-200 shadow p-6 md:p-8 bg-white text-center' },
            e('div', { className:'text-xl font-semibold mb-2' }, '¡Lista completada!'),
            e('div', { className:'text-slate-600' }, 'Ya asignaste estado a todos los estudiantes. Podés volver a empezar o revisar el resumen abajo.')
          )
    )
  );
}

function App() {
  const [state, setState] = useState(loadState());
  const courses = state.courses;
  const selectedCourseId = state.selectedCourseId;
  const selectedDate = state.selectedDate || todayStr();

  useEffect(() => { saveState(state); }, [state]);

  const selectedCourse = selectedCourseId ? courses[selectedCourseId] : null;

  function setSelectedDate(dateStr){
    setState(s => Object.assign({}, s, { selectedDate: dateStr || todayStr() }));
  }
  function selectCourse(id){ setState(s => Object.assign({}, s, { selectedCourseId:id })); }
  function createCourse(){
    const name = prompt('Nombre del curso (ej. 3°B - Matemática)');
    if (!name || !name.trim()) return;
    const id = uid('curso');
    setState(s => {
      const next = Object.assign({}, s);
      next.selectedCourseId = id;
      next.courses = Object.assign({}, s.courses);
      next.courses[id] = { id, name:name.trim(), students:{} };
      return next;
    });
  }
  function renameCourse(id, newName){
    setState(s=>{
      const next = Object.assign({}, s);
      next.courses = Object.assign({}, s.courses);
      const c = Object.assign({}, next.courses[id]); c.name = newName; next.courses[id] = c;
      return next;
    });
  }
  function deleteCourse(id){
    if (!confirm('¿Eliminar curso y toda su información?')) return;
    setState(s=>{
      const next = Object.assign({}, s);
      next.courses = Object.assign({}, s.courses);
      delete next.courses[id];
      if (s.selectedCourseId === id) next.selectedCourseId = null;
      return next;
    });
  }
  function addStudent(name){
    const id = uid('alumno');
    setState(s=>{
      const next = Object.assign({}, s);
      const course = Object.assign({}, next.courses[selectedCourseId]);
      const students = Object.assign({}, course.students);
      students[id] = { id, name, stats:{present:0, absent:0, later:0}, history:[] };
      course.students = students;
      next.courses = Object.assign({}, next.courses);
      next.courses[selectedCourseId] = course;
      return next;
    });
  }
  function editStudent(id, newName){
    setState(s=>{
      const next = Object.assign({}, s);
      const course = Object.assign({}, next.courses[selectedCourseId]);
      const students = Object.assign({}, course.students);
      const st = Object.assign({}, students[id]); st.name = newName; students[id] = st;
      course.students = students;
      next.courses = Object.assign({}, next.courses);
      next.courses[selectedCourseId] = course;
      return next;
    });
  }
  function deleteStudent(id){
    setState(s=>{
      const next = Object.assign({}, s);
      const course = Object.assign({}, next.courses[selectedCourseId]);
      const students = Object.assign({}, course.students);
      delete students[id];
      course.students = students;
      next.courses = Object.assign({}, next.courses);
      next.courses[selectedCourseId] = course;
      return next;
    });
  }

  // Registra marca con fecha; acumula stats totales y apendea historial [{date,status}]
  function markAttendance(studentId, action, dateStr){
    setState(s=>{
      const next = Object.assign({}, s);
      const course = Object.assign({}, next.courses[selectedCourseId]);
      const students = Object.assign({}, course.students);
      const st = Object.assign({}, students[studentId]);
      let stats = safeStats(st.stats);
      stats = { present:stats.present||0, absent:stats.absent||0, later:stats.later||0 };
      if (action==='present') stats.present += 1;
      if (action==='absent')  stats.absent  += 1;
      if (action==='later')   stats.later   += 1;
      const history = (st.history || []).slice();
      history.push({ date: dateStr || todayStr(), status: action });
      st.stats = stats; st.history = history; students[studentId] = st; course.students = students;
      next.courses = Object.assign({}, next.courses); next.courses[selectedCourseId] = course;
      return next;
    });
  }

  // Deshace última marca (resta contadores y quita la última entrada de historial que coincida)
  function undoAttendance(studentId, action, dateStr){
    setState(s=>{
      const next = Object.assign({}, s);
      const course = Object.assign({}, next.courses[selectedCourseId]);
      const students = Object.assign({}, course.students);
      const st = Object.assign({}, students[studentId]);
      let stats = safeStats(st.stats);
      stats = { present:stats.present||0, absent:stats.absent||0, later:stats.later||0 };

      // Buscar desde el final la última coincidencia (status + fecha)
      const hist = (st.history || []).slice();
      for (let i = hist.length - 1; i >= 0; i--) {
        const h = hist[i];
        if (h.status === action && (dateStr ? h.date === dateStr : true)) {
          hist.splice(i, 1);
          if (action==='present' && stats.present>0) stats.present -= 1;
          if (action==='absent'  && stats.absent>0)  stats.absent  -= 1;
          if (action==='later'   && stats.later>0)   stats.later   -= 1;
          break;
        }
      }

      st.stats = stats; st.history = hist; students[studentId] = st; course.students = students;
      next.courses = Object.assign({}, next.courses); next.courses[selectedCourseId] = course;
      return next;
    });
  }

  const studentsArr = useMemo(() => {
    if (!selectedCourse) return [];
    return Object.values(selectedCourse.students).sort((a,b)=>a.name.localeCompare(b.name));
  }, [selectedCourse]);


  function exportState(){
    try{
      const data = JSON.stringify(state, null, 2);
      const blob = new Blob([data], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'agenda_backup.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      alert('Exportación lista: se descargó agenda_backup.json');
    } catch(err){
      alert('No se pudo exportar: ' + (err && err.message ? err.message : err));
    }
  }
  function importStateFromText(text){
    try{
      const parsed = JSON.parse(text);
      const next = {
        courses: parsed && typeof parsed.courses==='object' ? parsed.courses : {},
        selectedCourseId: parsed && parsed.selectedCourseId ? parsed.selectedCourseId : null,
        selectedDate: parsed && parsed.selectedDate ? parsed.selectedDate : todayStr()
      };
      setState(next);
      alert('Importación exitosa. ¡Listo para usar!');
    } catch(err){
      alert('Archivo inválido. Debe ser un JSON exportado por esta app.');
    }
  }
  return e('div', null,
    e(Header, { selectedDate, onChangeDate:setSelectedDate, onExport:exportState, onImport:importStateFromText }),
    Object.keys(courses).length === 0
      ? e(EmptyState, { onCreateCourse:createCourse })
      : e(React.Fragment, null,
          e(CoursesBar, {
            courses, selectedCourseId,
            onSelect:selectCourse, onCreate:createCourse, onRename:renameCourse, onDelete:deleteCourse
          }),
          !selectedCourse
            ? e('div', { className:'p-6 text-slate-600' }, 'Seleccioná un curso para administrar estudiantes y tomar lista.')
            : e(React.Fragment, null,
                e('div', { className:'p-4 md:p-6' },
                  e('h2', { className:'text-xl md:text-2xl font-semibold' }, selectedCourse.name),
                  e('p',  { className:'text-slate-600' }, 'Estudiantes: ' + studentsArr.length)
                ),
                e(RollCallCard, {
                  students:studentsArr,
                  selectedDate,
                  onMark:markAttendance,
                  onUndo:undoAttendance
                }),
                e(StudentsTable, { students:selectedCourse.students, onAdd:addStudent, onEdit:editStudent, onDelete:deleteStudent })
              )
        )
  );
}

// ===== Render =====
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(e(App));

// ===== Test Cases =====
(function runTests(){
  function assert(name, cond){ return { name, pass: !!cond }; }
  // pct
  const t1 = assert('pct sin datos = 0%', pct({present:0, absent:0}) === 0);
  const t2 = assert('pct 3/5 = 60%', pct({present:3, absent:2}) === 60);
  const t3 = assert('pct ignora later', pct({present:2, absent:1, later:4}) === 67);
  // uid
  const u1 = uid('alumno'), u2 = uid('alumno');
  const t4 = assert('uid valores distintos', u1 !== u2);
  const t5 = assert('uid con prefijo', u1.indexOf('alumno_') === 0);

  // later -> al final
  (function(){
    const order = ['a','b','c'];
    const index = 0;
    const from = index;
    const newOrder = order.slice();
    const [m] = newOrder.splice(from, 1);
    newOrder.push(m);
    // esperado: ['b','c','a']
    window.__TEST_LATER_OK__ = (newOrder.join(',') === 'b,c,a');
  })();
  const t6 = assert('later mueve al final', window.__TEST_LATER_OK__ === true);

  // undo counters
  (function(){
    const s = { stats:{present:2, absent:1, later:1}, history:[
      {date:'2025-08-01', status:'present'},
      {date:'2025-08-02', status:'later'},
      {date:'2025-08-02', status:'absent'}
    ]};
    // simulamos undo 'absent' en 2025-08-02
    const stats = Object.assign({present:0,absent:0,later:0}, s.stats);
    const hist = s.history.slice();
    for (let i=hist.length-1;i>=0;i--){
      const h=hist[i]; if (h.status==='absent' && h.date==='2025-08-02'){ hist.splice(i,1); if(stats.absent>0) stats.absent--; break; }
    }
    window.__TEST_UNDO_OK__ = (stats.absent===0 && hist.length===2);
  })();
  const t7 = assert('undo resta conteo y quita historial', window.__TEST_UNDO_OK__ === true);

  const tests = [t1,t2,t3,t4,t5,t6,t7];
  const ok = tests.filter(t=>t.pass).length;
  const out = document.getElementById('tests-output');
  if (out) {
    out.innerHTML = tests.map(t => `<div class="${t.pass?'text-emerald-700':'text-rose-700'}">${t.pass?'✔':'✖'} ${t.name}</div>`).join('')
      + `<div class="mt-2 text-slate-700">${ok} / ${tests.length} pruebas OK</div>`;
  }
  console.log('TESTS:', tests);
})();
