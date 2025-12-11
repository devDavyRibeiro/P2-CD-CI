// src/app.js - Aplicação Express com vulnerabilidades intencionais para SAST

const express = require('express');
const { Client } = require('pg'); // ⬅️ TROCA mysql → pg
const crypto = require('crypto');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger config
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Vulnerable API - SAST Demo',
      version: '1.0.0',
      description: 'API vulnerável para demonstração de ferramentas SAST.',
      contact: { name: 'Security Testing Team', email: 'security@example.com' }
    },
    servers: [{ url: 'http://localhost:3000', description: 'Dev server' }],
  },
  apis: ['./src/app.js']
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Hardcoded secrets (intentionally vulnerable)
const DB_PASSWORD = 'awzioVsKNHssGT50YCUQqIsruQakea40';
const API_KEY = 'sk_live_51234567890abcdef';
const JWT_SECRET = 'my-secret-key';

// -------------------------------
// 🔥 CONEXÃO POSTGRESQL (SEM VALIDAÇÃO — VULNERÁVEL)
// -------------------------------
const db = new Client({
  host: 'dpg-d4t07mur433s73br6vpg-a',
  user: 'atividade_ci_cd_user',
  password: DB_PASSWORD,
  database: 'atividade_ci_cd',
  port: 5432
});

db.connect();

// SQL Injection
app.get('/users/:id', async (req, res) => {
  const userId = req.params.id;

  const query = `SELECT * FROM users WHERE id = ${userId}`; // 🔥 vulnerável

  try {
    const result = await db.query(query);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/users', async (req, res) => {
  try {
    const result = await db.query(`SELECT * FROM users`);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Command Injection
app.post('/execute', (req, res) => {
  const command = req.body.command;
  exec(`ls ${command}`, (err, stdout) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ output: stdout });
  });
});

// Path Traversal
app.get('/download', (req, res) => {
  const filepath = path.join(__dirname, 'files', req.query.file);
  res.sendFile(filepath);
});

// XSS
app.get('/search', (req, res) => {
  const searchTerm = req.query.q;
  res.send(`<h1>Resultados para: ${searchTerm}</h1>`);
});

// Weak crypto
app.post('/encrypt', (req, res) => {
  const data = req.body.data;
  const weakKey = 'weak-key-12345';
  const encrypted = crypto.createHash('md5').update(data + weakKey).digest('hex');
  res.json({ encrypted });
});

// Login SQL Injection
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const query = `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`; // 🔥 vuln

  try {
    const result = await db.query(query);
    if (result.rows.length > 0) {
      res.json({ success: true, token: 'fake-jwt-token' });
    } else {
      res.status(401).json({ success: false });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logging sensitive info
app.use((err, req, res, next) => {
  console.log('Error:', err.stack);
  console.log('Request body:', req.body);
  console.log('Database password:', DB_PASSWORD);
  res.status(500).json({ error: err.message });
});

// SSRF
app.get('/fetch-url', (req, res) => {
  const http = require('http');
  http.get(req.query.url, (response) => {
    let data = '';
    response.on('data', chunk => data += chunk);
    response.on('end', () => res.send(data));
  }).on('error', err => res.status(500).json({ error: err.message }));
});

// Code injection (eval)
app.post('/calculate', (req, res) => {
  const result = eval(req.body.expression);
  res.json({ result });
});

// Regex DoS
app.get('/validate-email', (req, res) => {
  const regex = /^([a-zA-Z0-9_\.\-])+\@(([a-zA-Z0-9\-])+\.)+([a-zA-Z0-9]{2,4})+$/;
  res.json({ valid: regex.test(req.query.email) });
});

// Insecure random
app.get('/generate-token', (req, res) => {
  res.json({ token: Math.random().toString(36).substring(7) });
});

// Prototype pollution
app.post('/merge', (req, res) => {
  function merge(target, source) {
    for (let key in source) {
      if (typeof source[key] === 'object') {
        target[key] = merge(target[key] || {}, source[key]);
      } else {
        target[key] = source[key];
      }
    }
    return target;
  }
  res.json(merge({}, req.body));
});

// XXE
app.post('/parse-xml', (req, res) => {
  const xml2js = require('xml2js');
  const parser = new xml2js.Parser({ explicitArray: false });
  parser.parseString(req.body.xml, (err, result) => {
    if (err) return res.status(400).json({ error: err.message });
    res.json(result);
  });
});

// Unsafe upload
app.post('/upload', (req, res) => {
  fs.writeFileSync(path.join(__dirname, 'uploads', req.body.filename), req.body.content);
  res.json({ success: true });
});

// Mass assignment (Postgres adaptation)
app.post('/users', async (req, res) => {
  const newUser = req.body;

  // MySQL tinha INSERT ... SET, PostgreSQL não tem → adaptar:
  const fields = Object.keys(newUser).join(', ');
  const values = Object.values(newUser)
    .map(v => `'${v}'`)
    .join(', ');

  const query = `INSERT INTO users (${fields}) VALUES (${values}) RETURNING id`; // 🔥 vuln

  try {
    const result = await db.query(query);
    res.json({ id: result.rows[0].id, ...newUser });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Timing attack
app.post('/verify-token', (req, res) => {
  res.json({ valid: req.body.token === 'super-secret-token-12345' });
});

app.get('/', (req, res) => {
  res.json({ message: 'Vulnerable API - SAST Demo', documentation: '/api-docs' });
});

// Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server on port ${PORT}`);
});
