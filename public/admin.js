let sessionPassword = null;
let sessionTeacher = null;
let allRooms = [];
let activeFloor = 'all';
let activeStatus = 'all';

// ── Auth ──────────────────────────────────────────────

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const password = document.getElementById('password-input').value;
  const error = document.getElementById('login-error');

  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  if (res.ok) {
    const data = await res.json();
    sessionPassword = password;
    sessionTeacher = data;

    const roleLabel = data.role === 'elevated' ? ' · Admin' : '';
    document.getElementById('teacher-name-label').textContent =
      `${data.name} · ${data.department}${roleLabel}`;
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
  sessionTeacher = null;
  document.getElementById('admin-panel').classList.add('hidden');
  document.getElementById('teacher-info').style.display = 'none';
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('login-error').classList.add('hidden');
  document.getElementById('password-input').value = '';
});

// ── Filters ───────────────────────────────────────────

document.querySelectorAll('#floor-filters .filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#floor-filters .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFloor = btn.dataset.floor;
    renderAdminRooms();
  });
});

document.querySelectorAll('#status-filters .filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#status-filters .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeStatus = btn.dataset.status;
    renderAdminRooms();
  });
});

// ── Rooms ─────────────────────────────────────────────

async function fetchRooms() {
  const res = await fetch('/api/rooms');
  const data = await res.json();
  allRooms = data.rooms;
  renderAdminRooms();
}

function canClose(room) {
  if (room.status !== 'open') return false;
  return sessionTeacher.role === 'elevated' || room.supervisor === sessionTeacher.name;
}

function renderAdminRooms() {
  const grid = document.getElementById('admin-room-grid');

  const filtered = allRooms.filter(r => {
    const floorMatch = activeFloor === 'all' || r.floor === Number(activeFloor);
    const statusMatch = activeStatus === 'all' || r.status === activeStatus;
    return floorMatch && statusMatch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<p class="loading">No rooms match this filter.</p>';
    return;
  }

  grid.innerHTML = filtered.map(room => {
    const isOpen = room.status === 'open';
    const isMine = isOpen && room.supervisor === sessionTeacher.name;
    const closeable = canClose(room);

    let btn = '';
    if (!isOpen) {
      btn = `<button class="toggle-btn make-open" data-id="${room.id}" data-status="${room.status}">
               Open Room — I'll Supervise
             </button>`;
    } else if (closeable) {
      btn = `<button class="toggle-btn make-closed" data-id="${room.id}" data-status="${room.status}">
               Close Room
             </button>`;
    } else {
      btn = `<div class="toggle-locked">Supervised by another teacher</div>`;
    }

    return `
      <div class="room-card ${room.status}" id="card-${room.id}">
        <div class="room-meta">Floor ${room.floor}</div>
        <div class="room-number">Room ${room.number}</div>
        <span class="status-badge ${room.status}">
          ${isOpen ? 'Available' : 'Closed'}
        </span>
        <div class="supervisor-label">
          ${isOpen && room.supervisor
            ? `Supervised by <span class="supervisor-name">${room.supervisor}</span>${isMine ? ' <span class="you-tag">(you)</span>' : ''}`
            : 'No supervisor'}
        </div>
        ${btn}
      </div>
    `;
  }).join('');

  document.querySelectorAll('.toggle-btn').forEach(b => b.addEventListener('click', handleToggle));
}

async function handleToggle(e) {
  const id = e.target.dataset.id;
  const current = e.target.dataset.status;
  const newStatus = current === 'open' ? 'closed' : 'open';

  e.target.disabled = true;

  const res = await fetch(`/api/admin/rooms/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: sessionPassword, status: newStatus }),
  });

  if (res.ok) {
    const updated = await res.json();
    allRooms = allRooms.map(r => r.id === id ? updated : r);
    renderAdminRooms();
  } else {
    const err = await res.json();
    alert(err.error || 'Failed to update room.');
    e.target.disabled = false;
  }
}
