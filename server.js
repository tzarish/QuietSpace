const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;

// Statically required so Vercel bundles them into the serverless function.
const teachersData = require('./teachers.json');
const initialRooms = require('./rooms.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Storage: Upstash Redis (Vercel) or local JSON file (dev) ──────────────────

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const ROOMS_FILE = path.join(__dirname, 'rooms.json');

let memoryCache = initialRooms;

function isValidRoomsShape(obj) {
  return obj && Array.isArray(obj.rooms) && obj.rooms.length > 0;
}

let lastReadSource = 'init';

async function readRooms() {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      const res = await fetch(`${UPSTASH_URL}/get/rooms`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
      });
      const json = await res.json();
      if (json.result) {
        const parsed = JSON.parse(json.result);
        if (isValidRoomsShape(parsed)) {
          lastReadSource = 'upstash';
          return parsed;
        }
        console.warn('[QuietSpace] Upstash returned malformed data; re-seeding from bundle.');
      } else {
        console.warn('[QuietSpace] Upstash key empty; seeding from bundle.');
      }
      // Self-heal: re-seed Upstash from bundled rooms.json
      await writeRooms(initialRooms);
      lastReadSource = 'upstash-reseed';
      return initialRooms;
    } catch (err) {
      console.error('[QuietSpace] Upstash read failed:', err.message);
      lastReadSource = 'memory-fallback';
      return memoryCache;
    }
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
    lastReadSource = 'fs';
    return parsed;
  } catch {
    lastReadSource = 'memory-fallback';
    return memoryCache;
  }
}

let lastWriteError = null;

async function writeRooms(data) {
  memoryCache = data;
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    let res;
    try {
      res = await fetch(`${UPSTASH_URL}/set/rooms`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${UPSTASH_TOKEN}`,
          'Content-Type': 'text/plain',
        },
        body: JSON.stringify(data),  // raw JSON string as body — correct
      });
    } catch (err) {
      lastWriteError = `fetch threw: ${err.message}`;
      throw new Error(lastWriteError);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '<unreadable body>');
      lastWriteError = `Upstash SET ${res.status}: ${text.slice(0, 200)}`;
      throw new Error(lastWriteError);
    }
    lastWriteError = null;
    return;
  }
  try {
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(data, null, 2));
    lastWriteError = null;
  } catch (err) {
    lastWriteError = `fs write failed: ${err.message}`;
    console.warn('Could not persist rooms.json (read-only fs?):', err.message);
  }
}

function findTeacher(password) {
  return teachersData.teachers.find(t => t.password === password) || null;
}

// Seed handled lazily by readRooms self-heal. No top-level await needed.

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

app.get('/api/_debug', async (req, res) => {
  let upstashStatus = 'not-configured';
  let upstashSample = null;
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      const r = await fetch(`${UPSTASH_URL}/get/rooms`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
      });
      const j = await r.json();
      upstashStatus = j.result ? 'has-data' : 'empty';
      if (j.result) {
        const parsed = JSON.parse(j.result);
        upstashSample = {
          keys: Object.keys(parsed || {}),
          roomCount: Array.isArray(parsed?.rooms) ? parsed.rooms.length : 'NOT-ARRAY',
        };
      }
    } catch (err) {
      upstashStatus = 'fetch-error: ' + err.message;
    }
  }
  let data;
  try { data = await readRooms(); } catch (e) { data = { error: e.message }; }
  res.json({
    runtime: process.env.VERCEL ? 'vercel' : 'local',
    nodeVersion: process.version,
    env: {
      UPSTASH_REDIS_REST_URL: UPSTASH_URL ? 'set' : 'MISSING',
      UPSTASH_REDIS_REST_TOKEN: UPSTASH_TOKEN ? 'set' : 'MISSING',
    },
    upstashStatus,
    upstashSample,
    lastReadSource,
    bundledRoomCount: Array.isArray(initialRooms?.rooms) ? initialRooms.rooms.length : 'NOT-ARRAY',
    returnedShape: {
      keys: Object.keys(data || {}),
      roomCount: Array.isArray(data?.rooms) ? data.rooms.length : 'NOT-ARRAY',
      sampleRoom: Array.isArray(data?.rooms) ? data.rooms[0] : null,
    },
  });
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

    const isActive = status === 'open' || status === 'meeting';
    room.status = status;
    room.supervisor = isActive ? teacher.name : null;
    room.openFrom = isActive ? (openFrom || null) : null;
    room.openUntil = isActive ? (openUntil || '18:30') : null;
    room.lastUpdated = new Date().toISOString();

    // Don't await — respond immediately, persist in background
    // If write fails, memoryCache still has the update for this instance
    writeRooms(data).catch(err => console.error('[QuietSpace] writeRooms failed:', err.message));

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