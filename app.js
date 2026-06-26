// ─── CONFIG — paste your Supabase credentials here ───────────────────────────
const SUPABASE_URL     = 'https://YOUR_PROJECT.supabase.co'
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY'

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ─── PIPELINE STAGES ─────────────────────────────────────────────────────────
const STAGES = [
  { id: 'new_lead',          label: 'New Lead',          meaning: 'Found business',  color: '#6366f1' },
  { id: 'contacted',         label: 'Contacted',         meaning: 'Message sent',    color: '#8b5cf6' },
  { id: 'interested',        label: 'Interested',        meaning: 'They replied',    color: '#a855f7' },
  { id: 'demo_sent',         label: 'Demo Sent',         meaning: 'Website shared',  color: '#f59e0b' },
  { id: 'meeting_scheduled', label: 'Meeting Scheduled', meaning: 'Call booked',     color: '#f97316' },
  { id: 'proposal_sent',     label: 'Proposal Sent',     meaning: 'Price given',     color: '#06b6d4' },
  { id: 'won',               label: 'Won',               meaning: 'Client paid',     color: '#10b981' },
  { id: 'lost',              label: 'Lost',              meaning: "Didn't proceed",  color: '#ef4444' },
  { id: 'follow_up',         label: 'Follow-Up',         meaning: 'Revisit later',   color: '#64748b' },
]

// ─── STATE ────────────────────────────────────────────────────────────────────
let leads       = []
let dragLeadId  = null
let openLeadId  = null

// ─── INIT ─────────────────────────────────────────────────────────────────────
sb.auth.getSession().then(({ data: { session } }) => {
  session ? showApp() : showAuth()
})

