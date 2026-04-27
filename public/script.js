let activeFloor = 'all';
let activeStatus = 'all';
let searchQuery = '';
let allRooms = [];

async function fetchRooms() {
  try {
    const res = await fetch('/api/rooms');
    const data = await res.json();
    allRooms = data.rooms;
    renderRooms();
    document.getElementById('last-refresh').textContent =
      'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    document.getElementById('room-grid').innerHTML =
      '<p class="loading">Could not load rooms. Please try again.</p>';
  }
}

function renderRooms() {
  const grid = document.getElementById('room-grid');
  const q = searchQuery.toLowerCase();
  const filtered = allRooms.filter(r => {
    const floorMatch = activeFloor === 'all' || r.floor === Number(activeFloor);
    const statusMatch = activeStatus === 'all' || r.status === activeStatus;
    const searchMatch = !q ||
      r.number.toLowerCase().includes(q) ||
      (r.supervisor && r.supervisor.toLowerCase().includes(q));
    return floorMatch && statusMatch && searchMatch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = '<p class="loading">No rooms match this filter.</p>';
    return;
  }

  grid.innerHTML = filtered.map(room => `
    <div class="room-card ${room.status}">
      <div class="room-meta">Floor ${room.floor}</div>
      <div class="room-number">Room ${room.number}</div>
      <span class="status-badge ${room.status}">
        ${room.status === 'open' ? 'Available' : 'Closed'}
      </span>
      <div class="supervisor-label">
        ${room.status === 'open' && room.supervisor
          ? `Supervised by <span class="supervisor-name">${room.supervisor}</span>`
          : 'No supervisor — room not open'}
      </div>
    </div>
  `).join('');
}

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
