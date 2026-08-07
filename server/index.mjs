import cors from 'cors'
import express from 'express'
import mammoth from 'mammoth'
import multer from 'multer'
import pdf from 'pdf-parse'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildDocx } from './docxBuilder.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const stateFile = path.join(root, 'data', 'state.json')
const app = express()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } })

app.use(cors())
app.use(express.json({ limit: '1mb' }))

async function loadState() {
  try { return JSON.parse(await readFile(stateFile, 'utf8')) } catch { return { profiles: {}, jobs: [], applications: [], agentRuns: [] } }
}
async function loadSearchRules() {
  try { return JSON.parse(await readFile(path.join(root, 'src', 'config', 'searchRules.json'), 'utf8')) } catch { 
    return { filtering: { role: 'flexible', location: 'flexible', skills: 'flexible', remoteOverridesLocation: true }, ranking: { weights: { role: 40, skills: 30, location: 20, experience: 10 }, minimumScore: 30 } } 
  }
}
async function saveState(state) {
  await mkdir(path.dirname(stateFile), { recursive: true })
  await writeFile(stateFile, JSON.stringify(state, null, 2), 'utf8')
}
function clean(value = '') { return String(value).replace(/\s+/g, ' ').trim() }
function uniq(items) { return [...new Set(items.filter(Boolean))] }
function profileFromText(rawText, filename = 'resume') {
  const text = rawText.replace(/\r/g, '')
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || ''
  const phone = text.match(/(?:\+?\d{1,3}[ .-]?)?(?:\(?\d{2,5}\)?[ .-]?)?\d{3,5}[ .-]\d{4,6}/)?.[0] || ''
  const known = ['React', 'TypeScript', 'JavaScript', 'Next.js', 'Node.js', 'Python', 'Java', 'SQL', 'PostgreSQL', 'MongoDB', 'Docker', 'AWS', 'Azure', 'GCP', 'Git', 'Figma', 'HTML', 'CSS', 'Tailwind', 'Angular', 'Vue', 'Express', 'REST', 'GraphQL', 'Kubernetes', 'Machine Learning', 'TensorFlow', 'Power BI', 'Excel', 'SEO', 'SEM', 'Content Marketing', 'Social Media', 'Google Analytics', 'Google Ads', 'Facebook Ads', 'Copywriting', 'Email Marketing', 'HubSpot', 'Salesforce', 'CRM', 'B2B', 'B2C', 'Adobe Creative Suite', 'Photoshop', 'Illustrator', 'InDesign', 'Video Editing', 'Market Research', 'Project Management', 'Agile', 'Scrum', 'Jira']
  const skills = known.filter(skill => new RegExp(`\\b${skill.replace('.', '\\.') }\\b`, 'i').test(text))
  const explicitRoleSignals = [
    ['Full Stack Developer', /\bfull[ -]?stack (?:developer|engineer)\b/i], ['Software Developer', /\bsoftware developer\b/i],
    ['Software Engineer', /\bsoftware engineer\b|\bsde[- ]?[12]?\b/i], ['Frontend Developer', /\bfront[ -]?end (?:developer|engineer)\b/i],
    ['Backend Developer', /\bback[ -]?end (?:developer|engineer)\b/i], ['Data Analyst', /\bdata analyst\b/i],
    ['AI/ML Engineer', /\b(?:ai|machine learning|ml) (?:engineer|developer)\b/i], ['DevOps Engineer', /\bdevops engineer\b/i],
    ['Digital Marketing', /\bdigital marketing\b/i], ['Graphic Designer', /\bgraphic design(?:er)?\b/i],
    ['Product Manager', /\bproduct manager\b/i], ['Sales Executive', /\bsales (?:executive|manager)\b/i]
  ]
  const explicitRoles = explicitRoleSignals.filter(([, rx]) => rx.test(text)).map(([role]) => role)
  let roles = uniq(explicitRoles).slice(0, 3)
  
  if (roles.length === 0) {
    const fnClean = filename.replace(/\.(pdf|docx|txt|rtf|md)$/i, '').replace(/_|-/g, ' ').replace(/\b(resume|cv|profile)\b/ig, '').trim()
    if (fnClean.length > 2 && fnClean.length < 40) roles = [fnClean]
  }
  
  const lines = text.split('\n').map(clean).filter(Boolean)
  const firstNameLine = lines.find(line => line.length < 55 && !/@|resume|curriculum|linkedin|github/i.test(line)) || 'Candidate'
  return {
    id: crypto.randomUUID(), filename, name: firstNameLine, email, phone, rawText: text.slice(0, 40000),
    skills, roles,
    experienceYears: /\b([0-9]{1,2})\+?\s*(?:years|yrs)\b/i.exec(text)?.[1] || '',
    location: /(?:Bengaluru|Bangalore|Mumbai|Delhi|Pune|Hyderabad|Chennai|Ahmedabad|Kolkata|India|Remote)/i.exec(text)?.[0] || '',
    updatedAt: new Date().toISOString()
  }
}

