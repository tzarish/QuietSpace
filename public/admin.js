let sessionPassword = null;
let sessionTeacher  = null;
let allRooms        = [];
let activeFloor     = 'all';
let activeStatus    = 'all';
let editingId       = null; // room currently in inline-edit mode

// ── Auth ──────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const password = document.getElementById('password-input').value;
  const error    = document.getElementById('login-error');

  const res = await fetch('/api/admin/login', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ password }),
  });

  if (res.ok) {
    const data = await res.json();
    sessionPassword = password;
    sessionTeacher  = data;

    const isElevated = data.role === 'elevated';
    const rolePill   = isElevated
      ? `<span class="role-pill">Dean</span>`
      : '';
    document.getElementById('teacher-name-label').innerHTML =
      `${data.name} · ${data.department}${rolePill}`;
    document.getElementById('teacher-info').style.display = 'flex';
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('admin-panel').classList.remove('hidden');
    fetchRooms();
  } else {
    error.classList.remove('hidden');
    document.getElementById('password-input').value = '';
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  sessionPassword = null;
  sessionTeacher  = null;
  editingId       = null;
  document.getElementById('admin-panel').classList.add('hidden');
  document.getElementById('teacher-info').style.display = 'none';
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-error').classList.add('hidden');
  document.getElementById('password-input').value = '';
});

// ── Filters ───────────────────────────────────────────
document.querySelectorAll('#floor-filters .sidebar-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#floor-filters .sidebar-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFloor = btn.dataset.floor;
    renderAdminRooms();
  });
});

document.querySelectorAll('#status-filters .sidebar-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#status-filters .sidebar-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeStatus = btn.dataset.status;
    renderAdminRooms();
  });
});

// ── Helpers ───────────────────────────────────────────
function fmt12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour   = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function canCloseRoom(room) {
  if (room.status !== 'open' && room.status !== 'meeting') return false;
  return sessionTeacher.role === 'elevated' || room.supervisor === sessionTeacher.name;
}

// ── Data fetch ────────────────────────────────────────
async function fetchRooms() {
  try {
    const res  = await fetch('/api/rooms');
    const data = await res.json();
    allRooms   = Array.isArray(data?.rooms) ? data.rooms : [];
    renderAdminRooms();
  } catch (err) {
    document.getElementById('admin-room-list').innerHTML =
      '<p class="loading">Could not load rooms.</p>';
  }
}

// ── Render ────────────────────────────────────────────
function updateSidebarCounts() {
  const total = allRooms.length;
  document.getElementById('count-all').textContent = total;
  [2, 3, 4].forEach(f => {
    const el = document.getElementById(`count-${f}`);
    if (el) el.textContent = allRooms.filter(r => r.floor === f).length;
  });
}

function renderAdminRooms() {
  updateSidebarCounts();
  const list = document.getElementById('admin-room-list');

  const filtered = allRooms.filter(r => {
    const floorMatch  = activeFloor  === 'all' || r.floor === Number(activeFloor);
    const statusMatch = activeStatus === 'all'  || r.status === activeStatus;
    return floorMatch && statusMatch;
  });

  // Subtitle summary
  const summary = `${filtered.length} of ${allRooms.length} rooms shown`;
  document.getElementById('admin-main-subtitle').textContent = summary;

  if (filtered.length === 0) {
    list.innerHTML = '<p class="loading">No rooms match this filter.</p>';
    return;
  }

  list.innerHTML = filtered.map(rowHTML).join('');
  wireRowEvents();
}

