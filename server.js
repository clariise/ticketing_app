const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = 3000;

// Database connection settings. Set these as environment variables,
// or edit the defaults here.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Obitus!85',
  database: process.env.DB_NAME || 'iut_db',
  waitForConnections: true,
  connectionLimit: 10
});

const STATUSES = ['Open', 'In Progress', 'Resolved'];
const PREFIXES = {
  'Incident': 'INC',
  'Work': 'WRK',
  'Deployment': 'DEP',
  'Test': 'TST',
  'Service Request': 'SR'
};

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Convert a database row into the shape the frontend expects
function toClient(row) {
  return {
    id: row.id,
    ticket_number: row.ticket_number,
    type: row.category,
    title: row.title,
    description: row.description,
    priority: row.priority,
    status: row.status,
    requester: row.requester,
    assignee: row.assignee || 'Unassigned',
    due_date: row.due_date,
    created_at: row.created_at
  };
}

// Wrapper so async errors reach the error handler
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// Get all tickets
app.get('/api/tickets', wrap(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM tickets ORDER BY id');
  res.json(rows.map(toClient));
}));

// Create a ticket
// Create a ticket
app.post('/api/tickets', wrap(async (req, res) => {
  const { type, title, description, priority, status, requester, assignee, due_date, created_at } = req.body;

  if (!type || !title) {
    return res.status(400).json({ error: 'type and title are required' });
  }
  if (!PREFIXES[type]) {
    return res.status(400).json({ error: 'unknown type' });
  }
  // Accept only a YYYY-MM-DD date from the picker, or nothing
  if (created_at && !/^\d{4}-\d{2}-\d{2}$/.test(created_at)) {
    return res.status(400).json({ error: 'created_at must be a date (YYYY-MM-DD)' });
  }

  const [result] = await pool.query(
    `INSERT INTO tickets
       (ticket_number, title, description, category, priority, status, requester, assignee, due_date, created_at)
     VALUES (NULL, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
    [
      title,
      description || title,
      type,
      priority || 'Medium',
      status || 'Open',
      requester || 'Dashboard User',
      assignee || null,
      due_date || null,
      created_at || null
    ]
  );

  // Build a readable ticket number from the new id, e.g. INC-00001
  const ticketNumber = `${PREFIXES[type]}-${String(result.insertId).padStart(5, '0')}`;
  await pool.query('UPDATE tickets SET ticket_number = ? WHERE id = ?', [ticketNumber, result.insertId]);

  const [rows] = await pool.query('SELECT * FROM tickets WHERE id = ?', [result.insertId]);
  res.status(201).json(toClient(rows[0]));
}));

// Update a ticket's status
app.put('/api/tickets/:id', wrap(async (req, res) => {
  const { status } = req.body;
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: 'invalid status' });
  }

  const [result] = await pool.query(
    'UPDATE tickets SET status = ? WHERE id = ?',
    [status, req.params.id]
  );
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  const [rows] = await pool.query('SELECT * FROM tickets WHERE id = ?', [req.params.id]);
  res.json(toClient(rows[0]));
}));

// Delete a ticket
app.delete('/api/tickets/:id', wrap(async (req, res) => {
  const [result] = await pool.query('DELETE FROM tickets WHERE id = ?', [req.params.id]);
  if (result.affectedRows === 0) {
    return res.status(404).json({ error: 'Ticket not found' });
  }
  res.status(204).end();
}));

// Catch errors from the routes above
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Database error' });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});