app.get('/api/health', (_, res) => res.json({ ok: true, service: 'career-orbit', time: new Date().toISOString() }))

app.post('/api/resume', upload.single('resume'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Attach a resume file.' })
  const name = req.file.originalname || 'resume'
  const ext = path.extname(name).toLowerCase()
  let text = ''
  try {
    if (ext === '.pdf') text = (await pdf(req.file.buffer)).text
    else if (ext === '.docx') text = (await mammoth.extractRawText({ buffer: req.file.buffer })).value
    else if (['.txt', '.md', '.rtf'].includes(ext)) text = req.file.buffer.toString('utf8')
    else return res.status(415).json({ error: 'Supported formats are PDF, DOCX, TXT, MD and RTF. Convert legacy .doc or scanned images to DOCX/PDF with selectable text first.' })
  } catch (error) { return res.status(422).json({ error: `Could not read this file: ${error.message}` }) }
  if (clean(text).length < 25) return res.status(422).json({ error: 'No selectable text was found. For a scanned PDF, run OCR and upload the text-enabled PDF.' })
  const profile = profileFromText(text, name)
  // Remove rawText before persisting to protect privacy
  const { rawText, ...profileToSave } = profile
  const state = await loadState(); state.profiles[profile.id] = profileToSave; await saveState(state)
  res.json({ profile, textPreview: clean(text).slice(0, 800) })
})

app.get('/api/resumes', async (req, res) => {
  const state = await loadState()
  res.json(Object.values(state.profiles).sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)))
})

app.delete('/api/resumes/:id', async (req, res) => {
  const state = await loadState()
  delete state.profiles[req.params.id]
  state.jobs = state.jobs.filter(j => j.userId !== req.params.id)
  await saveState(state)
  res.json({ success: true })
})

app.delete('/api/resumes', async (req, res) => {
  const state = await loadState()
  state.profiles = {}
  state.jobs = []
  await saveState(state)
  res.json({ success: true })
})