function rowHTML(room) {
  const isOpen     = room.status === 'open';
  const isMeeting  = room.status === 'meeting';
  const isActive   = isOpen || isMeeting;
  const isMine     = isActive && room.supervisor === sessionTeacher.name;
  const closeable  = canCloseRoom(room);
  const editing    = editingId === room.id;

  const statusLabel = isOpen ? 'Available' : isMeeting ? 'Meeting' : 'Empty';

  let timeLine = '<span class="row-time muted">No hours set</span>';
  if (isActive && room.openFrom && room.openUntil) {
    timeLine = `<span class="row-time">${fmt12(room.openFrom)} – ${fmt12(room.openUntil)}</span>`;
  } else if (isActive && room.openUntil) {
    timeLine = `<span class="row-time">Until ${fmt12(room.openUntil)}</span>`;
  }

  const supervisorBlock = isActive && room.supervisor
    ? `<div class="row-supervisor">${room.supervisor}${isMine ? ' <span class="you-tag">You</span>' : ''}</div>`
    : `<div class="row-supervisor empty">No supervisor</div>`;

  let actionBlock = '';
  if (editing) {
    actionBlock = ''; // form takes the row's bottom band
  } else if (!isActive) {
    actionBlock = `<button class="row-btn open-btn" data-action="edit" data-id="${room.id}">Open Room</button>`;
  } else if (closeable) {
    actionBlock = `<button class="row-btn close-btn" data-action="close" data-id="${room.id}">${isMeeting ? 'End Meeting' : 'Close Room'}</button>`;
  } else {
    actionBlock = `<span class="row-locked">Supervised by another</span>`;
  }

  const formBlock = editing ? formHTML(room) : '';

  return `
    <div class="admin-row ${room.status}" data-id="${room.id}">
      <div class="row-stripe"></div>
      <div>
        <div class="row-room-num">${room.number}</div>
        <span class="row-floor">FL ${room.floor}</span>
      </div>
      <div class="row-status-block">
        <span class="row-status-pill ${room.status}">${statusLabel}</span>
        ${timeLine}
      </div>
      ${supervisorBlock}
      <div class="row-action">${actionBlock}</div>
      ${formBlock}
    </div>
  `;
}

function formHTML(room) {
  const isElevated = sessionTeacher.role === 'elevated';
  const defaultUntil = '18:30';
  const meetingToggle = isElevated ? `
    <label class="form-meeting-toggle">
      <input type="checkbox" id="form-meeting-${room.id}" />
      <div>
        <div class="toggle-label">This is a meeting</div>
        <span class="toggle-hint">Closed to general students</span>
      </div>
    </label>
  ` : '';

  return `
    <div class="row-form" data-id="${room.id}">
      <div class="form-field">
        <label>Open from</label>
        <input type="time" id="form-from-${room.id}" value="${nowHHMM()}" />
      </div>
      <div class="form-field">
        <label>Open until</label>
        <input type="time" id="form-until-${room.id}" value="${defaultUntil}" />
      </div>
      ${meetingToggle}
      <div class="form-actions">
        <button class="btn-cancel" data-action="cancel" data-id="${room.id}">Cancel</button>
        <button class="btn-confirm" data-action="confirm" data-id="${room.id}">Confirm Open</button>
      </div>
    </div>
  `;
}

function wireRowEvents() {
  document.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', handleAction);
  });
}

async function handleAction(e) {
  const action = e.currentTarget.dataset.action;
  const id     = e.currentTarget.dataset.id;

  if (action === 'edit') {
    editingId = id;
    renderAdminRooms();
    return;
  }
  if (action === 'cancel') {
    editingId = null;
    renderAdminRooms();
    return;
  }
  if (action === 'confirm') {
    const fromInput  = document.getElementById(`form-from-${id}`);
    const untilInput = document.getElementById(`form-until-${id}`);
    const meetingBox = document.getElementById(`form-meeting-${id}`);

    const openFrom  = fromInput?.value || nowHHMM();
    const openUntil = untilInput?.value;
    if (!openUntil) {
      alert('Please pick an "open until" time.');
      return;
    }
    if (openUntil <= openFrom) {
      alert('"Open until" must be later than "open from".');
      return;
    }
    const status = (meetingBox && meetingBox.checked) ? 'meeting' : 'open';

    e.currentTarget.disabled = true;
    await sendUpdate(id, { status, openFrom, openUntil });
    return;
  }
  if (action === 'close') {
    e.currentTarget.disabled = true;
    await sendUpdate(id, { status: 'closed' });
    return;
  }
}

async function sendUpdate(id, payload) {
  const res = await fetch(`/api/admin/rooms/${id}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ password: sessionPassword, ...payload }),
  });

  if (res.ok) {
    const updated = await res.json();
    allRooms      = allRooms.map(r => r.id === id ? updated : r);
    editingId     = null;
    renderAdminRooms();
  } else {
    const err = await res.json().catch(() => ({}));
    alert(err.error || 'Failed to update room.');
    renderAdminRooms();
  }
}
