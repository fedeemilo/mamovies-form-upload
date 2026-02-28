require('dotenv').config();
const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');
const path = require('path');
const { randomUUID } = require('crypto');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 3333;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

// jobId -> { res: SSEResponse | null, buffer: string[] }
const jobs = new Map();

app.use(express.static(path.join(__dirname, 'public')));

// Called by n8n at each workflow step
app.post('/progress', express.json(), (req, res) => {
  res.sendStatus(200);
  const { jobId, step, message, progress } = req.body || {};
  if (!jobId || !jobs.has(jobId)) return;
  const job = jobs.get(jobId);
  const payload = `data: ${JSON.stringify({ step, message, progress })}\n\n`;
  if (job.res) {
    job.res.write(payload);
  } else {
    job.buffer.push(payload);
  }
  if (step === 'upload_ok' || step === 'timeout') {
    setTimeout(() => jobs.delete(jobId), 60_000);
  }
});

// SSE stream — browser opens this after submit to receive progress events
app.get('/events/:jobId', (req, res) => {
  const { jobId } = req.params;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  if (!jobs.has(jobId)) {
    jobs.set(jobId, { res: null, buffer: [] });
  }
  const job = jobs.get(jobId);
  job.res = res;
  job.buffer.forEach(payload => res.write(payload));
  job.buffer = [];

  req.on('close', () => {
    if (jobs.has(jobId)) jobs.get(jobId).res = null;
  });
});

// Receive form, forward to n8n with a jobId injected
app.post('/submit', upload.single('Torrent'), async (req, res) => {
  if (!N8N_WEBHOOK_URL) {
    return res.status(500).json({ error: 'N8N_WEBHOOK_URL no está configurada en el servidor.' });
  }
  const { Serie, Temporada, Episodios } = req.body;
  if (!Serie || !Temporada || !Episodios || !req.file) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  const jobId = randomUUID();
  jobs.set(jobId, { res: null, buffer: [] });

  try {
    const form = new FormData();
    form.append('Serie', Serie);
    form.append('Temporada', Temporada);
    form.append('Episodios', Episodios);
    form.append('jobId', jobId);
    form.append('Torrent', req.file.buffer, {
      filename: req.file.originalname,
      contentType: req.file.mimetype || 'application/x-bittorrent',
    });

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });

    if (response.ok) {
      return res.json({ success: true, jobId, message: 'Workflow iniciado en n8n.' });
    }

    const detail = await response.text();
    jobs.delete(jobId);
    return res.status(response.status).json({
      error: `n8n respondió con error ${response.status}.`,
      detail,
    });
  } catch (err) {
    jobs.delete(jobId);
    return res.status(500).json({ error: 'No se pudo conectar con n8n.', detail: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Mamovies Form Upload corriendo en http://localhost:${PORT}`);
  if (!N8N_WEBHOOK_URL) console.warn('⚠️  N8N_WEBHOOK_URL no está definida.');
});
