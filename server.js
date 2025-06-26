const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
const port = 3000;

// --- Middleware ---
// Enable Cross-Origin Resource Sharing for all routes
app.use(cors()); 
// Enable express to parse JSON bodies from incoming requests
app.use(express.json());

// --- PostgreSQL Connection ---

const pool = new Pool({
  user: 'postgres', 
  host: 'localhost',
  database: 'work_allocation_db',
  password: '1234', 
  port: 5432,
});

// --- Database Table Creation ---
// This function runs on server start to ensure tables exist
async function createTables() {
  const createAllocatedTableQuery = `
    CREATE TABLE IF NOT EXISTS allocated_tasks (
      id SERIAL PRIMARY KEY,
      task_name TEXT NOT NULL,
      deadline TEXT NOT NULL,
      allocated_time TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  const createSubmittedTableQuery = `
    CREATE TABLE IF NOT EXISTS submitted_tasks (
      id SERIAL PRIMARY KEY,
      task_name TEXT NOT NULL,
      employee_name TEXT NOT NULL,
      employee_id VARCHAR(7) NOT NULL,
      file_name TEXT,
      task_status TEXT NOT NULL,
      submission_time TIMESTAMPTZ DEFAULT NOW()
    );
  `;
  
  try {
    const client = await pool.connect();
    await client.query(createAllocatedTableQuery);
    await client.query(createSubmittedTableQuery);
    client.release();
    console.log('Tables created successfully or already exist.');
  } catch (err) {
    console.error('Error creating tables:', err);
  }
}

// --- API Endpoints (Routes) ---

// [GET] /api/tasks - Fetch all allocated tasks for the employee view
app.get('/api/tasks', async (req, res) => {
  try {
    const result = await pool.query('SELECT task_name, deadline, allocated_time FROM allocated_tasks ORDER BY allocated_time DESC');
    // Format the date for better readability on the frontend
    const formattedRows = result.rows.map(row => ({
        ...row,
        allocatedTime: new Date(row.allocated_time).toLocaleString()
    }));
    res.json(formattedRows);
  } catch (err) {
    console.error('Error fetching allocated tasks:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// [POST] /api/tasks - Create a new task from the HR view
app.post('/api/tasks', async (req, res) => {
  const { taskName, deadline } = req.body;
  if (!taskName || !deadline) {
    return res.status(400).json({ error: 'Task name and deadline are required.' });
  }

  try {
    const result = await pool.query(
      'INSERT INTO allocated_tasks (task_name, deadline) VALUES ($1, $2) RETURNING *',
      [taskName, deadline]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating task:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// [GET] /api/submitted-tasks - Fetch all submitted tasks for history views (both HR and Employee)
app.get('/api/submitted-tasks', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM submitted_tasks ORDER BY submission_time DESC');
    // Format the date
     const formattedRows = result.rows.map(row => ({
        taskName: row.task_name,
        employeeName: row.employee_name,
        employeeId: row.employee_id,
        taskStatus: row.task_status,
        allocatedTime: new Date(row.submission_time).toLocaleString()
    }));
    res.json(formattedRows);
  } catch (err) {
    console.error('Error fetching submitted tasks:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// [POST] /api/submit - Submit a work update from the employee view
app.post('/api/submit', async (req, res) => {
  const { taskName, employeeName, employeeId, uploadDoc, taskStatus } = req.body;

  if (!taskName || !employeeName || !employeeId || !taskStatus) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  
  try {
    const result = await pool.query(
      'INSERT INTO submitted_tasks (task_name, employee_name, employee_id, file_name, task_status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [taskName, employeeName, employeeId, uploadDoc, taskStatus]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error submitting work:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


// --- Start Server ---
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  // Create tables on startup
  createTables();
});