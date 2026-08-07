import { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'

type Profile = { id: string; filename?: string; name: string; email?: string; phone?: string; rawText?: string; skills: string[]; roles: string[]; experienceYears: string; location: string }
type Job = { externalId: string; source: string; title: string; company: string; location: string; url: string; tags: string[]; salary: string; postedAt: string; verification: string; matchScore: number; matchedSkills: string[]; missingSkills: string[]; reason: string }
type Event = { type: string; tool: string; message: string }
const boards = [
  ['LinkedIn', 'https://www.linkedin.com/jobs/search/?keywords={q}&location={l}'], ['Indeed', 'https://in.indeed.com/jobs?q={q}&l={l}'],
  ['Naukri', 'https://www.naukri.com/{q}-jobs-in-{l}'], ['Wellfound', 'https://wellfound.com/jobs'], ['Foundit', 'https://www.foundit.in/search/{q}-jobs-in-{l}'], ['Internshala', 'https://internshala.com/jobs/{q}-jobs/']
]
const emptyProfile: Profile = { id: 'local-user', name: '', skills: [], roles: [], experienceYears: '', location: '' }

function App() {
  const [profile, setProfile] = useState<Profile>(emptyProfile)
  const [resumes, setResumes] = useState<Profile[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [status, setStatus] = useState<'idle' | 'uploading' | 'running' | 'done' | 'error'>('idle')
  const [notice, setNotice] = useState('Upload a resume to give the agent its starting context.')
  const [remoteOnly, setRemoteOnly] = useState(true)
  const [strictMode, setStrictMode] = useState(true)
  const [target, setTarget] = useState<number | ''>('')
  const [atsBoards, setAtsBoards] = useState('')
  const [selected, setSelected] = useState<Job | null>(null)
  const [kit, setKit] = useState<{ letter: string; checklist: string[]; resumeFocus: string } | null>(null)
  const [showBuilder, setShowBuilder] = useState(false)
  const [bName, setBName] = useState('')
  const [bEmail, setBEmail] = useState('')
  const [bPhone, setBPhone] = useState('')
  const [bLoc, setBLoc] = useState('')
  const [bSkills, setBSkills] = useState('')
  const [bRoles, setBRoles] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadedInSession = useRef(false)
  const query = useMemo(() => encodeURIComponent(profile?.roles?.[0] || ''), [profile.roles])
  const location = useMemo(() => encodeURIComponent(profile?.location || ''), [profile.location])

  useEffect(() => {
    // The user requested that data is deleted on refresh.
    // Instead of loading the persisted list, we clear it out on page load.
    fetch('/api/resumes', { method: 'DELETE' }).catch(() => {})
  }, [])

  async function upload(file?: File) {
    if (!file) return
    setStatus('uploading'); setNotice(`Reading ${file.name}…`)
    const form = new FormData(); form.append('resume', file)
    try {
      const response = await fetch('/api/resume', { method: 'POST', body: form }); const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Upload failed')
      setProfile(data.profile); setResumes([data.profile, ...resumes.filter(r => r.id !== data.profile.id)]); setJobs([]); setEvents([]); setStatus('idle'); setNotice(`Profile updated from ${file.name}.`)
    } catch (error) { setStatus('error'); setNotice(error instanceof Error ? error.message : 'Upload failed') }
  }

  async function deleteResume(id: string) {
    await fetch(`/api/resumes/${id}`, { method: 'DELETE' });
    const next = resumes.filter(r => r.id !== id);
    setResumes(next);
    if (profile.id === id) setProfile(next.length ? next[0] : emptyProfile);
  }

  async function clearResumes() {
    await fetch('/api/resumes', { method: 'DELETE' });
    setResumes([]);
    setProfile(emptyProfile);
  }

  async function submitBuilder(e: React.FormEvent) {
    e.preventDefault();
    setStatus('uploading'); setNotice('Building resume...');
    setShowBuilder(false);
    try {
       const payload = {
         name: bName, email: bEmail, phone: bPhone, location: bLoc, 
         skills: bSkills.split(',').map(s=>s.trim()).filter(Boolean),
         roles: bRoles.split(',').map(s=>s.trim()).filter(Boolean),
         experience: [], education: []
       };
       const response = await fetch('/api/resumes/build', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
       const data = await response.json();
       if (!response.ok) throw new Error(data.error);
       
       setResumes([data.profile, ...resumes]);
       setProfile(data.profile);
       
       const link = document.createElement('a');
       link.href = 'data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,' + data.fileBase64;
       link.download = data.profile.filename;
       link.click();
       
       setStatus('idle'); setNotice(`Resume built and set as active.`);
    } catch(err) {
       setStatus('error'); setNotice(err instanceof Error ? err.message : 'Build failed');
    }
  }

  async function runAgent() {
    setStatus('running'); setJobs([]); setEvents([{ type: 'observe', tool: 'Agent', message: 'Starting a fresh evidence-based job search.' }]); setNotice('Agent is planning queries and checking live job sources…')
    try {
      const response = await fetch('/api/agent/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, preferences: { remoteOnly, strictMode, location: profile.location, atsBoards }, target }) })
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Agent run failed')
      setEvents(data.events); setJobs(data.jobs); setStatus('done'); setNotice(`Ranked ${data.jobs.length} live opportunities from ${data.metrics.searched} search strategies. Results are saved locally.`)
    } catch (error) { setStatus('error'); setNotice(error instanceof Error ? error.message : 'The agent could not complete this search.') }
  }
  async function createKit(job: Job) {
    setSelected(job); setKit(null)
    const response = await fetch('/api/application-kit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profile, job }) })
    const data = await response.json(); if (response.ok) setKit(data); else setNotice(data.error || 'Could not make the application kit.')
  }
  function updateList(field: 'skills' | 'roles', text: string) { setProfile(current => ({ ...current, [field]: text.split(',').map(s => s.trim()).filter(Boolean) })) }
  function boardLink(pattern: string) { return pattern.replace('{q}', query).replace('{l}', location) }

  return <main>
    <header className="topbar"><a className="brand" href="#top"><span className="orbit">✦</span> CAREER ORBIT</a><div className="topmeta"><span className="pulse" /> Autonomous search agent <span className="divider" /> Local-first memory</div></header>
    <section className="hero" id="top">
      <div><p className="eyebrow">JOB SEARCH, WITH RECEIPTS</p><h1>Find work that<br /><i>fits the way you do.</i></h1><p className="lede">A transparent job agent that reads your resume, searches compliant public sources, ranks real listings, and prepares a thoughtful application kit.</p><div className="hero-actions"><button className="primary" onClick={() => fileRef.current?.click()}>Upload resume <span>↗</span></button><button className="text-button" onClick={() => setShowBuilder(true)}>Build resume</button></div>{profile.filename && <p className="file-status">✓ Active resume: {profile.filename}</p>}<input ref={fileRef} type="file" accept=".pdf,.docx,.txt,.md,.rtf" onChange={event => upload(event.target.files?.[0])} hidden /></div>
      <aside className="hero-card"><div className="signal"><span>AGENT SIGNAL</span><b>{status === 'running' ? 'Working' : status === 'done' ? 'Search complete' : 'Ready'}</b></div><div className="signal-stat"><strong>{jobs.length}</strong><small>ranked opportunities</small></div><div className="timeline"><p><em /> Parse profile</p><p><em className={profile.filename ? 'on' : ''} /> Plan independent searches</p><p><em className={status === 'done' ? 'on' : ''} /> Verify, dedupe & rank</p></div></aside>
    </section>
    <section className="control-grid">
      <div className="profile-card card"><div className="section-heading"><span>01 / Search brief</span>{resumes.length > 0 ? <div className="resume-controls"><select className="resume-select" value={profile.id} onChange={e => { const p = resumes.find(r => r.id === e.target.value); if (p) setProfile(p); }}>{resumes.map(r => <option key={r.id} value={r.id}>{r.filename || r.name}</option>)}</select><button onClick={() => deleteResume(profile.id)} className="icon-button text-danger" title="Delete active resume">🗑️</button><button onClick={clearResumes} className="icon-button" style={{width:'auto', padding:'0 8px', fontSize:'12px'}} title="Delete all resumes">Clear All</button></div> : <b>No file attached</b>}</div><div className="identity"><div className="avatar">{profile.name ? profile.name.slice(0, 1).toUpperCase() : '?'}</div><div><strong>{profile.name || 'Candidate'}</strong><p>{profile.email || 'Your profile is stored on this device.'}</p></div></div><label>Role focus<input value={profile.roles.join(', ')} onChange={e => updateList('roles', e.target.value)} /></label><p className="field-help">Derived from the active resume. Edit this to steer the next search.</p><label>Skills<input value={profile.skills.join(', ')} onChange={e => updateList('skills', e.target.value)} /></label><div className="field-row"><label>Location<input value={profile.location} onChange={e => setProfile({ ...profile, location: e.target.value })} placeholder="India / Remote" /></label><label>Experience<input value={profile.experienceYears} onChange={e => setProfile({ ...profile, experienceYears: e.target.value })} /></label></div></div>
      <div className="run-card card"><div className="section-heading"><span>02 / Agent objective</span><b>Editable before each run</b></div><h2>Collect <input className="target" type="number" min="1" max="50" value={target} onChange={e => setTarget(Number(e.target.value))} /> high-quality opportunities</h2><div style={{display:'flex', gap:'20px'}}><label className="toggle"><input type="checkbox" checked={remoteOnly} onChange={e => setRemoteOnly(e.target.checked)} /><span /> Prefer remote roles</label><label className="toggle"><input type="checkbox" checked={strictMode} onChange={e => setStrictMode(e.target.checked)} /><span /> Strict filtering</label></div><label>Official ATS boards<input value={atsBoards} onChange={e => setAtsBoards(e.target.value)} placeholder="ashby:company, greenhouse:company" /></label><p className="field-help">Optional direct feeds: <code>ashby:notion</code>, <code>greenhouse:company</code>, or <code>lever:company</code>.</p><button className="primary full" onClick={runAgent} disabled={status === 'running'}>{status === 'running' ? 'Agent is working…' : 'Start autonomous search'} <span>→</span></button><p className="notice" aria-live="polite">{notice}</p></div>
    </section>
    <section className="agent-log"><div><p className="eyebrow">LIVE AGENT TRACE</p><h2>A decision trail, not a black box.</h2></div><div className="log-list">{events.length ? events.slice(-4).map((event, index) => <div className="log" key={`${event.message}-${index}`}><span className={`logdot ${event.type}`} /> <b>{event.tool}</b><p>{event.message}</p></div>) : <div className="log muted"><span className="logdot" /><p>Your planner, sources, retries, and quality checks will appear here.</p></div>}</div></section>
    <section className="results"><div className="results-head"><div><p className="eyebrow">OPPORTUNITY RADAR</p><h2>{jobs.length ? `${jobs.length} opportunities worth your time.` : profile.filename ? 'Your search brief is ready.' : 'Build your search brief.'}</h2></div><span className="source-note">Live API results · Direct original links</span></div>{jobs.length ? <div className="job-list">{jobs.map(job => <article className="job" key={job.externalId}><div className="score"><strong>{job.matchScore}</strong><span>match</span></div><div className="job-main"><div className="job-title"><div><h3>{job.title}</h3><p>{job.company} <span>·</span> {job.location}</p></div><span className="verified">● {job.verification}</span></div><div className="tags">{job.matchedSkills.slice(0, 4).map(skill => <span key={skill}>{skill}</span>)}{job.salary && <span>{job.salary}</span>}</div><p className="job-reason">{job.reason}</p></div><div className="job-actions"><a href={job.url} target="_blank" rel="noreferrer">Open listing ↗</a><button onClick={() => createKit(job)}>Application kit</button></div></article>)}</div> : <div className="premium-empty">
  <div className="premium-empty-icon">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>
  </div>
  <h3>{profile.filename ? 'Ready to search your active resume.' : 'Add a resume to begin.'}</h3>
  <p>{profile.filename ? 'Your role focus, skills, and location are set. Start the agent to collect and rank fresh opportunities.' : 'Upload a resume to build your role focus, skills, and location automatically.'}</p>
  
  {!profile.filename && <div className="premium-features">
    <div className="premium-feature">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <b>PDF, DOC, DOCX</b>
      <span>Supported formats</span>
    </div>
    <div className="premium-feature">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M10 11l2 2 4-4"/></svg>
      <b>Secure & Private</b>
      <span>Your data is safe with us</span>
    </div>
    <div className="premium-feature">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
      <b>Auto Extract</b>
      <span>We'll find the key info</span>
    </div>
  </div>}
  
  <button className="btn-premium" onClick={profile.filename ? runAgent : () => fileRef.current?.click()} disabled={status === 'running'}>
    {profile.filename ? (
      <><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Start the agent</>
    ) : (
      <><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg> Choose a resume</>
    )}
  </button>
  
  {!profile.filename && <div className="premium-empty-footer">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    We never share your resume
  </div>}
</div>}</section>
    <section className="board-section"><div><p className="eyebrow">EXPAND WITH YOUR ACCOUNTS</p><h2>Search the boards that know you best.</h2><p>Some platforms restrict automated collection. These direct, pre-filled searches keep you in control and within their terms. For automated direct links, add a company’s official Greenhouse, Lever, or Ashby board ID above.</p></div><div className="boards">{boards.map(([name, link]) => <a key={name} href={boardLink(link)} target="_blank" rel="noreferrer"><span>{name}</span><b>↗</b></a>)}</div></section>
    {selected && <div className="modal-backdrop" onMouseDown={() => setSelected(null)}><section className="modal" onMouseDown={e => e.stopPropagation()}><button className="close" onClick={() => setSelected(null)}>×</button><p className="eyebrow">APPLICATION KIT</p><h2>{selected.title}<br /><i>at {selected.company}</i></h2>{kit ? <><div className="kit-focus"><b>Resume focus</b><p>{kit.resumeFocus}</p></div><label>Tailored cover letter<textarea readOnly value={kit.letter} /></label><div className="checklist"><b>Before you submit</b>{kit.checklist.map(item => <p key={item}>✓ {item}</p>)}</div></> : <p>Building your materials…</p>}</section></div>}
    {showBuilder && <div className="modal-backdrop" onMouseDown={() => setShowBuilder(false)}>
  <section className="premium-modal" onMouseDown={e => e.stopPropagation()} style={{maxWidth: '720px', width: '90%', position:'relative'}}>
    <button className="close" style={{top:'24px', right:'24px'}} onClick={() => setShowBuilder(false)}>×</button>
    
    <div className="premium-modal-header">
      <span className="premium-modal-eyebrow">RESUME BUILDER</span>
      <h2>Build an <span>ATS-friendly</span> resume</h2>
      <p>Fill in your details and let AI create a professional resume for you.</p>
    </div>

    <form onSubmit={submitBuilder}>
      <div className="premium-form-grid">
        <div className="premium-input-group">
          <label>Full Name</label>
          <div className="premium-input-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            <input required value={bName} onChange={e=>setBName(e.target.value)} placeholder="Enter your full name" />
          </div>
        </div>
        <div className="premium-input-group">
          <label>Email</label>
          <div className="premium-input-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            <input type="email" value={bEmail} onChange={e=>setBEmail(e.target.value)} placeholder="Enter your email address" />
          </div>
        </div>
        <div className="premium-input-group">
          <label>Phone</label>
          <div className="premium-input-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            <input value={bPhone} onChange={e=>setBPhone(e.target.value)} placeholder="Enter your phone number" />
          </div>
        </div>
        <div className="premium-input-group">
          <label>Location</label>
          <div className="premium-input-wrapper">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            <input value={bLoc} onChange={e=>setBLoc(e.target.value)} placeholder="e.g. Remote, India" />
          </div>
        </div>
      </div>

      <div className="premium-input-group" style={{marginBottom:'24px'}}>
        <label>Target Roles (comma separated)</label>
        <div className="premium-input-wrapper">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          <input value={bRoles} onChange={e=>setBRoles(e.target.value)} placeholder="e.g. Frontend Developer, Software Engineer, Data Analyst" />
        </div>
      </div>

      <div className="premium-input-group" style={{marginBottom:'32px'}}>
        <label>Skills (comma separated)</label>
        <div className="premium-input-wrapper">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          <input value={bSkills} onChange={e=>setBSkills(e.target.value)} placeholder="e.g. JavaScript, React, Node.js, Python, SQL" />
        </div>
      </div>

      <button type="submit" className="btn-premium btn-premium-full">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"/></svg>
        Generate & Use Resume
      </button>
      
      <div className="premium-empty-footer" style={{justifyContent:'center', marginTop:'16px'}}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        Your data is secure and never shared.
      </div>
    </form>
  </section>
</div>}
    <footer>Career Orbit does not auto-apply or scrape restricted boards. Always review the original listing before applying.</footer>
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
