// ===== Helpers =====
const { useEffect, useMemo, useState, useRef } = React;
const e = React.createElement;

const LS_KEY = 'agenda_estudiantes_sin_google_v5';
const TEACHER_LS_KEY = 'teacher_profile_v1';

function uid(prefix) { prefix = prefix || 'id'; return prefix + '_' + Math.random().toString(36).slice(2,9); }
function safeStats(stats) { return stats && typeof stats === 'object' ? stats : { present:0, absent:0, later:0 }; }
function pct(stats) { const s = safeStats(stats); const d = (s.present||0) + (s.absent||0); return d ? Math.round((s.present/d)*100) : 0; }
function todayStr(d=new Date()){
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function avg(arr){
  if(!arr || !arr.length) return 0;
  const nums = arr.map(x => Number(x.value)).filter(v => !Number.isNaN(v));
  if(!nums.length) return 0;
  const s = nums.reduce((a,b)=>a+b,0);
  return Math.round((s/nums.length)*100)/100;
}
function loadState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    const base = { courses:{}, selectedCourseId:null, selectedDate: todayStr() };
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    return {
      courses: parsed.courses || {},
      selectedCourseId: parsed.selectedCourseId || null,
      selectedDate: todayStr()
    };
  } catch {
    return { courses:{}, selectedCourseId:null, selectedDate: todayStr() };
  }
}
function saveState(state){ localStorage.setItem(LS_KEY, JSON.stringify(state)); }

// Perfil de profe (dispositivo)
function loadTeacher(){
  try { return JSON.parse(localStorage.getItem(TEACHER_LS_KEY)) || { name:'', article:'la' }; }
  catch { return { name:'', article:'la' }; }
}
function saveTeacher(t){ localStorage.setItem(TEACHER_LS_KEY, JSON.stringify(t)); }

function sanitizePhone(phoneRaw=''){
  // Normaliza números de AR para WhatsApp (wa.me)
  let d = String(phoneRaw).replace(/\D+/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = d.slice(1);
  d = d.replace(/^54(9?)(\d{2,4})15(\d{7,8})$/, '54$1$2$3');
  if (!d.startsWith('54') && d.length >= 10 && d.length <= 11) d = '54' + d;
  if (d.startsWith('54') && d[2] !== '9') d = '54' + '9' + d.slice(2);
  d = d.replace(/^549(\d{2,4})15(\d{7,8})$/, '549$1$2');
  return d;
}
function buildRiskMessage(course, student, attendancePct, promedio, teacher){
  const courseName = course?.name || 'curso';
  const pName = student?.name || '';
  const art = (teacher?.article || 'la').trim();
  const tName = (teacher?.name || '').trim();
  const saludo = tName ? `Hola, soy ${art} profe ${tName}.` : 'Hola, soy la profe.';
  const msg = `${saludo} Aviso de RIESGO para ${pName} (${courseName}). Asistencia: ${attendancePct}%. Promedio: ${promedio}.`;
  return encodeURIComponent(msg);
}


// ====== Supabase helpers (multi-dispositivo) ======
function hasSupabase(){ return !!(window.sb && window.sb.auth); }
async function sbGetUser(){ const { data, error } = await window.sb.auth.getUser(); if(error) throw error; return data.user || null; }
async function sbSignIn(email, password){ if(!hasSupabase()) throw new Error('Falta configurar Supabase en index.html'); const { error } = await window.sb.auth.signInWithPassword({ email, password }); if(error) throw error; }
async function sbSignOut(){ if(!hasSupabase()) return; const { error } = await window.sb.auth.signOut(); if(error) throw error; }
async function sbResetPassword(email){ if(!hasSupabase()) throw new Error('Supabase no configurado.'); const { error } = await window.sb.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname }); if(error) throw error; }
async function sbEnsureStateRow(){ const user = await sbGetUser(); if(!user) throw new Error('No hay sesión'); const { data, error } = await window.sb.from('user_app_state').select('user_id').eq('user_id', user.id).maybeSingle(); if(error) throw error; if(!data){ const { error:insErr } = await window.sb.from('user_app_state').insert({ user_id:user.id, app_state:{ courses:{}, selectedCourseId:null, selectedDate: todayStr() }, teacher_profile:{ name:'', article:'la' } }); if(insErr) throw insErr; } }
async function sbLoadRemoteData(){ const user = await sbGetUser(); if(!user) throw new Error('No hay sesión'); const { data, error } = await window.sb.from('user_app_state').select('app_state, teacher_profile').eq('user_id', user.id).single(); if(error) throw error; return { state:{ courses:data?.app_state?.courses || {}, selectedCourseId:data?.app_state?.selectedCourseId || null, selectedDate: todayStr() }, teacher: data?.teacher_profile || { name:'', article:'la' } }; }
async function sbSaveRemoteState(state, teacher){ const user = await sbGetUser(); if(!user) return; const { error } = await window.sb.from('user_app_state').upsert({ user_id:user.id, app_state:{ courses:state?.courses || {}, selectedCourseId:state?.selectedCourseId || null, selectedDate: state?.selectedDate || todayStr() }, teacher_profile:{ name: teacher?.name || '', article: teacher?.article || 'la' } }, { onConflict:'user_id' }); if(error) throw error; }

