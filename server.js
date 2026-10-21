'use strict';
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
const seed = { users: [], subjects: [], tasks: [], exams: [], goals: [], attendance: [], notes: [], sessions: [] };
let db;
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { db = structuredClone(seed); }
for (const key of Object.keys(seed)) if (!Array.isArray(db[key])) db[key] = [];
function save() { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
function id() { return crypto.randomBytes(12).toString('hex'); }
function safeUser(u) { return { id: u.id, name: u.name, email: u.email, createdAt: u.createdAt }; }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex'); return { salt, hash };
}
function tokenFor(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions = db.sessions.filter(s => s.userId !== userId);
  db.sessions.push({ tokenHash: crypto.createHash('sha256').update(token).digest('hex'), userId, createdAt: Date.now() }); save(); return token;
}
function auth(req, res, next) {
  const raw = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || req.headers['x-session-token'];
  if (!raw) return res.status(401).json({ error: 'Please sign in to continue.' });
  const digest = crypto.createHash('sha256').update(raw).digest('hex');
  const session = db.sessions.find(s => s.tokenHash === digest);
  const user = session && db.users.find(u => u.id === session.userId);
  if (!user) return res.status(401).json({ error: 'Session expired. Please sign in again.' });
  req.user = user; next();
}
function own(list, req, res, next) { req.collection = list; next(); }
function owned(list, userId) { return list.filter(x => x.userId === userId); }
function cleanText(v, max = 300) { return String(v ?? '').trim().slice(0, max); }
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/health', (req, res) => res.json({ ok: true, app: 'ExamPilot 2027', time: new Date().toISOString() }));
app.post('/api/auth/register', (req, res) => {
  const name = cleanText(req.body.name, 80), email = cleanText(req.body.email, 180).toLowerCase(), password = String(req.body.password || '');
  if (name.length < 2) return res.status(400).json({ error: 'Enter your name (at least 2 characters).' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must contain at least 8 characters.' });
  if (db.users.some(u => u.email === email)) return res.status(409).json({ error: 'An account with this email already exists.' });
  const pw = hashPassword(password); const user = { id: id(), name, email, ...pw, createdAt: new Date().toISOString() }; db.users.push(user);
  const defaults = [
    ['Tamil',100,80,'#f59e0b'],['English',100,85,'#60a5fa'],['Mathematics',100,95,'#a78bfa'],['Physics',100,90,'#34d399'],['Chemistry',100,90,'#fb7185'],['Computer Science',100,95,'#22d3ee']
  ];
  defaults.forEach(([name,maxMarks,target,color]) => db.subjects.push({ id:id(), userId:user.id, name, maxMarks, target, color, createdAt:new Date().toISOString() }));
  save(); const token = tokenFor(user.id); res.status(201).json({ user:safeUser(user), token });
});
app.post('/api/auth/login', (req,res) => {
  const email = cleanText(req.body.email,180).toLowerCase(), password = String(req.body.password || '');
  const user = db.users.find(u => u.email === email);
  if (!user) return res.status(401).json({ error:'Incorrect email or password.' });
  const attempt = crypto.scryptSync(password, user.salt, 64).toString('hex');
  if (!crypto.timingSafeEqual(Buffer.from(attempt,'hex'), Buffer.from(user.hash,'hex'))) return res.status(401).json({ error:'Incorrect email or password.' });
  const token = tokenFor(user.id); res.json({ user:safeUser(user), token });
});
app.get('/api/auth/me', auth, (req,res) => res.json({ user:safeUser(req.user) }));
app.post('/api/auth/logout', auth, (req,res) => { const raw=(req.headers.authorization||'').replace(/^Bearer\s+/i,'')||req.headers['x-session-token']; const digest=crypto.createHash('sha256').update(raw).digest('hex'); db.sessions=db.sessions.filter(s=>s.tokenHash!==digest); save(); res.json({ok:true}); });
app.get('/api/dashboard', auth, (req,res) => {
  const uid=req.user.id, subjects=owned(db.subjects,uid), tasks=owned(db.tasks,uid), exams=owned(db.exams,uid), goals=owned(db.goals,uid), attendance=owned(db.attendance,uid), sessions=owned(db.sessions.filter(s=>s.userId===uid),uid);
  const today=new Date().toISOString().slice(0,10), done=tasks.filter(t=>t.status==='done').length, pending=tasks.filter(t=>t.status!=='done').length;
  const studyToday=db.studySessions.filter(s=>s.userId===uid&&s.date===today).reduce((a,s)=>a+s.minutes,0);
  const attended=attendance.filter(a=>a.status==='present').length, attendanceTotal=attendance.length;
  const upcoming=exams.filter(e=>e.date>=today).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,4);
  res.json({ user:safeUser(req.user), subjects, tasks:tasks.sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999')), exams:exams.sort((a,b)=>a.date.localeCompare(b.date)), goals, attendance, notes:owned(db.notes,uid).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)), stats:{subjectCount:subjects.length,taskCount:tasks.length,completedTasks:done,pendingTasks:pending,completionRate:tasks.length?Math.round(done/tasks.length*100):0,studyMinutesToday:studyToday,attendanceRate:attendanceTotal?Math.round(attended/attendanceTotal*100):0,attendanceCount:attendanceTotal,goalCount:goals.length,achievedGoals:goals.filter(g=>g.current>=g.target).length}, upcomingExams:upcoming });
});
// study sessions are stored separately but included in the dashboard
if (!Array.isArray(db.studySessions)) db.studySessions=[];
const collections = { subjects:'subjects', tasks:'tasks', exams:'exams', goals:'goals', attendance:'attendance', notes:'notes' };
for (const [route, key] of Object.entries(collections)) {
  app.get('/api/'+route, auth, (req,res)=>res.json(owned(db[key],req.user.id)));
  app.post('/api/'+route, auth, (req,res)=>{
    const b=req.body||{}; const item={ id:id(), userId:req.user.id, createdAt:new Date().toISOString(), ...b };
    delete item.userId; // enforce ownership below
    if (route==='subjects') { item.name=cleanText(b.name,80); item.maxMarks=Math.max(1,Number(b.maxMarks)||100); item.target=Math.min(item.maxMarks,Math.max(0,Number(b.target)||0)); item.color=/^#[0-9a-f]{6}$/i.test(b.color||'')?b.color:'#7c83ff'; if(!item.name)return res.status(400).json({error:'Subject name is required.'}); }
    if (route==='tasks') { item.title=cleanText(b.title,160); item.subject=cleanText(b.subject,80); item.dueDate=cleanText(b.dueDate,10); item.priority=['low','medium','high'].includes(b.priority)?b.priority:'medium'; item.status=b.status==='done'?'done':'pending'; item.description=cleanText(b.description,1000); if(!item.title)return res.status(400).json({error:'Task title is required.'}); }
    if (route==='exams') { item.title=cleanText(b.title,120); item.subject=cleanText(b.subject,80); item.date=cleanText(b.date,10); item.maxMarks=Math.max(1,Number(b.maxMarks)||100); item.target=Math.max(0,Number(b.target)||0); if(!item.title||!item.date)return res.status(400).json({error:'Exam title and date are required.'}); }
    if (route==='goals') { item.title=cleanText(b.title,160); item.target=Math.max(1,Number(b.target)||1); item.current=Math.max(0,Number(b.current)||0); item.unit=cleanText(b.unit,30)||'sessions'; item.deadline=cleanText(b.deadline,10); if(!item.title)return res.status(400).json({error:'Goal title is required.'}); }
    if (route==='attendance') { item.subject=cleanText(b.subject,80); item.date=cleanText(b.date,10)||new Date().toISOString().slice(0,10); item.status=b.status==='absent'?'absent':'present'; if(!item.subject)return res.status(400).json({error:'Select a subject.'}); }
    if (route==='notes') { item.title=cleanText(b.title,160); item.content=cleanText(b.content,10000); item.subject=cleanText(b.subject,80); item.updatedAt=new Date().toISOString(); if(!item.title)return res.status(400).json({error:'Note title is required.'}); }
    item.userId=req.user.id; db[key].push(item); save(); res.status(201).json(item);
  });
  app.put('/api/'+route+'/:id', auth, (req,res)=>{
    const item=db[key].find(x=>x.id===req.params.id&&x.userId===req.user.id); if(!item)return res.status(404).json({error:'Item not found.'});
    const allowed=route==='subjects'?['name','maxMarks','target','color']:route==='tasks'?['title','subject','dueDate','priority','status','description']:route==='exams'?['title','subject','date','maxMarks','target','score']:route==='goals'?['title','target','current','unit','deadline']:route==='attendance'?['subject','date','status']:['title','content','subject'];
    for(const k of allowed) if(req.body[k]!==undefined) item[k]=req.body[k];
    if(route==='notes') item.updatedAt=new Date().toISOString(); save(); res.json(item);
  });
  app.delete('/api/'+route+'/:id', auth, (req,res)=>{const before=db[key].length; db[key]=db[key].filter(x=>!(x.id===req.params.id&&x.userId===req.user.id)); if(before===db[key].length)return res.status(404).json({error:'Item not found.'}); save(); res.json({ok:true});});
}
app.post('/api/study-sessions', auth, (req,res)=>{const minutes=Math.max(1,Math.min(600,Number(req.body.minutes)||25));const item={id:id(),userId:req.user.id,minutes,subject:cleanText(req.body.subject,80),date:new Date().toISOString().slice(0,10),createdAt:new Date().toISOString()};db.studySessions.push(item);save();res.status(201).json(item);});
app.get('/api/study-sessions', auth, (req,res)=>res.json(db.studySessions.filter(s=>s.userId===req.user.id).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100)));
app.get('/api/export', auth, (req,res)=>{const out={exportedAt:new Date().toISOString(),user:safeUser(req.user)};for(const k of [...Object.keys(collections),'studySessions'])out[k]= (k==='studySessions'?db.studySessions:db[k]).filter(x=>x.userId===req.user.id);res.setHeader('Content-Disposition','attachment; filename="exampilot-data.json"');res.json(out);});
app.use('/api', (req,res)=>res.status(404).json({error:'API endpoint not found.'}));
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,'0.0.0.0',()=>console.log(`ExamPilot 2027 running at http://localhost:${PORT}`));
