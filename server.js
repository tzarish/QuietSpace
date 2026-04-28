const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3002;

// Statically required so Vercel bundles them into the serverless function.
const teachersData  = require('./teachers.json');
const initialRooms  = require('./rooms.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Storage: Upstash Redis (Vercel) or local JSON file (dev) ──────────────────

const UPSTASH_URL   = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ROOMS_FILE    = path.join(__dirname, 'rooms.json');

let memoryCache = initialRooms;

async function readRooms() {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      const res  = await fetch(`${UPSTASH_URL}/get/rooms`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
      });
      const json = await res.json();
      if (json.result) return JSON.parse(json.result);
    } catch (err) {
      console.error('Upstash read failed:', err.message);
    }
    return memoryCache;
  }
  try {
    return JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
  } catch {
    return memoryCache;
  }
}

async function writeRooms(data) {
  memoryCache = data;
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    await fetch(`${UPSTASH_URL}/set/rooms`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value: JSON.stringify(data) })
    });
    return;
  }
  try {
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.warn('Could not persist rooms.json (read-only fs?):', err.message);
  }
}

function findTeacher(password) {
  return teachersData.teachers.find(t => t.password === password) || null;
}

// ── Seed Redis with rooms.json on first deploy ────────────────────────────────
async function seedIfEmpty() {
  if (!UPSTASH_URL || !UPSTASH_TOKEN) return;
  const res  = await fetch(`${UPSTASH_URL}/get/rooms`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
  });
  const json = await res.json();
  if (!json.result) {
    const initial = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
    await writeRooms(initial);
    console.log('Redis seeded with rooms.json');
  }
}
seedIfEmpty().catch(console.error);

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/api/rooms', async (req, res) => {
  try {
    const data = await readRooms();
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load rooms' });
  }
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const teacher = findTeacher(password);
  if (teacher) {
    res.json({ success: true, name: teacher.name, department: teacher.department, role: teacher.role });
  } else {
    res.status(401).json({ success: false, error: 'Invalid password' });
  }
});

app.patch('/api/admin/rooms/:id', async (req, res) => {
  const { password, status, openFrom, openUntil } = req.body;
  const teacher = findTeacher(password);
  if (!teacher) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const data = await readRooms();
    const room = data.rooms.find(r => r.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (teacher.role === 'staff' && status === 'closed' && room.supervisor !== teacher.name) {
      return res.status(403).json({ error: 'You can only close rooms you are supervising.' });
    }

    const isActive   = status === 'open' || status === 'meeting';
    room.status      = status;
    room.supervisor  = isActive ? teacher.name : null;
    room.openFrom    = isActive ? (openFrom  || null)    : null;
    room.openUntil   = isActive ? (openUntil || '18:30') : null;
    room.lastUpdated = new Date().toISOString();

    await writeRooms(data);
    res.json(room);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update room' });
  }
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`QuietSpace running at http://localhost:${PORT}`);
  });
}

module.exports = app;