app.post('/api/resumes/build', async (req, res) => {
  const data = req.body
  try {
    const docxBuffer = await buildDocx(data)
    const profile = {
      id: crypto.randomUUID(),
      filename: `${data.name.replace(/\s+/g, '_')}_Resume.docx`,
      name: data.name,
      email: data.email,
      phone: data.phone,
      location: data.location,
      skills: data.skills || [],
      roles: data.roles || [],
      experienceYears: data.experience?.length ? String(data.experience.length * 2) : '',
      rawText: JSON.stringify(data),
      updatedAt: new Date().toISOString()
    }
    const state = await loadState()
    state.profiles[profile.id] = profile
    await saveState(state)
    res.json({ profile, fileBase64: docxBuffer.toString('base64') })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/memory/:id', async (req, res) => {
  const state = await loadState()
  res.json({ profile: state.profiles[req.params.id] || null, jobs: state.jobs.filter(j => j.userId === req.params.id), applications: state.applications.filter(a => a.userId === req.params.id) })
})

app.put('/api/memory/:id', async (req, res) => {
  const state = await loadState(); state.profiles[req.params.id] = { ...(state.profiles[req.params.id] || {}), ...req.body, id: req.params.id, updatedAt: new Date().toISOString() }; await saveState(state)
  res.json({ profile: state.profiles[req.params.id] })
})

function makeSearchPlan(profile, preferences = {}) {
  const titles = uniq(profile.roles || []).slice(0, 5)
  const locations = preferences.remoteOnly ? ['Remote'] : uniq([preferences.location, profile.location]).filter(Boolean).slice(0, 4)
  
  const queries = []
  if (titles.length > 0 && locations.length > 0) {
    queries.push(...titles.flatMap(title => locations.slice(0, 2).map(loc => `${title} ${loc}`)))
  } else if (titles.length > 0) {
    queries.push(...titles)
  } else if (locations.length > 0) {
    queries.push(...locations.map(loc => `${profile.skills.slice(0, 2).join(' ')} ${loc}`.trim()))
  } else {
    queries.push(profile.skills.slice(0, 3).join(' '))
  }

  return { titles, locations, queries: queries.filter(Boolean).slice(0, 8), sources: ['Remotive', 'Arbeitnow'], expansion: 'If fewer than the target are verified, add adjacent titles and remote roles.' }
}
function normalizeRemotive(job) {
  return { externalId: `remotive-${job.id}`, source: 'Remotive', title: clean(job.title), company: clean(job.company_name), location: clean(job.candidate_required_location || 'Remote'), url: job.url, description: clean(job.description?.replace(/<[^>]+>/g, ' ')), tags: (job.tags || []).map(clean), salary: clean(job.salary || ''), postedAt: job.publication_date || '', verification: 'Indexed by source API' }
}
function normalizeArbeitnow(job) {
  return { externalId: `arbeitnow-${job.slug || job.url}`, source: 'Arbeitnow', title: clean(job.title), company: clean(job.company_name), location: clean(job.location || (job.remote ? 'Remote' : 'Not listed')), url: job.url, description: clean(job.description?.replace(/<[^>]+>/g, ' ')), tags: (job.tags || []).map(clean), salary: '', postedAt: job.created_at ? new Date(job.created_at * 1000).toISOString() : '', verification: 'Indexed by source API' }
}
function normalizeJobicy(job) {
  return { externalId: `jobicy-${job.id || job.url}`, source: 'Jobicy', title: clean(job.jobTitle), company: clean(job.companyName), location: clean(job.jobGeo || 'Remote'), url: job.url, description: clean(job.jobDescription || ''), tags: (job.jobIndustry || []).map(clean), salary: clean(job.annualSalaryMin && job.annualSalaryMax ? `$${job.annualSalaryMin}–$${job.annualSalaryMax}` : ''), postedAt: job.pubDate || '', verification: 'Indexed by source API' }
}
function normalizeGreenhouse(job, board) {
  return { externalId: `greenhouse-${board}-${job.id}`, source: `Greenhouse · ${board}`, title: clean(job.title), company: board, location: clean(job.location?.name || 'Not listed'), url: job.absolute_url, description: clean(job.content?.replace(/<[^>]+>/g, ' ') || ''), tags: (job.departments || []).map(d => clean(d.name)), salary: '', postedAt: job.updated_at || '', verification: 'Direct official ATS API' }
}
function normalizeLever(job, board) {
  return { externalId: `lever-${board}-${job.id}`, source: `Lever · ${board}`, title: clean(job.text), company: board, location: clean(job.categories?.location || 'Not listed'), url: job.hostedUrl || job.applyUrl, description: clean(job.descriptionPlain || job.description?.replace(/<[^>]+>/g, ' ') || ''), tags: [clean(job.categories?.team), clean(job.categories?.commitment)], salary: '', postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : '', verification: 'Direct official ATS API' }
}
function normalizeAshby(job, board) {
  return { externalId: `ashby-${board}-${job.id}`, source: `Ashby · ${board}`, title: clean(job.title), company: board, location: clean(job.location || job.locationName || 'Not listed'), url: job.applyUrl || job.jobUrl, description: clean(job.descriptionPlain || job.description?.replace(/<[^>]+>/g, ' ') || ''), tags: (job.workplaceType ? [job.workplaceType] : []), salary: clean(job.compensation?.summary || ''), postedAt: job.publishedAt || '', verification: 'Direct official ATS API' }
}
function parseAtsBoards(value = '') {
  return String(value).split(',').map(item => item.trim()).filter(Boolean).map(item => {
    const [provider, board] = item.split(':').map(part => part.trim().toLowerCase())
    return ['greenhouse', 'lever', 'ashby'].includes(provider) && board ? { provider, board } : null
  }).filter(Boolean)
}
async function searchOfficialAts(boards, query, events) {
  const results = []
  for (const { provider, board } of boards) {
    const endpoint = provider === 'greenhouse' ? `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(board)}/jobs?content=true` : provider === 'lever' ? `https://api.lever.co/v0/postings/${encodeURIComponent(board)}?mode=json` : `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`
    try {
      events.push({ type: 'tool', tool: `${provider} official API`, message: `Checking ${board}'s direct careers feed.` })
      const response = await fetch(endpoint, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'CareerOrbit/1.0 (candidate job discovery)' } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      const rows = provider === 'greenhouse' ? data.jobs || [] : provider === 'lever' ? data || [] : data.jobs || []
      const words = query.toLowerCase().split(/\s+/).filter(word => word.length > 2)
      const normalized = rows.map(job => provider === 'greenhouse' ? normalizeGreenhouse(job, board) : provider === 'lever' ? normalizeLever(job, board) : normalizeAshby(job, board))
      const relevant = normalized.filter(job => words.some(word => `${job.title} ${job.description} ${job.tags.join(' ')}`.toLowerCase().includes(word)))
      results.push(...relevant); events.push({ type: 'result', tool: `${provider} official API`, message: `${relevant.length} relevant direct-apply listings from ${board}.` })
    } catch (error) { events.push({ type: 'retry', tool: `${provider} official API`, message: `${board} feed was unavailable (${error.message}); continuing without it.` }) }
  }
  return results
}
function normalizeSearchResult(item, source) {
  const domain = (() => { try { return new URL(item.link || item.url).hostname.replace(/^www\./, '') } catch { return 'Company careers' } })()
  return { externalId: `${source}-${item.link || item.url}`, source, title: clean(item.title || item.name), company: clean(item.displayLink || item.siteName || domain), location: 'See original listing', url: item.link || item.url, description: clean(item.snippet || item.description || ''), tags: [], salary: '', postedAt: item.dateLastCrawled || '', verification: 'Discovered by configured search provider' }
}
async function searchConfiguredWeb(query, events) {
  const googleKey = process.env.GOOGLE_CSE_API_KEY; const googleCx = process.env.GOOGLE_CSE_ID; const bingKey = process.env.BING_SEARCH_API_KEY
  const searchQuery = `${query} (site:linkedin.com/jobs OR site:indeed.com OR site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com)`
  try {
    if (googleKey && googleCx) {
      events.push({ type: 'tool', tool: 'Google Custom Search', message: 'Discovering official ATS links through your configured search engine.' })
      const response = await fetch(`https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(googleKey)}&cx=${encodeURIComponent(googleCx)}&q=${encodeURIComponent(searchQuery)}`, { signal: AbortSignal.timeout(12000) })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json(); const jobs = (data.items || []).map(item => normalizeSearchResult(item, 'Google Custom Search'))
      events.push({ type: 'result', tool: 'Google Custom Search', message: `${jobs.length} direct ATS links discovered.` }); return jobs
    }
    if (bingKey) {
      events.push({ type: 'tool', tool: 'Bing Web Search', message: 'Discovering official ATS links through your configured search engine.' })
      const response = await fetch(`https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(searchQuery)}&count=20`, { signal: AbortSignal.timeout(12000), headers: { 'Ocp-Apim-Subscription-Key': bingKey } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json(); const jobs = (data.webPages?.value || []).map(item => normalizeSearchResult(item, 'Bing Web Search'))
      events.push({ type: 'result', tool: 'Bing Web Search', message: `${jobs.length} direct ATS links discovered.` }); return jobs
    }
    events.push({ type: 'observe', tool: 'Search provider', message: 'No Google Custom Search or Bing key configured; using public API sources and official ATS feeds.' })
  } catch (error) { events.push({ type: 'retry', tool: 'Search provider', message: `Search provider failed (${error.message}); continuing with source APIs.` }) }
  return []
}
async function searchLinkedInGuest(query, location, events) {
  const results = [];
  try {
    const terms = encodeURIComponent(query);
    const loc = encodeURIComponent(location || 'Worldwide');
    events.push({ type: 'tool', tool: 'LinkedIn Public API', message: `Searching local listings for “${query}” in ${location || 'Worldwide'}.` });
    const response = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${terms}&location=${loc}&start=0`, {
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    
    const jobCards = html.split('<div class="base-card').slice(1);
    for (const card of jobCards) {
      const titleMatch = card.match(/<h3 class="base-search-card__title">\s*(.*?)\s*<\/h3>/is);
      const companyMatch = card.match(/<h4 class="base-search-card__subtitle">\s*<a[^>]*>\s*(.*?)\s*<\/a>/is) || card.match(/<h4 class="base-search-card__subtitle">\s*(.*?)\s*<\/h4>/is);
      const locationMatch = card.match(/<span class="job-search-card__location">\s*(.*?)\s*<\/span>/is);
      const urlMatch = card.match(/href="(.*?)"/);
      const timeMatch = card.match(/<time[^>]*datetime="(.*?)"/);
      const urnMatch = card.match(/data-entity-urn="(.*?)"/);
      
      if (titleMatch && companyMatch && locationMatch) {
        results.push({
          externalId: `linkedin-${urnMatch ? urnMatch[1] : Date.now()}`,
          source: 'LinkedIn',
          title: clean(titleMatch[1].replace(/&amp;/g, '&')),
          company: clean(companyMatch[1].replace(/&amp;/g, '&')),
          location: clean(locationMatch[1].replace(/&amp;/g, '&')),
          url: urlMatch ? urlMatch[1] : '#',
          description: 'Apply on LinkedIn to see full description.',
          tags: [],
          salary: '',
          postedAt: timeMatch ? timeMatch[1] : '',
          verification: 'Verified via public source'
        });
      }
    }
    events.push({ type: 'result', tool: 'LinkedIn Public API', message: `${results.length} local jobs discovered.` });
  } catch (error) {
    events.push({ type: 'retry', tool: 'LinkedIn Public API', message: `Unavailable (${error.message}); continuing without it.` });
  }
  return results;
}

async function searchLiveJobs(query, events) {
  const terms = encodeURIComponent(query)
  const results = []
  try {
    events.push({ type: 'tool', tool: 'Remotive public API', message: `Searching live remote listings for “${query}”.` })
    const response = await fetch(`https://remotive.com/api/remote-jobs?search=${terms}`, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'CareerOrbit/1.0 (candidate job discovery)' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json(); results.push(...(data.jobs || []).map(normalizeRemotive))
    events.push({ type: 'result', tool: 'Remotive public API', message: `${data.jobs?.length || 0} listings returned.` })
  } catch (error) { events.push({ type: 'retry', tool: 'Remotive public API', message: `Unavailable (${error.message}); continuing with another source.` }) }
  try {
    events.push({ type: 'tool', tool: 'Arbeitnow public API', message: 'Checking a second independent live source.' })
    const response = await fetch('https://www.arbeitnow.com/api/job-board-api', { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'CareerOrbit/1.0 (candidate job discovery)' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json(); const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
    const matching = (data.data || []).map(normalizeArbeitnow).filter(j => words.some(w => `${j.title} ${j.tags.join(' ')} ${j.description}`.toLowerCase().includes(w)))
    results.push(...matching); events.push({ type: 'result', tool: 'Arbeitnow public API', message: `${matching.length} relevant listings returned.` })
  } catch (error) { events.push({ type: 'retry', tool: 'Arbeitnow public API', message: `Unavailable (${error.message}); the agent retained other results.` }) }
  try {
    let tag = 'programming'
    if (/marketing|digital|seo|content/i.test(query)) tag = 'marketing'
    else if (/design|graphic|ui|ux/i.test(query)) tag = 'design'
    else if (/sales|business/i.test(query)) tag = 'sales'
    else if (/support|customer/i.test(query)) tag = 'support'
    else if (/finance|accounting/i.test(query)) tag = 'finance'
    else if (/manager|product/i.test(query)) tag = 'management'
    
    events.push({ type: 'tool', tool: 'Jobicy public API', message: `Searching a third live source using the ${tag} category.` })
    const response = await fetch(`https://jobicy.com/api/v2/remote-jobs?count=50&industry=${encodeURIComponent(tag)}`, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'CareerOrbit/1.0 (candidate job discovery)' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json(); const jobs = data.jobs || data.data || []; results.push(...jobs.map(normalizeJobicy))
    events.push({ type: 'result', tool: 'Jobicy public API', message: `${jobs.length} remote listings returned.` })
  } catch (error) { events.push({ type: 'retry', tool: 'Jobicy public API', message: `Unavailable (${error.message}); continuing with retained results.` }) }
  return results
}
const roleAliases = {
  'frontend developer': ['frontend engineer', 'front end developer', 'react developer', 'ui developer', 'frontend'],
  'backend developer': ['backend engineer', 'back end developer', 'node developer', 'java developer', 'backend'],
  'software developer': ['software engineer', 'sde', 'programmer', 'full stack developer', 'fullstack'],
  'business development executive': ['bde', 'business development', 'account executive', 'sales executive']
}
function getAliases(role) {
  const normalized = role.toLowerCase().trim()
  for (const [key, aliases] of Object.entries(roleAliases)) {
    if (key === normalized || aliases.includes(normalized)) return [key, ...aliases]
  }
  return [normalized]
}

function scoreJob(job, profile, preferences = {}, rules) {
  const haystack = `${job.title} ${job.description} ${job.tags.join(' ')}`.toLowerCase()
  const matchedSkills = profile.skills.filter(s => haystack.includes(s.toLowerCase()))
  
  // Strict Filtering
  if (rules.filtering.role === 'strict' && profile.roles && profile.roles.length > 0) {
    const profileRoleAliases = (profile.roles || []).flatMap(r => getAliases(r))
    const jobTitleNormalized = job.title.toLowerCase()
    const roleMatches = profileRoleAliases.some(alias => jobTitleNormalized.includes(alias))
    if (!roleMatches) return { ...job, status: 'Rejected', reasons: ['Role mismatch'], matchScore: 0 }
  }
  if (rules.filtering.skills === 'minimum_one_match' && matchedSkills.length === 0 && profile.skills && profile.skills.length > 0) {
    return { ...job, status: 'Rejected', reasons: [`Skills overlap: 0/${profile.skills.length}`], matchScore: 0 }
  }
  const isRemoteJob = /remote/i.test(job.location) || job.location.toLowerCase() === 'remote'
  if (rules.filtering.location === 'strict' && profile.location) {
    const locMatch = job.location.toLowerCase().includes(profile.location.toLowerCase())
    const isWorldwide = job.location.toLowerCase() === 'remote' || job.location.toLowerCase() === 'anywhere' || job.location.toLowerCase().includes('worldwide') || job.location.toLowerCase().includes('global') || job.location.toLowerCase().includes('any')
    const remoteOverride = rules.filtering.remoteOverridesLocation && preferences.remoteOnly && isWorldwide
    if (!locMatch && !remoteOverride) {
      return { ...job, status: 'Rejected', reasons: ['Location mismatch'], matchScore: 0 }
    }
  }

  // Weighted Scoring
  const w = rules.ranking.weights
  const skillScore = Math.round((matchedSkills.length / Math.max(profile.skills.length, 1)) * 100)
  
  let roleScore = 0
  const profileRoleAliasesForScoring = (profile.roles || []).flatMap(r => getAliases(r))
  const titleForScoring = job.title.toLowerCase()
  if (profileRoleAliasesForScoring.some(alias => titleForScoring.includes(alias))) {
    roleScore = 100
  } else {
    const roleWords = profileRoleAliasesForScoring.flatMap(r => r.split(' ')).filter(w => w.length > 3)
    if (roleWords.some(w => titleForScoring.includes(w))) {
      roleScore = 60
    }
  }

  // If role is completely unrelated, we forcefully reject it unless skills are a very strong match
  if (roleScore === 0 && skillScore < 50) {
     return { ...job, status: 'Rejected', reasons: ['Role completely unrelated'], matchScore: 0 }
  }

  const locationScore = isRemoteJob && preferences.remoteOnly ? 100 : (profile.location && job.location.toLowerCase().includes(profile.location.toLowerCase()) ? 100 : 0)
  const experienceScore = 75 // hardcoded for now, could be dynamic
  
  const finalScore = Math.round((skillScore * (w.skills/100)) + (roleScore * (w.role/100)) + (locationScore * (w.location/100)) + (experienceScore * (w.experience/100)))

  if (finalScore < rules.ranking.minimumScore) {
     return { ...job, status: 'Rejected', reasons: [`Score ${finalScore} below minimum ${rules.ranking.minimumScore}`], matchScore: finalScore }
  }

  const missing = profile.skills.filter(s => !matchedSkills.includes(s)).slice(0, 4)
  return { 
    ...job, 
    status: 'Accepted',
    matchScore: finalScore, 
    matchedSkills, 
    missingSkills: missing, 
    reason: `Role: ${roleScore}, Skills: ${skillScore}, Location: ${locationScore}, Experience: ${experienceScore}` 
  }
}

app.post('/api/agent/run', async (req, res) => {
  const preferences = req.body.preferences || {}
  const target = Number(req.body.target) || 20
  const profile = req.body.profile
  if (!profile?.skills?.length) return res.status(400).json({ error: 'Upload a resume or add at least one skill before starting the agent.' })
  const events = [{ type: 'observe', tool: 'Memory', message: `Loaded candidate profile with ${profile.skills.length} skills and ${profile.roles.length} target roles.` }]
  const plan = makeSearchPlan(profile, preferences)
  events.push({ type: 'plan', tool: 'Planner', message: `Prioritized ${plan.titles.join(', ')} across ${plan.locations.join(', ')}.` })
  let raw = []
  
  const selectedBoards = parseAtsBoards(preferences.atsBoards || 'ashby:notion')
  const baseQuery = [plan.titles[0], ...profile.skills.slice(0, 2)].filter(Boolean).join(' ')
  const officialResults = baseQuery ? await searchOfficialAts(selectedBoards, baseQuery, events) : []
  
  const locQuery = profile.location || (preferences.remoteOnly ? 'Remote' : '')
  const webQuery = [plan.titles[0], locQuery, ...profile.skills.slice(0, 2)].filter(Boolean).join(' ')
  const webResults = webQuery ? await searchConfiguredWeb(webQuery, events) : [];
  const linkedInResults = await searchLinkedInGuest(plan.queries[0] || 'Jobs', profile.location, events)
  const liveResults = await Promise.all(plan.queries.slice(0, 2).map(q => searchLiveJobs(q, events)))
  
  raw = [...officialResults, ...webResults, ...linkedInResults, ...liveResults.flat()]
  
  if (!raw.length && profile.skills.length > 0) {
    events.push({ type: 'reflect', tool: 'Fallback planner', message: 'No source returned a usable listing; retrying with a wider skill-only query.' })
    raw.push(...await searchLiveJobs(profile.skills.slice(0, 3).join(' '), events))
  }
  const rules = await loadSearchRules()
  if (preferences.strictMode === false) {
    rules.filtering.role = 'flexible'
    rules.filtering.location = 'strict'
    rules.filtering.skills = 'flexible'
    rules.ranking.minimumScore = 20
  }
  
  const seen = new Set(); const unique = raw.filter(job => { const key = `${job.company}|${job.title}|${job.url}`.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return Boolean(job.url && job.title && job.company) })
  events.push({ type: 'verify', tool: 'Duplicate & integrity checker', message: `Removed ${raw.length - unique.length} duplicates and incomplete listings.` })
  
  const scoredJobs = unique.map(job => scoreJob(job, profile, preferences, rules))
  
  let jobs = scoredJobs.filter(j => j.status === 'Accepted').sort((a, b) => {
    if (profile.location) {
      const aExact = a.location.toLowerCase().includes(profile.location.toLowerCase()) ? 1 : 0;
      const bExact = b.location.toLowerCase().includes(profile.location.toLowerCase()) ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
    }
    return b.matchScore - a.matchScore;
  }).slice(0, target)
  
  // Fallback: If we don't have enough jobs, fill the quota with location-mismatched jobs and flag them
  if (jobs.length < target && preferences.strictMode === false) {
    const fallbackJobs = scoredJobs
      .filter(j => j.status === 'Rejected' && j.reasons.includes('Location mismatch'))
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, target - jobs.length)
      .map(j => ({ ...j, status: 'Accepted', reason: `⚠️ Location mismatch (${j.location}). ` + (j.reasons ? j.reasons.join(', ') : ''), matchedSkills: j.matchedSkills || [] }))
    
    jobs = [...jobs, ...fallbackJobs]
  }

  events.push({ type: 'reflect', tool: 'Reflection engine', message: jobs.length >= target ? `Goal met with ${jobs.length} ranked opportunities.` : `Found ${jobs.length}/${target} after strict filtering.` })
  
  // Development logging: structured rejection/acceptance reasons
  scoredJobs.forEach(j => {
    console.log(`\nJob: ${j.title} at ${j.company}\nStatus: ${j.status}`)
    if (j.status === 'Rejected') {
       console.log(`Reasons:\n- ${j.reasons.join('\n- ')}`)
    } else {
       console.log(`${j.reason}\nFinal Score: ${j.matchScore}`)
    }
  })


  const state = await loadState(); const userId = profile.id || 'local-user'; state.profiles[userId] = profile
  const persistedJobs = jobs.map(job => ({ ...job, userId, discoveredAt: new Date().toISOString() }))
  state.jobs = [...persistedJobs, ...state.jobs.filter(job => job.userId !== userId)]
  state.agentRuns.unshift({ id: crypto.randomUUID(), userId, createdAt: new Date().toISOString(), plan, events, count: jobs.length }); state.agentRuns = state.agentRuns.slice(0, 20); await saveState(state)
  res.json({ plan, events, jobs, metrics: { searched: plan.queries.slice(0, 3).length, found: raw.length, deduplicated: raw.length - unique.length, ranked: jobs.length } })
})

app.post('/api/application-kit', async (req, res) => {
  const { profile, job } = req.body
  if (!profile || !job) return res.status(400).json({ error: 'A profile and job are required.' })
  const skills = (job.matchedSkills || profile.skills).slice(0, 4).join(', ')
  const letter = `Dear ${job.company} hiring team,\n\nI am excited to apply for the ${job.title} role. My experience with ${skills} aligns closely with the work described in your posting. I am especially interested in the opportunity to contribute at ${job.company} while continuing to build reliable, thoughtful products.\n\nMy resume highlights relevant projects and outcomes, and I would welcome the chance to discuss how I can contribute to your team.\n\nSincerely,\n${profile.name || 'Candidate'}`
  const checklist = ['Open the original listing and confirm the closing date.', 'Tailor the top resume summary to the role keywords.', `Add evidence for: ${(job.matchedSkills || profile.skills).slice(0, 3).join(', ')}.`, 'Review the application form manually before submitting.']
  res.json({ letter, checklist, resumeFocus: `Lead with ${skills}. Address gaps: ${(job.missingSkills || []).join(', ') || 'none identified from listing text'}.` })
})

app.use(express.static(path.join(root, 'dist')))
app.get('*', (_, res) => res.sendFile(path.join(root, 'dist', 'index.html'), error => { if (error) res.status(404).json({ error: 'Frontend build not found. Run npm run build or npm run dev.' }) }))

const port = Number(process.env.PORT || 8788)
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => console.log(`Career Orbit API listening on http://localhost:${port}`))
}


export { scoreJob, makeSearchPlan, getAliases, clean, uniq }