// ====== Auth helpers ======
const SESSION_KEY = 'session_user_v1';

function parseCSV(text){
  // Simple CSV parser (no quoted commas); fits our sheet
  const rows = text.trim().split(/\r?\n/);
  if(!rows.length) return [];
  // detect header
  const header = rows[0].split(',').map(h => h.trim().toLowerCase());
  const mapping = { usuario: header.indexOf('usuario'), contrasena: header.indexOf('contraseña'), correo: header.indexOf('correo') };
  const items = [];
  for (let i=1;i<rows.length;i++){
    const cols = rows[i].split(',').map(c => c.trim());
    const usuario = mapping.usuario>=0 ? cols[mapping.usuario] : cols[0];
    const contrasena = mapping.contrasena>=0 ? cols[mapping.contrasena] : cols[1];
    const correo = mapping.correo>=0 ? cols[mapping.correo] : cols[2] || '';
    items.push({ usuario, contrasena, correo });
  }
  return items;
}

async function fetchUsers(){
  const url = (window.USERS_CSV_URL || '').trim();
  if(!url) throw new Error('Falta USERS_CSV_URL');
  const res = await fetch(url + '&_=' + Date.now());
  if(!res.ok) throw new Error('No se pudo leer la hoja');
  const text = await res.text();
  return parseCSV(text);
}

function loadSession(){ try { return JSON.parse(localStorage.getItem(SESSION_KEY)) || null; } catch { return null; } }
function saveSession(sess){ localStorage.setItem(SESSION_KEY, JSON.stringify(sess||null)); }
function clearSession(){ localStorage.removeItem(SESSION_KEY); }