sb.auth.onAuthStateChange((_e, session) => {
  session ? showApp() : showAuth()
})

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function showAuth() {
  document.getElementById('app').innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-logo">📊</div>
        <h1 class="auth-title">CRM Pipeline</h1>
        <p class="auth-sub">Track every lead in one place.</p>
        <p id="auth-error" class="error-msg" style="display:none"></p>
        <input id="auth-email" type="email" placeholder="Email" />
        <input id="auth-pass"  type="password" placeholder="Password" />
        <button class="btn btn-primary" onclick="doAuth('login')">Sign In</button>
        <p class="auth-toggle">
          No account? <button class="link-btn" onclick="doAuth('signup')">Sign up</button>
        </p>
      </div>
    </div>`
}

async function doAuth(mode) {
  const email = document.getElementById('auth-email').value.trim()
  const pass  = document.getElementById('auth-pass').value
  const errEl = document.getElementById('auth-error')
  errEl.style.display = 'none'
  if (!email || !pass) { showErr(errEl, 'Fill in email and password.'); return }

  const fn = mode === 'login'
    ? sb.auth.signInWithPassword({ email, password: pass })
    : sb.auth.signUp({ email, password: pass })

  const { error } = await fn
  if (error) showErr(errEl, error.message)
}

// ─── APP SHELL ────────────────────────────────────────────────────────────────
async function showApp() {
  document.getElementById('app').innerHTML = `
    <div class="app">
      <header class="topbar">
        <div class="topbar-left">
          <span class="logo">📊 CRM Pipeline</span>
          <div class="stats-row" id="stats"></div>
        </div>
        <div class="topbar-right">
          <button class="btn btn-primary" onclick="openAddModal()">＋ Add Lead</button>
          <button class="btn-icon" onclick="signOut()" title="Sign out">⎋</button>
        </div>
      </header>
      <div class="board-scroll">
        <div class="board" id="board"></div>
      </div>
    </div>

    <!-- Lead Drawer -->
    <div class="overlay" id="drawer-overlay" onclick="closeDrawer(event)">
      <div class="drawer" id="drawer"></div>
    </div>

    <!-- Add Lead Modal -->
    <div class="modal-overlay" id="modal-overlay" onclick="closeModal(event)">
      <div class="modal" id="modal"></div>
    </div>`

  await loadLeads()
}

async function signOut() {
  await sb.auth.signOut()
}

// ─── DATA ─────────────────────────────────────────────────────────────────────
async function loadLeads() {
  const { data, error } = await sb.from('leads').select('*').order('created_at', { ascending: false })
  if (error) { console.error(error); return }
  leads = data
  renderBoard()
  renderStats()
}

async function createLead(payload) {
  const { data, error } = await sb.from('leads').insert(payload).select().single()
  if (error) throw error
  leads.unshift(data)
  renderBoard(); renderStats()
  return data
}

async function updateLead(id, updates) {
  const { data, error } = await sb.from('leads').update(updates).eq('id', id).select().single()
  if (error) throw error
  leads = leads.map(l => l.id === id ? data : l)
  renderBoard(); renderStats()
  if (openLeadId === id) openDrawer(id)
  return data
}

async function deleteLead(id) {
  const { error } = await sb.from('leads').delete().eq('id', id)
  if (error) throw error
  leads = leads.filter(l => l.id !== id)
  renderBoard(); renderStats()
}

// ─── BOARD ────────────────────────────────────────────────────────────────────
function renderBoard() {
  const board = document.getElementById('board')
  if (!board) return
  board.innerHTML = STAGES.map(s => {
    const col = leads.filter(l => l.stage === s.id)
    const total = col.reduce((sum, l) => sum + (l.value || 0), 0)
    return `
      <div class="column"
           id="col-${s.id}"
           ondragover="onDragOver(event,'${s.id}')"
           ondragleave="onDragLeave(event)"
           ondrop="onDrop(event,'${s.id}')">
        <div class="col-header" style="border-top-color:${s.color}">
          <div class="col-title-row">
            <span class="col-label" style="color:${s.color}">${s.label}</span>
            <span class="col-count">${col.length}</span>
          </div>
          <span class="col-meaning">${s.meaning}</span>
          ${total > 0 ? `<span class="col-value">$${total.toLocaleString()}</span>` : ''}
        </div>
        <div class="col-cards" id="cards-${s.id}">
          ${col.length === 0
            ? `<div class="col-empty">Drop a lead here</div>`
            : col.map(l => cardHTML(l)).join('')}
        </div>
      </div>`
  }).join('')
}

function cardHTML(l) {
  return `
    <div class="card"
         id="card-${l.id}"
         draggable="true"
         ondragstart="onDragStart(event,'${l.id}')"
         ondragend="onDragEnd(event)">
      <div class="card-top">
        <span class="card-name">${esc(l.name)}</span>
        <button class="delete-btn" onclick="confirmDelete('${l.id}',this)" title="Delete">✕</button>
      </div>
      ${l.company ? `<div class="card-meta">🏢 ${esc(l.company)}</div>` : ''}
      ${l.email   ? `<div class="card-meta">✉️ ${esc(l.email)}</div>`   : ''}
      ${l.phone   ? `<div class="card-meta">📞 ${esc(l.phone)}</div>`   : ''}
      <div class="card-footer">
        ${l.value > 0 ? `<span class="card-value">$${Number(l.value).toLocaleString()}</span>` : '<span></span>'}
        <span class="card-open" onclick="openDrawer('${l.id}')">View →</span>
      </div>
    </div>`
}

function renderStats() {
  const el = document.getElementById('stats')
  if (!el) return
  const won = leads.filter(l => l.stage === 'won').reduce((s, l) => s + (l.value || 0), 0)
  const active = leads.filter(l => !['won','lost'].includes(l.stage)).length
  el.innerHTML = `
    <span class="stat"><b>${leads.length}</b> leads</span>
    <span class="stat"><b>${active}</b> active</span>
    <span class="stat won"><b>$${won.toLocaleString()}</b> won</span>`
}

// ─── DRAG & DROP ──────────────────────────────────────────────────────────────
function onDragStart(e, id) {
  dragLeadId = id
  setTimeout(() => document.getElementById('card-' + id)?.classList.add('dragging'), 0)
  e.dataTransfer.effectAllowed = 'move'
}
function onDragEnd(e) {
  document.querySelectorAll('.card.dragging').forEach(el => el.classList.remove('dragging'))
}
function onDragOver(e, stageId) {
  e.preventDefault()
  document.getElementById('col-' + stageId)?.classList.add('drag-over')
}
function onDragLeave(e) {
  e.currentTarget.classList.remove('drag-over')
}
async function onDrop(e, stageId) {
  e.preventDefault()
  e.currentTarget.classList.remove('drag-over')
  if (!dragLeadId) return
  const lead = leads.find(l => l.id === dragLeadId)
  if (!lead || lead.stage === stageId) return
  await updateLead(dragLeadId, { stage: stageId })
  await addActivity(dragLeadId, 'stage_change', `Moved to ${STAGES.find(s=>s.id===stageId)?.label}`)
  dragLeadId = null
}

// ─── DRAWER ───────────────────────────────────────────────────────────────────
async function openDrawer(id) {
  openLeadId = id
  const lead = leads.find(l => l.id === id)
  if (!lead) return

  const { data: acts } = await sb.from('activities')
    .select('*').eq('lead_id', id).order('created_at', { ascending: false })

  const stageOptions = STAGES.map(s =>
    `<option value="${s.id}" ${lead.stage === s.id ? 'selected' : ''}>${s.label} — ${s.meaning}</option>`
  ).join('')

  document.getElementById('drawer').innerHTML = `
    <div class="drawer-header">
      <div>
        <div class="drawer-title">${esc(lead.name)}</div>
        ${lead.company ? `<div class="drawer-subtitle">${esc(lead.company)}</div>` : ''}
      </div>
      <button class="btn-icon" onclick="closeDrawer()">✕</button>
    </div>

    <div class="drawer-section">
      <label class="field-label">Stage</label>
      <select id="d-stage" onchange="saveStage('${id}')">${stageOptions}</select>
    </div>

    <div class="drawer-section">
      <label class="field-label">Details</label>
      <div class="field-row">✉️ <input id="d-email" value="${esc(lead.email||'')}" placeholder="Email" /></div>
      <div class="field-row">📞 <input id="d-phone" value="${esc(lead.phone||'')}" placeholder="Phone" /></div>
      <div class="field-row">🏢 <input id="d-company" value="${esc(lead.company||'')}" placeholder="Company" /></div>
      <div class="field-row">💰 <input id="d-value" type="number" value="${lead.value||0}" placeholder="Value" /></div>
      <div class="field-row" style="align-items:flex-start">
        📝 <textarea id="d-notes" rows="3" placeholder="Notes">${esc(lead.notes||'')}</textarea>
      </div>
      <button class="btn btn-primary" style="align-self:flex-start" onclick="saveDetails('${id}')">Save details</button>
    </div>

    <div class="drawer-section">
      <label class="field-label">Add Note</label>
      <textarea id="d-note" rows="2" placeholder="Log a call, email, meeting…"></textarea>
      <button class="btn btn-primary" style="align-self:flex-start" onclick="submitNote('${id}')">Add note</button>
    </div>

    <div class="drawer-section">
      <label class="field-label">Timeline</label>
      <ul class="timeline">
        ${(acts || []).length === 0
          ? '<li style="color:var(--muted);font-size:12px">No activity yet.</li>'
          : (acts||[]).map(a => `
            <li class="tl-item">
              <span class="tl-icon">${actIcon(a.type)}</span>
              <div>
                <div class="tl-content">${esc(a.content)}</div>
                <div class="tl-time">${formatDate(a.created_at)}</div>
              </div>
            </li>`).join('')}
      </ul>
    </div>`

  document.getElementById('drawer-overlay').classList.add('open')
}

function closeDrawer(e) {
  if (e && e.target !== document.getElementById('drawer-overlay')) return
  document.getElementById('drawer-overlay').classList.remove('open')
  openLeadId = null
}

async function saveStage(id) {
  const stage = document.getElementById('d-stage').value
  await updateLead(id, { stage })
  await addActivity(id, 'stage_change', `Moved to ${STAGES.find(s=>s.id===stage)?.label}`)
}

async function saveDetails(id) {
  await updateLead(id, {
    email:   document.getElementById('d-email').value,
    phone:   document.getElementById('d-phone').value,
    company: document.getElementById('d-company').value,
    value:   Number(document.getElementById('d-value').value),
    notes:   document.getElementById('d-notes').value,
  })
}

async function submitNote(id) {
  const content = document.getElementById('d-note').value.trim()
  if (!content) return
  await addActivity(id, 'note', content)
  openDrawer(id)
}

// ─── ADD LEAD MODAL ───────────────────────────────────────────────────────────
function openAddModal() {
  const stageOptions = STAGES.map(s =>
    `<option value="${s.id}">${s.label}</option>`).join('')

  document.getElementById('modal').innerHTML = `
    <div class="modal-header">
      <span class="modal-title">New Lead</span>
      <button class="btn-icon" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <p id="modal-error" class="error-msg" style="display:none"></p>
      <div class="form-grid">
        <div class="form-field">
          <label>Full Name *</label>
          <input id="m-name" placeholder="Alice Nakamura" />
        </div>
        <div class="form-field">
          <label>Company</label>
          <input id="m-company" placeholder="TechCorp Uganda" />
        </div>
        <div class="form-field">
          <label>Email</label>
          <input id="m-email" type="email" placeholder="alice@example.com" />
        </div>
        <div class="form-field">
          <label>Phone</label>
          <input id="m-phone" placeholder="+256 700 000 000" />
        </div>
        <div class="form-field">
          <label>Stage</label>
          <select id="m-stage">${stageOptions}</select>
        </div>
        <div class="form-field">
          <label>Deal Value ($)</label>
          <input id="m-value" type="number" value="0" min="0" />
        </div>
        <div class="form-field full">
          <label>Notes</label>
          <textarea id="m-notes" rows="3" placeholder="How did you find this lead?"></textarea>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn btn-primary" onclick="submitLead()">Add Lead</button>
    </div>`

  document.getElementById('modal-overlay').classList.add('open')
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay')) return
  document.getElementById('modal-overlay').classList.remove('open')
}

async function submitLead() {
  const name = document.getElementById('m-name').value.trim()
  const errEl = document.getElementById('modal-error')
  if (!name) { showErr(errEl, 'Name is required'); return }

  const btn = document.querySelector('#modal .btn-primary')
  btn.disabled = true; btn.textContent = 'Adding…'

  try {
    await createLead({
      name,
      company: document.getElementById('m-company').value || null,
      email:   document.getElementById('m-email').value   || null,
      phone:   document.getElementById('m-phone').value   || null,
      stage:   document.getElementById('m-stage').value,
      value:   Number(document.getElementById('m-value').value) || 0,
      notes:   document.getElementById('m-notes').value   || null,
    })
    closeModal()
  } catch(e) {
    showErr(errEl, e.message)
    btn.disabled = false; btn.textContent = 'Add Lead'
  }
}

// ─── ACTIVITIES ───────────────────────────────────────────────────────────────
async function addActivity(leadId, type, content) {
  const { data: { user } } = await sb.auth.getUser()
  await sb.from('activities').insert({ lead_id: leadId, user_id: user?.id, type, content })
}

// ─── DELETE ───────────────────────────────────────────────────────────────────
function confirmDelete(id, btn) {
  if (btn.dataset.confirming) {
    deleteLead(id)
  } else {
    btn.dataset.confirming = '1'
    btn.textContent = '?'
    btn.style.color = 'var(--danger)'
    setTimeout(() => { btn.dataset.confirming = ''; btn.textContent = '✕'; btn.style.color = ''; }, 2500)
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function formatDate(iso) {
  return new Date(iso).toLocaleString('en-UG', { dateStyle: 'medium', timeStyle: 'short' })
}

function actIcon(type) {
  return { note:'📝', call:'📞', email:'✉️', meeting:'📅', stage_change:'🔀', file:'📎' }[type] ?? '•'
}

function showErr(el, msg) {
  el.textContent = msg
  el.style.display = 'block'
}
