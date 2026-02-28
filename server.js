require('dotenv').config();
const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const PORT = process.env.PORT || 3333;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;

app.use(express.static(path.join(__dirname, 'public')));

app.post('/submit', upload.single('Torrent'), async (req, res) => {
  if (!N8N_WEBHOOK_URL) {
    return res.status(500).json({ error: 'N8N_WEBHOOK_URL no está configurada en el servidor.' });
  }

  const { Serie, Temporada, Episodios } = req.body;

  if (!Serie || !Temporada || !Episodios || !req.file) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  try {
    const form = new FormData();
    form.append('Serie', Serie);
    form.append('Temporada', Temporada);
    form.append('Episodios', Episodios);
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
      return res.json({ success: true, message: 'Workflow iniciado correctamente en n8n.' });
    }

    const detail = await response.text();
    return res.status(response.status).json({
      error: `n8n respondió con error ${response.status}.`,
      detail,
    });
  } catch (err) {
    return res.status(500).json({
      error: 'No se pudo conectar con n8n.',
      detail: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Mamovies Form Upload corriendo en http://localhost:${PORT}`);
  if (!N8N_WEBHOOK_URL) {
    console.warn('⚠️  N8N_WEBHOOK_URL no está definida.');
  }
});
