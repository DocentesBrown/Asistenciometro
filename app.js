// ===== Helpers =====
const { useEffect, useMemo, useState, useRef } = React;
const e = React.createElement;

const LS_KEY = 'agenda_estudiantes_v1';
function uid(prefix) { prefix = prefix || 'id'; return prefix + '_' + Math.random().toString(36).slice(2,9); }
function safeStats(stats) { return stats && typeof stats === 'object' ? stats : { present:0, absent:0, later:0 }; }
function pct(stats) { const s = safeStats(stats); const d = (s.present||0) + (s.absent||0); return d ? Math.round((s.present/d)*100) : 0; }
function todayStr(d=new Date()){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function loadState() {
  // Por defecto SIEMPRE mostrar la fecha de HOY (se puede modificar luego)
  try {
    const raw = localStorage.getItem(LS_KEY);
    const base = { courses:{}, selectedCourseId:null, selectedDate: todayStr() };
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    return {
      courses: parsed.courses || {},
      selectedCourseId: parsed.selectedCourseId || null,
      // ignoramos la fecha guardada y arrancamos siempre en "hoy"
      selectedDate: todayStr()
    };
  } catch {
    return { courses:{}, selectedCourseId:null, selectedDate: todayStr() };
  }
}
function saveState(state){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }

// ===== UI Components =====

function Header({ selectedDate, onChangeDate }) {
  return e('header',
    { className: 'w-full p-4 md:p-6 text-white flex items-center justify-between sticky top-0 z-10 shadow',
      style:{ background:'#24496e' } },
    e('div', { className:'flex flex-col gap-1' },
      e('div', { className:'flex items-center gap-3' },
        e('span', { className:'text-2xl md:text-3xl font-bold tracking-tight' }, 'Asistencia de Estudiantes')
      ),
      e('a', {
          href:'https://www.instagram.com/docentesbrown',
          target:'_blank',
          rel:'noopener',
          className:'text-xs md:text-sm underline',
          style:{ opacity:.9 }
        }, 'creado por @docentesbrown')
    ),
    e('div', { className:'flex items-center gap-2' },
      e('label', { className:'text-sm opacity-90 hidden md:block' }, 'Fecha:'),
      e('input', {
        type:'date',
        value:selectedDate,
        onChange:(ev)=>onChangeDate(ev.target.value),
        className:'rounded-md px-2 py-1 text-sm',
        style:{ color:'#24496e' }
      })
    )
  );
}

function EmptyState({ onCreateCourse }) {
  return e('div', { className:'p-6 md:p-10 text-center' },
    e('h2', { className:'text-xl md:text-2xl font-semibold mb-2', style:{ color:'#24496e' } }, 'No hay cursos aún'),
    e('p', { className:'text-slate-700 mb-4' }, 'Creá tu primer curso para comenzar a tomar asistencia.'),
    e('button', { onClick:onCreateCourse,
      className:'px-4 py-2 rounded-xl text-white shadow',
      style:{ background:'#6c467e' } }, '+ Nuevo curso')
  );
}

function CoursesBar({ courses, selectedCourseId, onSelect, onCreate, onRename, onDelete }) {
  const [renamingId, setRenamingId] = useState(null);
  const [newName, setNewName]   = useState('');

  return e('div', { className:'w-full overflow-x-auto border-b border-slate-300 bg-white' },
    e('div', { className:'flex items-center gap-2 p-3 min-w-max' },
      ...Object.values(courses).map((c) =>
        e('div', {
          key:c.id,
          className:'flex items-center gap-2 px-3 py-2 rounded-2xl border',
          style: selectedCourseId===c.id
            ? { borderColor:'#24496e', background:'#f0f4f8' }
            : { borderColor:'#d7dbe0' }
        },
          renamingId===c.id
            ? e('input', {
                autoFocus:true, value:newName,
                onChange:(ev)=>setNewName(ev.target.value),
                onBlur:()=>{ onRename(c.id, newName || c.name); setRenamingId(null); },
                onKeyDown:(ev)=>{ if(ev.key==='Enter'){ onRename(c.id, newName||c.name); setRenamingId(null); } if(ev.key==='Escape'){ setRenamingId(null); } },
                className:'px-2 py-1 text-sm border rounded',
                style:{ borderColor:'#d7dbe0' }
              })
            : e('button', {
                className:'text-sm font-medium',
                style:{ color: selectedCourseId===c.id ? '#24496e' : '#334155' },
                onClick:()=>onSelect(c.id)
              }, c.name),
          e('div', { className:'flex items-center gap-1' },
            e('button', { title:'Renombrar',
              onClick:()=>{ setRenamingId(c.id); setNewName(c.name); },
              className:'text-xs px-2 py-1 rounded',
              style:{ background:'#f3efdc', color:'#24496e' } }, '✎'),
            e('button', { title:'Eliminar curso', onClick:()=>onDelete(c.id),
              className:'text-xs px-2 py-1 rounded',
              style:{ background:'#fde2e0', color:'#da6863' } }, '🗑')
          )
        )
      ),
      e('button', { onClick:onCreate,
        className:'px-3 py-2 rounded-2xl text-sm',
        style:{ background:'#f3efdc', color:'#24496e' } }, '+ Nuevo curso')
    )
  );
}

function StudentsTable({ students, onAdd, onEdit, onDelete, onShowAbsences }) {
  const [name, setName] = useState('');
  const sorted = useMemo(() => Object.values(students).sort((a,b)=>a.name.localeCompare(b.name)), [students]);

  return e('div', { className:'p-4 md:p-6' },
    e('div', { className:'flex flex-col md:flex-row gap-2 md:items-end mb-4' },
      e('div', { className:'flex-1' },
        e('label', { className:'block text-sm font-medium mb-1', style:{ color:'#24496e' } }, 'Agregar estudiante'),
        e('input', {
          placeholder:'Nombre y apellido', value:name, onChange:(ev)=>setName(ev.target.value),
          className:'w-full max-w-md px-3 py-2 border rounded-xl',
          style:{ borderColor:'#d7dbe0' }
        })
      ),
      e('button', {
        onClick:()=>{ if(!name.trim()) return; onAdd(name.trim()); setName(''); },
        className:'px-4 py-2 rounded-xl text-white',
        style:{ background:'#6c467e' }
      }, '+ Agregar')
    ),
    e('div', { className:'overflow-x-auto' },
      e('table', { className:'w-full text-left border rounded-xl overflow-hidden', style:{ borderColor:'#d7dbe0' } },
        e('thead', { style:{ background:'#f7f8fa' } },
          e('tr', null,
            e('th', { className:'p-3 text-sm', style:{ color:'#24496e' } }, 'Estudiante'),
            e('th', { className:'p-3 text-sm', style:{ color:'#24496e' } }, '% Asistencia'),
            e('th', { className:'p-3 text-sm', style:{ color:'#24496e' } }, 'Presente'),
            e('th', { className:'p-3 text-sm', style:{ color:'#24496e' } }, 'Ausente'),
            e('th', { className:'p-3 text-sm' })
          )
        ),
        e('tbody', null,
          ...(sorted.length
            ? sorted.map((s) => {
                const st = safeStats(s.stats);
                return e('tr', { key:s.id, className:'border-t', style:{ borderColor:'#e5e7eb' } },
                  e('td', { className:'p-3' },
                    e('div', { className:'flex items-center gap-2' },
                      e('span', { className:'font-medium' }, s.name),
                      e('button', {
                        onClick:()=>{ const nuevo = prompt('Editar nombre', s.name); if(nuevo && nuevo.trim()) onEdit(s.id, nuevo.trim()); },
                        className:'text-xs px-2 py-1 rounded',
                        style:{ background:'#f3efdc', color:'#24496e' }
                      }, 'Editar')
                    )
                  ),
                  e('td', { className:'p-3 font-semibold', style:{ color:'#24496e' } }, pct(st) + '%'),
                  e('td', { className:'p-3' }, st.present || 0),
                  e('td', { className:'p-3' },
                    e('div', { className:'flex items-center gap-2' },
                      e('span', null, st.absent || 0),
                      e('button', {
                        onClick:()=>onShowAbsences(s),
                        className:'text-xs px-2 py-1 rounded',
                        style:{ background:'#f3efdc', color:'#24496e' }
                      }, 'Fechas')
                    )
                  ),
                  e('td', { className:'p-3 text-right' },
                    e('button', { onClick:()=>onDelete(s.id),
                      className:'text-xs px-3 py-1 rounded',
                      style:{ background:'#fde2e0', color:'#da6863' } }, 'Eliminar')
                  )
                );
              })
            : [e('tr', { key:'empty' },
                e('td', { colSpan:5, className:'p-4 text-center text-slate-500' }, 'Sin estudiantes. Agregue usando el campo superior.')
              )]
          )
        )
      )
    )
  );
}

function RollCallCard({ students, onMark, onUndo, selectedDate }) {
  const [order, setOrder] = useState(students.map(s => s.id));
  const [index, setIndex] = useState(0);
  const [ops, setOps] = useState([]);

  useEffect(() => {
    setOrder(students.map(s => s.id));
    setIndex(0);
    setOps([]);
  }, [students.map(s => s.id).join('|')]);

  const currentId = order[index];
  const current = students.find(s => s.id === currentId) || null;

  function handleAction(action){
    if(!current) return;
    onMark(current.id, action, selectedDate);

    if (action === 'later') {
      const from = index;
      const newOrder = order.slice();
      const [m] = newOrder.splice(from, 1);
      newOrder.push(m);
      setOrder(newOrder);
      setOps(ops => ops.concat([{ id: current.id, action, type:'mark', fromIndex: from, toIndex: newOrder.length - 1 }]));
      return;
    }
    const from = index;
    setOps(ops => ops.concat([{ id: current.id, action, type:'mark', fromIndex: from, toIndex: from }]));
    setIndex(i => Math.min(i + 1, order.length));
  }

  function goBack(){
    if (ops.length === 0) return;
    const last = ops[ops.length - 1];
    onUndo(last.id, last.action, selectedDate);

    if (last.action === 'later' && typeof last.fromIndex === 'number' && typeof last.toIndex === 'number') {
      const newOrder = order.slice();
      const [m] = newOrder.splice(last.toIndex, 1);
      newOrder.splice(last.fromIndex, 0, m);
      setOrder(newOrder);
      setIndex(last.fromIndex);
    } else {
      setIndex(i => Math.max(0, i - 1));
    }
    setOps(arr => arr.slice(0, -1));
  }

  if (!students.length) return e('div', { className:'p-6 text-center text-slate-600' }, 'No hay estudiantes en este curso.');

  const cardPos = Math.min(index + 1, order.length);
  return e('div', { className:'p-4 md:p-6' },
    e('div', { className:'max-w-xl mx-auto' },
      e('div', { className:'mb-3 text-sm text-slate-600 text-center' }, `Tarjeta ${cardPos} / ${order.length}`),
      current
        ? e('div', { className:'rounded-3xl border shadow p-6 md:p-8 bg-white', style:{ borderColor:'#d7dbe0' } },
            e('div', { className:'text-center mb-6' },
              e('div', { className:'text-2xl md:text-4xl font-bold tracking-tight mb-2', style:{ color:'#24496e' } }, current.name),
              e('div', { className:'text-sm md:text-base text-slate-700' },
                'Asistencia acumulada: ', e('span', { className:'font-semibold', style:{ color:'#24496e' } }, pct(current.stats) + '%'),
                ' · Fecha sesión: ', e('span', { className:'font-semibold', style:{ color:'#24496e' } }, selectedDate)
              )
            ),
            e('div', { className:'grid grid-cols-2 gap-3 md:gap-4' },
              // Presente (verde suave)
              e('button', {
                onClick:()=>handleAction('present'),
                className:'py-3 md:py-4 rounded-2xl font-semibold border',
                style:{ background:'#e8f7ef', borderColor:'#cdebdc', color:'#166534' } // verde suave
              }, 'Presente ✅'),
              // Ausente (rojo suave)
              e('button', {
                onClick:()=>handleAction('absent'),
                className:'py-3 md:py-4 rounded-2xl font-semibold border',
                style:{ background:'#fdecea', borderColor:'#f7d7d3', color:'#991b1b' } // rojo suave
              }, 'Ausente ❌'),
              // Revisar más tarde (violeta suave)
              e('button', {
                onClick:()=>handleAction('later'),
                className:'py-3 md:py-4 rounded-2xl font-semibold border col-span-2',
                style:{ background:'#f0eaf5', borderColor:'#e2d7ec', color:'#6c467e' }
              }, 'Revisar más tarde ⏳'),
              e('button', {
                onClick:goBack,
                className:'py-2 md:py-2.5 rounded-xl font-medium col-span-2',
                style:{ background:'#f3efdc', color:'#24496e' }
              }, '← Volver al anterior (deshacer)')
            )
          )
        : e('div', { className:'rounded-3xl border shadow p-6 md:p-8 bg-white text-center', style:{ borderColor:'#d7dbe0' } },
            e('div', { className:'text-xl font-semibold mb-2', style:{ color:'#24496e' } }, '¡Lista completada!'),
            e('div', { className:'text-slate-700' }, 'Ya asignaste estado a todos los estudiantes. Podés volver a empezar o revisar el resumen abajo.')
          )
    )
  );
}

// Barra inferior con Importar/Exportar (reordenada: XLSX → Export JSON → Import JSON)
function BottomActions({ onExportJSON, onImportJSON, onExportXLSX }) {
  const fileRef = useRef(null);
  function triggerImport(){ if(fileRef.current) fileRef.current.click(); }
  function handleFile(ev){
    const file = ev.target.files && ev.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = () => { try { onImportJSON(reader.result); } finally { ev.target.value=''; } };
    reader.readAsText(file);
  }

  return e('div', { className:'p-4 md:p-6 sticky bottom-0 bg-white border-t shadow-sm',
    style:{ borderColor:'#d7dbe0' } },
    e('div', { className:'max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-3' },
      // 1) XLSX
      e('button', { onClick:onExportXLSX,
        className:'px-4 py-2 rounded-xl text-white font-semibold',
        style:{ background:'#24496e' } }, 'Exportar .xlsx'),
      // 2) Exportar JSON
      e('button', { onClick:onExportJSON,
        className:'px-4 py-2 rounded-xl font-semibold',
        style:{ background:'#f3efdc', color:'#24496e' } }, 'Exportar JSON'),
      // 3) Importar JSON
      e('button', { onClick:()=> (fileRef.current && fileRef.current.click()),
        className:'px-4 py-2 rounded-xl font-semibold',
        style:{ background:'#f3efdc', color:'#24496e' } }, 'Importar JSON'),
      e('input', { ref:fileRef, type:'file', accept:'.json,application/json', className:'hidden', onChange:handleFile })
    )
  );
}

// Modal simple (sin cambios de lógica, con colores)
function Modal({ open, title, onClose, children }) {
  if (!open) return null;
  return e('div', { className:'fixed inset-0 z-50 flex items-end sm:items-center justify-center' },
    e('div', { className:'absolute inset-0', onClick:onClose, style:{ background:'rgba(0,0,0,.4)' } }),
    e('div', { className:'relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-lg p-4 sm:p-6 m-0 sm:m-4',
      style:{ background:'#ffffff', border:'1px solid #d7dbe0' } },
      e('div', { className:'flex items-center justify-between mb-3' },
        e('h3', { className:'text-lg font-semibold', style:{ color:'#24496e' } }, title),
        e('button', { onClick:onClose, className:'px-2 py-1 rounded', style:{ background:'#f3efdc', color:'#24496e' } }, '✕')
      ),
      e('div', null, children)
    )
  );
}

function App() {
  const [state, setState] = useState(loadState());
  const courses = state.courses;
  const selectedCourseId = state.selectedCourseId;
  const selectedDate = state.selectedDate || todayStr();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalStudent, setModalStudent] = useState(null);
  const [modalDates, setModalDates] = useState([]);

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
  function undoAttendance(studentId, action, dateStr){
    setState(s=>{
      const next = Object.assign({}, s);
      const course = Object.assign({}, next.courses[selectedCourseId]);
      const students = Object.assign({}, course.students);
      const st = Object.assign({}, students[studentId]);
      let stats = safeStats(st.stats);
      stats = { present:stats.present||0, absent:stats.absent||0, later:stats.later||0 };

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

  function exportStateJSON(){
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
        // incluso tras importar, si querés mantener la fecha del archivo, reemplazá esta línea por: parsed.selectedDate || todayStr()
        selectedDate: todayStr()
      };
      setState(next);
      alert('Importación exitosa. ¡Listo para usar!');
    } catch(err){
      alert('Archivo inválido. Debe ser un JSON exportado por esta app.');
    }
  }

  function exportXLSX(){
    if (!selectedCourse) { alert('Primero seleccioná un curso.'); return; }
    const course = selectedCourse;
    const rows = [['Estudiante','Fecha','Estado']];
    Object.values(course.students).forEach(st => {
      (st.history || []).forEach(h => {
        rows.push([st.name, h.date, h.status]);
      });
    });
    const resumen = [['Estudiante','Presente','Ausente','% Asistencia']];
    Object.values(course.students).forEach(st => {
      const stats = safeStats(st.stats);
      resumen.push([st.name, stats.present||0, stats.absent||0, pct(stats)]);
    });

    const wb = XLSX.utils.book_new();
    const wsHist = XLSX.utils.aoa_to_sheet(rows);
    const wsRes = XLSX.utils.aoa_to_sheet(resumen);
    XLSX.utils.book_append_sheet(wb, wsHist, 'Historial');
    XLSX.utils.book_append_sheet(wb, wsRes, 'Resumen');

    const fileName = `asistencia_${course.name.replace(/[^\w\-]+/g,'_')}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  function showAbsences(student){
    const dates = (student.history || []).filter(h => h.status === 'absent').map(h => h.date).sort();
    setModalStudent(student);
    setModalDates(dates);
    setModalOpen(true);
  }

  return e('div', null,
    e(Header, { selectedDate, onChangeDate:setSelectedDate }),
    Object.keys(courses).length === 0
      ? e(EmptyState, { onCreateCourse:createCourse })
      : e(React.Fragment, null,
          e(CoursesBar, {
            courses, selectedCourseId,
            onSelect:selectCourse, onCreate:createCourse, onRename:renameCourse, onDelete:deleteCourse
          }),
          !selectedCourse
            ? e('div', { className:'p-6 text-slate-700' }, 'Seleccioná un curso para administrar estudiantes y tomar lista.')
            : e(React.Fragment, null,
                e('div', { className:'p-4 md:p-6' },
                  e('h2', { className:'text-xl md:text-2xl font-semibold', style:{ color:'#24496e' } }, selectedCourse.name),
                  e('p',  { className:'text-slate-700' }, 'Estudiantes: ' + studentsArr.length)
                ),
                e(RollCallCard, {
                  students:studentsArr,
                  selectedDate,
                  onMark:markAttendance,
                  onUndo:undoAttendance
                }),
                e(StudentsTable, {
                  students:selectedCourse.students,
                  onAdd:addStudent,
                  onEdit:editStudent,
                  onDelete:deleteStudent,
                  onShowAbsences:showAbsences
                }),
                e(BottomActions, {
                  onExportJSON:exportStateJSON,
                  onImportJSON:importStateFromText,
                  onExportXLSX:exportXLSX
                })
              )
        ),

    e(Modal, {
      open:modalOpen,
      title: modalStudent ? `Fechas de ausencia – ${modalStudent.name}` : 'Fechas de ausencia',
      onClose:()=>setModalOpen(false)
    },
      modalDates.length
        ? e('ul', { className:'list-disc ml-5 space-y-1' }, ...modalDates.map((d,i)=>e('li',{key:i},d)))
        : e('div', { className:'text-slate-700' }, 'No hay inasistencias registradas.')
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