function AdminMailLink(subject, body){
  const mail = (window.SUPPORT_EMAIL || 'admin@ejemplo.com').trim();
  const link = `mailto:${mail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = link;
}

// ====== Auth UI ======
function LoginScreen({ onLogin }){
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(ev){
    ev && ev.preventDefault();
    setError(''); setLoading(true);
    try {
      await sbSignIn(usuario, password);
      const user = await sbGetUser();
      saveSession({ usuario: user?.email || usuario, correo: user?.email || usuario });
      onLogin && onLogin();
    } catch(err){
      setError(err?.message || 'No se pudo iniciar sesión.');
    } finally { setLoading(false); }
  }

  function forgotPassword(){
    const correo = (prompt('Ingresá tu correo (el mismo con el que iniciás sesión):', usuario) || '').trim();
    if(!correo) return;
    sbResetPassword(correo).then(()=> alert('Te enviamos un correo para restablecer tu contraseña.')).catch(err=> alert('No se pudo enviar el mail: ' + (err?.message || 'error')));
  }
  function changePassword(){ alert('Usá “Olvidé mi contraseña” para cambiar la clave desde Supabase.'); }

  return e('div', { className:'min-h-dvh flex items-center justify-center p-6' },
    e('div', { className:'w-full max-w-sm bg-white rounded-3xl border shadow p-6', style:{ borderColor:'#d7dbe0' } },
      e('div', { className:'text-center mb-4' },
        e('div', { className:'text-2xl font-bold', style:{ color:'#24496e' } }, 'Tomador de lista'),
        e('div', { className:'text-sm text-slate-600' }, 'Ingresá con tu correo de acceso')
      ),
      e('form', { onSubmit:submit, className:'space-y-3' },
        e('div', null,
          e('label', { className:'block text-sm mb-1', style:{color:'#24496e'} }, 'Correo'),
          e('input', { value:usuario, onChange:e=>setUsuario(e.target.value), className:'w-full px-3 py-2 border rounded-xl', style:{borderColor:'#d7dbe0'}, autoFocus:true })
        ),
        e('div', null,
          e('label', { className:'block text-sm mb-1', style:{color:'#24496e'} }, 'Contraseña'),
          e('input', { type:'password', value:password, onChange:e=>setPassword(e.target.value), className:'w-full px-3 py-2 border rounded-xl', style:{borderColor:'#d7dbe0'} })
        ),
        error ? e('div', { className:'text-sm text-red-700 bg-red-50 rounded px-2 py-1' }, error) : null,
        e('button', { type:'submit', disabled:loading, className:'w-full px-4 py-2 rounded-2xl text-white font-semibold', style:{ background:'#6c467e', opacity: loading? .7:1 } }, loading ? 'Ingresando...' : 'Ingresar'),
        e('div', { className:'flex items-center justify-between text-sm pt-1' },
          e('button', { type:'button', onClick:forgotPassword, className:'underline', style:{color:'#24496e'} }, 'Olvidé mi contraseña'),
          e('button', { type:'button', onClick:changePassword, className:'underline', style:{color:'#24496e'} }, 'Cambiar contraseña')
        )
      )
    )
  );
}


function ChangePasswordPanel({ usuario, onClose }){
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repite, setRepite] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  async function submit(ev){
    ev && ev.preventDefault();
    setMsg(''); 
    if(!nueva || nueva !== repite){ setMsg('La nueva contraseña no coincide.'); return; }
    const api = (window.PASSWORD_API_URL || '').trim();
    if(!api){ setMsg('PASSWORD_API_URL no está configurada.'); return; }
    setLoading(true);
    try {
      const body = new URLSearchParams({ action:'change', usuario, password_actual: actual, password_nueva: nueva }).toString();
      const r = await fetch(api, { method:'POST', headers:{'Content-Type':'application/x-www-form-urlencoded'}, body });
      let ok = false, err='';
      try { const j = await r.json(); ok = (j.status==='ok'); err = j.message||''; } catch(_){ ok = r.ok; }
      if(ok){
        setMsg('¡Contraseña actualizada! Cerrando…');
        setTimeout(()=>{ onClose && onClose(); alert('Volvé a iniciar sesión con tu nueva contraseña.'); clearSession(); location.reload(); }, 800);
      } else {
        setMsg('No se pudo cambiar: ' + (err||'error'));
      }
    } catch(e){ setMsg('Error de red.'); }
    finally{ setLoading(false); }
  }

  return e('div', { className:'fixed inset-0 bg-black/30 flex items-center justify-center p-4', role:'dialog' },
    e('div', { className:'w-full max-w-sm bg-white rounded-3xl p-5 shadow' },
      e('div', { className:'text-lg font-semibold mb-2', style:{color:'#24496e'} }, 'Cambiar contraseña'),
      e('form', { onSubmit:submit, className:'space-y-3' },
        e('div', null,
          e('label', { className:'block text-sm mb-1' }, 'Contraseña actual'),
          e('input', { type:'password', value:actual, onChange:e=>setActual(e.target.value), className:'w-full px-3 py-2 border rounded-xl', style:{borderColor:'#d7dbe0'} })
        ),
        e('div', null,
          e('label', { className:'block text-sm mb-1' }, 'Nueva contraseña'),
          e('input', { type:'password', value:nueva, onChange:e=>setNueva(e.target.value), className:'w-full px-3 py-2 border rounded-xl', style:{borderColor:'#d7dbe0'} })
        ),
        e('div', null,
          e('label', { className:'block text-sm mb-1' }, 'Repetir nueva contraseña'),
          e('input', { type:'password', value:repite, onChange:e=>setRepite(e.target.value), className:'w-full px-3 py-2 border rounded-xl', style:{borderColor:'#d7dbe0'} })
        ),
        msg ? e('div', { className:'text-sm', style:{color: msg.startsWith('¡')?'#2b647b':'#b91c1c'} }, msg) : null,
        e('div', { className:'flex gap-2 justify-end' },
          e('button', { type:'button', onClick:onClose, className:'px-3 py-2 rounded-xl', style:{background:'#f3efdc', color:'#24496e'} }, 'Cancelar'),
          e('button', { type:'submit', disabled:loading, className:'px-3 py-2 rounded-xl text-white', style:{background:'#6c467e', opacity: loading? .7:1} }, loading ? 'Guardando…' : 'Guardar')
        )
      )
    )
  );
}

function AppShell(){
  const [sess, setSess] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if(!hasSupabase()){ setLoading(false); return; }
    window.sb.auth.getSession().then(({ data }) => {
      if(!mounted) return;
      const session = data?.session || null;
      if(session) saveSession({ usuario: session.user?.email || '', correo: session.user?.email || '' }); else clearSession();
      setSess(session);
      setLoading(false);
    }).catch(() => setLoading(false));
    const sub = window.sb.auth.onAuthStateChange((_event, session) => {
      if(session) saveSession({ usuario: session.user?.email || '', correo: session.user?.email || '' }); else clearSession();
      setSess(session || null);
      setLoading(false);
    });
    return () => { mounted = false; try { sub?.data?.subscription?.unsubscribe?.(); } catch(_){} };
  }, []);

  async function handleLogout(){ try{ await sbSignOut(); }catch(_){} clearSession(); setSess(null); }

  if(loading){ return e('div', { className:'min-h-dvh flex items-center justify-center p-6 text-slate-700' }, 'Cargando...'); }
  if(!hasSupabase()){
    return e('div', { className:'min-h-dvh flex items-center justify-center p-6' },
      e('div', { className:'w-full max-w-md bg-white rounded-3xl border shadow p-6 text-sm', style:{ borderColor:'#d7dbe0' } },
        e('div', { className:'font-semibold mb-2', style:{ color:'#24496e' } }, 'Configurar Supabase'),
        e('div', { className:'text-slate-700' }, 'Completá SUPABASE_URL y SUPABASE_ANON_KEY en index.html para habilitar el login y la sincronización.')
      )
    );
  }

  return sess
    ? e('div', null,
        e('div', { className:'w-full flex justify-end p-2 text-sm' },
          e('div', { className:'flex items-center gap-2 text-slate-700' },
            e('span', null, sess.user?.email || ''),
            e('button', { onClick:handleLogout, className:'px-2 py-1 rounded', style:{ background:'#f3efdc', color:'#24496e' } }, 'Cerrar sesión')
          )
        ),
        e(App, { session: sess })
      )
    : e(LoginScreen, { onLogin: () => {} });
}

// App principal
function App() {
  const [state, setState] = useState(loadState());
  const courses = state.courses;
  const selectedCourseId = state.selectedCourseId;
  const selectedDate = state.selectedDate || todayStr();

  // Perfil del/la profe
  const [teacher, setTeacher] = useState(loadTeacher());
  const [teacherOpen, setTeacherOpen] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [remoteEmpty, setRemoteEmpty] = useState(false);

  // Modal de notas
  const [gradesOpen, setGradesOpen] = useState(false);
  const [gradesStudentId, setGradesStudentId] = useState(null);

  // Modal de inasistencias
  const [absencesOpen, setAbsencesOpen] = useState(false);
  const [absencesStudentId, setAbsencesStudentId] = useState(null);

  // Modales nuevos
  const [exportOpen, setExportOpen] = useState(false);
  const [newCourseOpen, setNewCourseOpen] = useState(false);

  useEffect(() => { saveState(state); }, [state]);

  // Cargar desde Supabase (sin perder respaldo local)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await sbEnsureStateRow();
        const remote = await sbLoadRemoteData();
        if(!mounted) return;
        const remoteCourses = Object.keys(remote?.state?.courses || {}).length;
        const localCourses = Object.keys(loadState()?.courses || {}).length;
        if(remote?.state) setState(remote.state);
        if(remote?.teacher) setTeacher(remote.teacher);
        if(remoteCourses === 0 && localCourses > 0) setRemoteEmpty(true);
      } catch(err) {
        console.warn('No se pudo cargar de Supabase; se usan datos locales.', err);
      } finally { if(mounted) setRemoteReady(true); }
    })();
    return () => { mounted = false; };
  }, []);

  // Primer inicio: pedir nombre
  useEffect(() => {
    if(!(teacher && teacher.name)){
      setTeacherOpen(true);
    }
  }, []);
  useEffect(() => { if(teacher) saveTeacher(teacher); }, [teacher]);

  // Sincronizar a Supabase (debounce corto)
  useEffect(() => {
    if(!remoteReady) return;
    const t = setTimeout(() => {
      sbSaveRemoteState(state, teacher).catch(err => console.warn('No se pudo sincronizar:', err));
    }, 500);
    return () => clearTimeout(t);
  }, [state, teacher, remoteReady]);

  // Ofrecer migrar datos locales si la nube está vacía
  useEffect(() => {
    if(!remoteReady || !remoteEmpty) return;
    const k = 'supabase_migracion_ofrecida_v1';
    if(localStorage.getItem(k)) return;
    localStorage.setItem(k, '1');
    setTimeout(() => {
      const ok = confirm('Se detectaron datos en este dispositivo y la nube está vacía. ¿Querés subir estos datos locales a Supabase?');
      if(ok){
        sbSaveRemoteState(state, teacher).then(() => alert('Listo ✅ Datos subidos a la nube.')).catch(err => alert('No se pudo subir: ' + (err?.message || 'error')));
      }
    }, 700);
  }, [remoteReady, remoteEmpty]);

  // Exponer función para abrir Exportar/Importar desde el footer
  useEffect(() => {
    window.__openExport = () => setExportOpen(true);
    return () => { try { delete window.__openExport; } catch(_){} };
  }, []);

  const selectedCourse = selectedCourseId ? courses[selectedCourseId] : null;

  function setSelectedDate(dateStr){ setState(s => Object.assign({}, s, { selectedDate: dateStr || todayStr() })); }
  function selectCourse(id){ setState(s => Object.assign({}, s, { selectedCourseId:id })); }
  function createCourseFromModal(payload){
    const id = uid('curso');
    setState(s => {
      const next = Object.assign({}, s);
      next.selectedCourseId = id;
      next.courses = Object.assign({}, s.courses);
      next.courses[id] = { id, name:payload.name, days:payload.days||[], preceptor:payload.preceptor||{}, students:{} };
      return next;
    });
  }
  function createCourse(){ setNewCourseOpen(true); }
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
  function addStudent(name, condition){
    if(!selectedCourseId) return;
    const id = uid('alumno');
    setState(s=>{
      const next = Object.assign({}, s);
      const course = Object.assign({}, next.courses[selectedCourseId]);
      const students = Object.assign({}, course.students);
      students[id] = { id, name, condition: (condition || 'cursa'), stats:{present:0, absent:0, later:0}, history:[], grades:[] };
      course.students = students;
      next.courses = Object.assign({}, next.courses);
      next.courses[selectedCourseId] = course;
      return next;
    });
  }
  function editStudent(id, payload){
    setState(s=>{
      const next = Object.assign({}, s);
      const course = Object.assign({}, next.courses[selectedCourseId]);
      const students = Object.assign({}, course.students);
      const st = Object.assign({}, students[id]);
      if (typeof payload === 'string') { st.name = payload; }
      else if (payload && typeof payload === 'object') {
        if (payload.name) st.name = payload.name;
        if (payload.condition) st.condition = payload.condition;
      }
      students[id] = st; course.students = students;
      next.courses = Object.assign({}, next.courses); next.courses[selectedCourseId] = course;
      return next;
    });
  }
  function deleteStudent(id){
    if(!confirm('¿Seguro que querés eliminar a este estudiante y toda su información?')) return;
    setState(s=>{
      const next = Object.assign({}, s);
      const course = Object.assign({}, next.courses[selectedCourseId]);
      const students = Object.assign({}, course.students);
      delete students[id]; course.students = students;
      next.courses = Object.assign({}, next.courses); next.courses[selectedCourseId] = course;
      return next;
    });
  }
  function markAttendance(studentId, action, dateStr){
    setState(s=>{
      const next = Object.assign({}, s);
      const course = Object.assign({}, next.courses[selectedCourseId]);
      const students = Object.assign({}, course.students);
      const st = Object.assign({}, students[studentId]);
      let stats = safeStats(st.stats); stats = { present:stats.present||0, absent:stats.absent||0, later:stats.later||0 };
      if (action==='present') stats.present += 1;
      if (action==='absent')  stats.absent  += 1;
      if (action==='later')   stats.later   += 1;
      const history = (st.history || []).slice();
      history.push({ id: uid('hist'), date: dateStr || todayStr(), status: action });
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
      let stats = safeStats(st.stats); stats = { present:stats.present||0, absent:stats.absent||0, later:stats.later||0 };
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

  function openGrades(student){ setGradesStudentId(student.id); setGradesOpen(true); }
  function openAbsences(student){ setAbsencesStudentId(student.id); setAbsencesOpen(true); }

  function addGrade(studentId, grade){
    setState(s=>{
      const next = Object.assign({}, s);
      const course = Object.assign({}, next.courses[selectedCourseId]);
      const students = Object.assign({}, course.students);
      const st = Object.assign({}, students[studentId]);
      const grades = (st.grades || []).slice(); grades.push(grade);
      st.grades = grades; students[studentId] = st; course.students = students;
      next.courses = Object.assign({}, next.courses); next.courses[selectedCourseId] = course;
      return next;
    });
  }
  function editGrade(studentId, grade){
    setState(s=>{
      const next = Object.assign({}, s);
      const course = Object.assign({}, next.courses[selectedCourseId]);
      const students = Object.assign({}, course.students);
      const st = Object.assign({}, students[studentId]);
      const grades = (st.grades || []).slice();
      const idx = grades.findIndex(g => g.id === grade.id);
      if(idx !== -1) grades[idx] = grade;
      st.grades = grades; students[studentId] = st; course.students = students;
      next.courses = Object.assign({}, next.courses); next.courses[selectedCourseId] = course;
      return next;
    });
  }
  function deleteGrade(studentId, gradeId){
    setState(s=>{
      const next = Object.assign({}, s);
      const course = Object.assign({}, next.courses[selectedCourseId]);
      const students = Object.assign({}, course.students);
      const st = Object.assign({}, students[studentId]);
      const grades = (st.grades || []).filter(g => g.id !== gradeId);
      st.grades = grades; students[studentId] = st; course.students = students;
      next.courses = Object.assign({}, next.courses); next.courses[selectedCourseId] = course;
      return next;
    });
  }

  function applyAbsenceChange(studentId, histId, reason){
    setState(s=>{
      const next = Object.assign({}, s);
      const course = Object.assign({}, next.courses[selectedCourseId]);
      const students = Object.assign({}, course.students);
      const st = Object.assign({}, students[studentId]);
      const stats = safeStats(st.stats);
      const hist = (st.history || []).slice();
      const idx = hist.findIndex(h => h.id === histId);
      if (idx === -1) return s;

      const entry = Object.assign({}, hist[idx]);

      if (reason === 'erronea') {
        if (entry.status === 'absent' && stats.absent > 0) stats.absent -= 1;
        if (entry.status === 'tarde'  && stats.later  > 0) stats.later  -= 1;

        // Reetiquetar como presente y sumar 1 a presentes
        entry.status = 'present';
        delete entry.reason;
        stats.present = (stats.present || 0) + 1;
        hist[idx] = entry;
      } else if (reason === 'tarde') {
        // Contar 'tarde' también como presencia
        if (entry.status === 'absent') {
          if (stats.absent > 0) stats.absent -= 1;
        }
        // Sumar tardanza si aún no lo era
        if (entry.status !== 'tarde') {
          stats.later = (stats.later || 0) + 1;
        }
        // ✅ Siempre suma 1 a presentes (criterio pedido por Naty)
        stats.present = (stats.present || 0) + 1;

        entry.status = 'tarde';
        delete entry.reason;
        hist[idx] = entry;
      } else if (reason === 'justificada') {
        entry.status = 'absent';
        entry.reason = 'justificada';
        hist[idx] = entry;
      }

      st.history = hist;
      st.stats = { present: stats.present||0, absent: stats.absent||0, later: stats.later||0 };
      students[studentId] = st; course.students = students;
      next.courses = Object.assign({}, next.courses); next.courses[selectedCourseId] = course;
      return next;
    });
  }

  const studentsArr = useMemo(() => {
    if (!selectedCourse) return [];
    return Object.values(selectedCourse.students).sort((a,b)=>a.name.localeCompare(b.name));
  }, [selectedCourse]);

  const gradesStudent = selectedCourse && gradesStudentId ? selectedCourse.students[gradesStudentId] || null : null;
  const absencesStudent = selectedCourse && absencesStudentId ? selectedCourse.students[absencesStudentId] || null : null;

  function exportStateJSON(){
    try{
      const data = JSON.stringify(state, null, 2);
      const blob = new Blob([data], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'agenda_backup.json'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      alert('Exportación lista: se descargó agenda_backup.json');
    } catch(err){ alert('No se pudo exportar: ' + (err && err.message ? err.message : err)); }
  }
  function importStateFromText(text){
    try{
      const parsed = JSON.parse(text);
      const next = { courses: parsed && typeof parsed.courses==='object' ? parsed.courses : {}, selectedCourseId: parsed && parsed.selectedCourseId ? parsed.selectedCourseId : null, selectedDate: todayStr() };
      setState(next); alert('Importación exitosa.');
    } catch(err){ alert('Archivo inválido.'); }
  }
  function exportXLSX(){
    if (!selectedCourse) { alert('Primero seleccioná un curso.'); return; }
    const course = selectedCourse;
    const rowsHist = [['Estudiante','Fecha','Estado']];
    Object.values(course.students).forEach(st => { (st.history || []).forEach(h => rowsHist.push([st.name, h.date || '', h.status || ''])); });
    const rowsGrades = [['Estudiante','Fecha','Tipo','Nota']];
    Object.values(course.students).forEach(st => { (st.grades || []).forEach(g => rowsGrades.push([st.name, g.date || '', g.tipo || '', g.value])); });
    const rowsAvg = [['Estudiante','Promedio']];
    Object.values(course.students).forEach(st => rowsAvg.push([st.name, avg(st.grades||[])]));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsHist), 'Historial');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsGrades), 'Calificaciones');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rowsAvg), 'Promedios');
    XLSX.writeFile(wb, `asistencia_${(course.name||'curso').replace(/\s+/g,'_')}.xlsx`);
  }

  function notifyPreceptor(student, attendancePct, promedio){
    const course = selectedCourse;
    const phone = sanitizePhone(course?.preceptor?.phone || '');
    if(!phone){ alert('Este curso no tiene teléfono de preceptor configurado.'); return; }
    const url = `https://wa.me/${phone}?text=${buildRiskMessage(course, student, attendancePct, promedio.toFixed(2), teacher)}`;
    if(confirm(`Se abrirá WhatsApp para avisar al preceptor (${course.preceptor.name||''}). ¿Continuar?`)){
      window.open(url, '_blank', 'noopener');
    }
  }

  function saveTeacherProfile(t){
    setTeacher({ name: (t?.name || '').trim(), article: (t?.article || 'la') });
  }

  return e('div', null,
    e(Header, { selectedDate, onChangeDate:setSelectedDate }),
    e('main', { className:'max-w-5xl mx-auto' },
      Object.keys(courses).length === 0
        ? e(EmptyState, { onCreateCourse:createCourse })
        : e(CoursesBar, { courses, selectedCourseId, onSelect:selectCourse, onCreate:createCourse, onRename:renameCourse, onDelete:deleteCourse }),
      selectedCourse
        ? e('div', null,
            e(RollCallCard, { students:studentsArr, selectedDate, onMark:markAttendance, onUndo:undoAttendance }),
            e(StudentsTable, {
              course:selectedCourse,
              students:selectedCourse.students||{},
              onAdd:addStudent,
              onEdit:editStudent,
              onDelete:deleteStudent,
              onShowAbsences:(s)=>openAbsences(s),
              onOpenGrades:(s)=>openGrades(s),
              onNotifyPreceptor:(s, a, p)=>notifyPreceptor(s, a, p)
            })
          )
        : null
    ),
    e(ExportModal, {
      open:exportOpen,
      onClose:()=>setExportOpen(false),
      onExportJSON:exportStateJSON,
      onImportJSON:importStateFromText,
      onExportXLSX:exportXLSX
    }),
    e(NewCourseModal, {
      open:newCourseOpen,
      onClose:()=>setNewCourseOpen(false),
      onCreate:createCourseFromModal
    }),
    e(GradesModal, {
      open:gradesOpen,
      student:gradesStudent,
      onClose:()=>setGradesOpen(false),
      onAdd:(g)=>{ if(gradesStudent) addGrade(gradesStudent.id, g); },
      onEdit:(g)=>{ if(gradesStudent) editGrade(gradesStudent.id, g); },
      onDelete:(id)=>{ if(gradesStudent) deleteGrade(gradesStudent.id, id); }
    }),
    e(AbsencesModal, {
      open:absencesOpen,
      student:absencesStudent,
      onClose:()=>setAbsencesOpen(false),
      onApplyChange:(histId, reason)=>{
        if(absencesStudent){
          applyAbsenceChange(absencesStudent.id, histId, reason);
        }
      }
    }),
    e(TeacherProfileModal, {
      open: teacherOpen,
      onClose: ()=> setTeacherOpen(false),
      onSave: saveTeacherProfile,
      initial: teacher
    })
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(e(AppShell));
