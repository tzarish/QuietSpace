let activeFloor  = 'all';
let activeStatus = 'all';
let searchQuery  = '';
let allRooms     = [];

const FLOOR_NAMES = { 2: '2nd Floor', 3: '3rd Floor', 4: '4th Floor' };

function fmt12(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour   = h % 12 || 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

function fmtUpdated(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isExpired(room) {
  if (room.status !== 'open' && room.status !== 'meeting') return false;
  if (!room.openUntil) return false;
  const now = new Date();
  if (room.lastUpdated) {
    const updated = new Date(room.lastUpdated);
    if (updated.toDateString() !== now.toDateString()) return true;
  }
  const [h, m] = room.openUntil.split(':').map(Number);
  const expiry = new Date(now);
  expiry.setHours(h, m, 0, 0);
  return now >= expiry;
}

function effectiveStatus(room) {
  return isExpired(room) ? 'closed' : room.status;
}

async function fetchRooms() {
  try {
    const res  = await fetch('/api/rooms');
    const data = await res.json();
    allRooms   = data.rooms;
    renderRooms();
    document.getElementById('last-refresh').textContent =
      'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    document.getElementById('room-grid').innerHTML =
      '<p class="loading">Could not load rooms. Please try again.</p>';
  }
}

function cardHTML(room) {
  const status    = effectiveStatus(room);
  const isOpen    = status === 'open';
  const isMeeting = status === 'meeting';
  const isActive  = isOpen || isMeeting;

  const badgeLabel  = isOpen ? 'AVAILABLE' : isMeeting ? 'MEETING HAPPENING' : 'EMPTY';
  const teacherLine = isActive && room.supervisor ? room.supervisor : '—';

  let timeRange = '—';
  if (isActive && room.openFrom && room.openUntil) {
    timeRange = `${fmt12(room.openFrom)} – ${fmt12(room.openUntil)}`;
  } else if (isActive && room.openUntil) {
    timeRange = `Until ${fmt12(room.openUntil)}`;
  }

  const nameTag = room.name
    ? `<div class="room-name-tag">${room.name}</div>`
    : '';

  return `
    <div class="room-card ${status}">
      <div class="card-top-row">
        <span class="card-floor">Floor ${room.floor}</span>
        ${nameTag}
      </div>
      <div class="room-number">${room.number}</div>
      <span class="status-badge ${status}">${badgeLabel}</span>
      <div class="card-details">
        <div class="card-detail-row">
          <span class="detail-label">Teacher</span>
          <span class="detail-value">${teacherLine}</span>
        </div>
        <div class="card-detail-row">
          <span class="detail-label">Hours</span>
          <span class="detail-value">${timeRange}</span>
        </div>
        <div class="card-detail-row">
          <span class="detail-label">Updated</span>
          <span class="detail-value">${fmtUpdated(room.lastUpdated)}</span>
        </div>
      </div>
    </div>
  `;
}

function renderRooms() {
  const container = document.getElementById('room-grid');
  const q = searchQuery.toLowerCase();

  const filtered = allRooms.filter(r => {
    const floorMatch  = activeFloor  === 'all' || r.floor === Number(activeFloor);
    const statusMatch = activeStatus === 'all'  || effectiveStatus(r) === activeStatus;
    const searchMatch = !q ||
      r.number.toLowerCase().includes(q) ||
      (r.supervisor && r.supervisor.toLowerCase().includes(q)) ||
      (r.name       && r.name.toLowerCase().includes(q));
    return floorMatch && statusMatch && searchMatch;
  });

  if (filtered.length === 0) {
    container.className = 'room-grid';
    container.innerHTML = '<p class="loading">No rooms match this filter.</p>';
    return;
  }

  // ── Specific floor selected: flat grid ──
  if (activeFloor !== 'all') {
    container.className = 'room-grid';
    container.innerHTML = filtered.map(cardHTML).join('');
    return;
  }

  // ── All Floors: grouped sections ──
  container.className = 'floor-sections';
  container.innerHTML = [2, 3, 4].map(floor => {
    const rooms = filtered.filter(r => r.floor === floor);
    if (rooms.length === 0) return '';

    return `
      <section class="floor-section">
        <div class="floor-section-header">
          <button class="floor-section-title" data-floor="${floor}">
            ${FLOOR_NAMES[floor]}
          </button>
          <div class="floor-section-divider"></div>
        </div>
        <div class="room-grid">
          ${rooms.map(cardHTML).join('')}
        </div>
      </section>
    `;
  }).join('');

  // Wire floor-title clicks → activate that floor's filter button
  container.querySelectorAll('.floor-section-title').forEach(btn => {
    btn.addEventListener('click', () => {
      const floor = btn.dataset.floor;
      document.querySelectorAll('#floor-filters .filter-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.floor === floor);
      });
      activeFloor = floor;
      renderRooms();
    });
  });
}

// ── Filter wiring ─────────────────────────────────────

document.querySelectorAll('#floor-filters .filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#floor-filters .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFloor = btn.dataset.floor;
    renderRooms();
  });
});

document.querySelectorAll('#status-filters .filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#status-filters .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeStatus = btn.dataset.status;
    renderRooms();
  });
});

document.getElementById('search-input').addEventListener('input', e => {
  searchQuery = e.target.value.trim();
  renderRooms();
});

fetchRooms();
setInterval(fetchRooms, 30000);
