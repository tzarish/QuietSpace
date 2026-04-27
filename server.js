const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3002;
const ROOMS_FILE = path.join(__dirname, 'rooms.json');
const TEACHERS_FILE = path.join(__dirname, 'teachers.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readRooms() {
  return JSON.parse(fs.readFileSync(ROOMS_FILE, 'utf8'));
}

function writeRooms(data) {
  fs.writeFileSync(ROOMS_FILE, JSON.stringify(data, null, 2));
}

function findTeacher(password) {
  const { teachers } = JSON.parse(fs.readFileSync(TEACHERS_FILE, 'utf8'));
  return teachers.find(t => t.password === password) || null;
}

app.get('/api/rooms', (req, res) => {
  res.json(readRooms());
});

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  const teacher = findTeacher(password);
  if (teacher) {
    res.json({
      success: true,
      name: teacher.name,
      department: teacher.department,
      role: teacher.role,
    });
  } else {
    res.status(401).json({ success: false, error: 'Invalid password' });
  }
});

// PATCH /api/admin/rooms/:id
// body: { password, status: "open"|"closed" }
//
// Permission rules:
//   elevated — can open or close any room
//   staff    — can open any closed room, but can only close rooms they supervise
app.patch('/api/admin/rooms/:id', (req, res) => {
  const { password, status } = req.body;

  const teacher = findTeacher(password);
  if (!teacher) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const data = readRooms();
  const room = data.rooms.find(r => r.id === req.params.id);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }

  if (teacher.role === 'staff' && status === 'closed' && room.supervisor !== teacher.name) {
    return res.status(403).json({ error: 'You can only close rooms you are supervising.' });
  }

  room.status = status;
  room.supervisor = status === 'open' ? teacher.name : null;
  room.lastUpdated = new Date().toISOString();

  writeRooms(data);
  res.json(room);
});

app.listen(PORT, () => {
  console.log(`QuietSpace running at http://localhost:${PORT}`);
  console.log(`Admin panel: http://localhost:${PORT}/admin.html`);
});
