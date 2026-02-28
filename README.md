# mamovies-form-upload

Self-hosted form to trigger n8n workflows for uploading TV series seasons to the Mamovies streaming platform.

## What it does

Provides a minimal web UI to submit series data (name, season, episode count, and a `.torrent` file) that triggers an n8n webhook. The n8n workflow then handles the full pipeline: starts the torrent download via qBittorrent, waits for completion, organizes the files, and uploads the season to the Mamovies API.

## Stack

- **Backend:** Node.js + Express
- **Frontend:** Vanilla HTML/CSS/JS (no frameworks)
- **File handling:** Multer (multipart/form-data parsing)
- **Deployment:** Docker + Docker Compose

## Form fields

| Field | Type | Description |
|---|---|---|
| Serie | text | Series name (e.g. `Breaking Bad`) |
| Temporada | number | Season number (default: 1) |
| Episodios | number | Number of episodes in the season |
| Torrent | file | `.torrent` file to download |

## Project structure

```
mamovies-form-upload/
├── server.js                      # Express server — parses form and forwards to n8n
├── public/
│   └── index.html                 # Form UI
├── mamovies-upload-workflow.json  # n8n workflow definition
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── package.json
```

## Setup

### 1. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
N8N_WEBHOOK_URL=http://your-n8n-host:5678/webhook/3531813f-f775-47fd-890b-3c97931013ae
PORT=3000
```

### 2. Run locally

```bash
npm install
node server.js
```

### 3. Run with Docker

```bash
docker compose up --build
```

Custom port:

```bash
PORT=8080 docker compose up --build
```

## n8n webhook

The form submits `multipart/form-data` via `POST /submit` on the Express server, which forwards the request to n8n preserving the binary `.torrent` file.

In the n8n workflow, incoming data is available as:

```js
$('Webhook').item.json.body.Serie        // series name
$('Webhook').item.json.body.Temporada    // season number
$('Webhook').item.json.body.Episodios    // episode count
$('Webhook').item.binary['Torrent']      // .torrent file (binary)
```

### Importing the workflow

Go to n8n → **Settings → Import Workflow** and upload `mamovies-upload-workflow.json`.

## n8n workflow overview

```
Webhook trigger
  └── Iniciar descarga de torrent (qBittorrent API)
        └── Esperar inicio
              └── Leer info del torrent (loop)
                    ├── [downloading] Esperar 30s → check timeout → loop
                    └── [completed]  Mover carpeta a /series
                                       └── Preparar directorio de temporada
                                             └── Obtener token Mamovies
                                                   └── Subir la serie
                                                         └── Notificar por Telegram
```
