# Ollama Deployment Strategies for Production

## The Problem

You can't ask end users to:

- Install Ollama manually
- Download 2-6GB models
- Configure ports and services

**Solution:** Bundle Ollama with your application OR use a centralized server.

---

## Strategy 1: Embedded Ollama (Recommended for Desktop Apps)

### How It Works

Package Ollama + model with your installer. User installs your app → Ollama runs in background automatically.

### Implementation

#### Windows (NSIS/Inno Setup Installer)

```bash
# Your installer includes:
MyApp/
├── app.exe                    # Your voice assistant
├── backend/
│   ├── demo.py
│   └── ollama/
│       ├── ollama.exe         # Ollama binary
│       └── models/
│           └── llama3.2.gguf  # Pre-downloaded model (~2GB)
└── install.nsi                # Installer script
```

**Installer script (NSIS example):**

```nsis
; Install Ollama binary
SetOutPath "$INSTDIR\ollama"
File "ollama.exe"
File /r "models\*.*"

; Create Windows service to auto-start Ollama
ExecWait '"$INSTDIR\ollama\ollama.exe" serve --models "$INSTDIR\ollama\models"'

; Or start as background process
Exec '"$INSTDIR\ollama\ollama.exe" serve --port 11434'
```

**Python startup script:**

```python
# backend/startup.py
import subprocess
import os
import time
import requests

def ensure_ollama_running():
    """Start Ollama if not already running"""

    # Check if Ollama is already running
    try:
        response = requests.get("http://localhost:11434/api/tags", timeout=2)
        if response.ok:
            print("✅ Ollama already running")
            return True
    except:
        pass

    # Start Ollama
    ollama_path = os.path.join(os.path.dirname(__file__), "ollama", "ollama.exe")
    models_path = os.path.join(os.path.dirname(__file__), "ollama", "models")

    if not os.path.exists(ollama_path):
        print("❌ Ollama binary not found")
        return False

    print("🚀 Starting Ollama...")
    subprocess.Popen(
        [ollama_path, "serve", "--models", models_path],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW  # Hide console window on Windows
    )

    # Wait for Ollama to be ready
    for _ in range(30):
        try:
            response = requests.get("http://localhost:11434/api/tags", timeout=1)
            if response.ok:
                print("✅ Ollama started successfully")
                return True
        except:
            time.sleep(1)

    print("❌ Ollama failed to start")
    return False

# Call this when your app starts
if __name__ == "__main__":
    ensure_ollama_running()
```

**Pros:**

- ✅ Zero user configuration
- ✅ Works offline
- ✅ Full control over model versions
- ✅ HIPAA-compliant (data never leaves user's machine)

**Cons:**

- ❌ Large installer size (2-6GB depending on model)
- ❌ Each user needs CPU/RAM to run Ollama
- ❌ Updates require reinstalling

---

## Strategy 2: Centralized Ollama Server (Recommended for Web Apps)

### How It Works

Run ONE Ollama server that all clients connect to. Like how you have one database server.

### Architecture

```
┌─────────────┐         ┌─────────────────┐         ┌─────────────┐
│  Client 1   │────────▶│   Your API      │────────▶│   Ollama    │
│ (Browser)   │         │  (Flask/FastAPI)│         │   Server    │
└─────────────┘         └─────────────────┘         └─────────────┘
                                ▲                           ▲
┌─────────────┐                │                           │
│  Client 2   │────────────────┘                           │
└─────────────┘                                            │
                                                  (Internal network)
┌─────────────┐
│  Client N   │────────────────────────────────────────────┘
└─────────────┘
```

### Implementation

**1. Deploy Ollama on a Server**

```bash
# On your application server (Ubuntu example)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2:latest

# Run as systemd service (auto-start on boot)
sudo systemctl enable ollama
sudo systemctl start ollama
```

**2. Configure Ollama for Network Access**

```bash
# /etc/systemd/system/ollama.service
[Service]
Environment="OLLAMA_HOST=0.0.0.0:11434"  # Listen on all interfaces
Environment="OLLAMA_ORIGINS=https://yourapp.com"  # CORS

sudo systemctl restart ollama
```

**3. Update Your Backend**

```python
# backend/config.py
import os

# Point to centralized Ollama server
OLLAMA_BASE_URL = os.getenv(
    "OLLAMA_URL",
    "http://ollama-server.internal:11434"  # Internal hostname
)

# In enhanced_command_router.py
response = requests.post(
    f"{OLLAMA_BASE_URL}/api/generate",
    json={...}
)
```

**4. Security (CRITICAL)**

```python
# Only allow requests from your app server
# Use firewall rules or API gateway

# Option A: Firewall (iptables)
sudo iptables -A INPUT -p tcp --dport 11434 -s YOUR_APP_SERVER_IP -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 11434 -j DROP

# Option B: Reverse proxy with authentication (nginx)
location /ollama/ {
    proxy_pass http://localhost:11434/;
    # Require API key
    if ($http_x_api_key != "your-secret-key") {
        return 403;
    }
}
```

**Pros:**

- ✅ Small client installer (no Ollama bundled)
- ✅ Easy updates (update server, all clients benefit)
- ✅ Share GPU/CPU resources across users
- ✅ Centralized monitoring and logging

**Cons:**

- ❌ Requires internet connection
- ❌ Single point of failure
- ❌ Need to secure the Ollama endpoint
- ⚠️ HIPAA concern: PHI travels over network (use VPN/encryption)

---

## Strategy 3: Docker Container (Best for Enterprise)

### How It Works

Package your entire app + Ollama + model in a Docker container. IT department deploys it on-premises.

### Implementation

**Dockerfile:**

```dockerfile
FROM python:3.11-slim

# Install Ollama
RUN curl -fsSL https://ollama.com/install.sh | sh

# Copy your app
WORKDIR /app
COPY backend/ /app/backend/
COPY voice-assist/ /app/voice-assist/

# Install dependencies
RUN pip install -r backend/requirements.txt

# Pre-download model
RUN ollama pull llama3.2:latest

# Expose ports
EXPOSE 5000 5173 11434

# Start script
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh

CMD ["/app/start.sh"]
```

**start.sh:**

```bash
#!/bin/bash

# Start Ollama in background
ollama serve &

# Wait for Ollama to be ready
while ! curl -s http://localhost:11434/api/tags > /dev/null; do
    sleep 1
done

# Start Flask backend
cd /app/backend
python demo.py &

# Start frontend
cd /app/voice-assist
npm run dev

# Keep container running
wait
```

**Deploy with Docker Compose:**

```yaml
# docker-compose.yml
version: "3.8"
services:
  voice-assistant:
    build: .
    ports:
      - "5000:5000" # Backend
      - "5173:5173" # Frontend
    volumes:
      - ollama-models:/root/.ollama # Persist models
    environment:
      - OLLAMA_HOST=0.0.0.0
    deploy:
      resources:
        limits:
          memory: 8G
          cpus: "4"

volumes:
  ollama-models:
```

**Pros:**

- ✅ Easy deployment (one `docker-compose up` command)
- ✅ Version controlled (Dockerfile in git)
- ✅ Portable (runs on any Docker host)
- ✅ Isolated (no conflicts with other apps)

**Cons:**

- ❌ Large image size (~4-8GB)
- ❌ Requires Docker knowledge
- ❌ Initial setup more complex

---

## Strategy 4: Fallback to Cloud API (Hybrid)

### How It Works

Try local Ollama first, fall back to cloud API if unavailable.

```python
def detect_intent_with_fallback(text):
    # Try local Ollama
    try:
        return detect_intent_ollama(text, url="http://localhost:11434")
    except:
        pass

    # Try centralized Ollama server
    try:
        return detect_intent_ollama(text, url="https://ollama.yourcompany.com")
    except:
        pass

    # Fallback to cloud (OpenAI with BAA for HIPAA)
    try:
        return detect_intent_openai(text)
    except:
        pass

    # Ultimate fallback: spaCy patterns
    return detect_intent_spacy(text)
```

---

## Recommended Approach for Your Project

Based on your healthcare use case:

### Option A: Electron Desktop App (Best)

```
Package as Electron app:
├── Frontend (React)
├── Backend (Python/Flask)
├── Ollama binary + model
└── Auto-start script

User downloads 1 installer (3-4GB)
Everything runs locally → HIPAA compliant
```

**Use:** Electron Builder with custom binary bundling

### Option B: On-Premises Server (For Clinics)

```
Deploy at each clinic:
├── One server running Ollama
├── Clients connect via internal network
└── No internet required

IT installs once, all staff use it
```

**Use:** Docker Compose or systemd service

---

## Implementation Guide for Electron App

I'll create a complete Electron wrapper for your app:

**1. Install Electron:**

```bash
npm install -g electron-builder
cd voice-assist
npm install electron electron-builder --save-dev
```

**2. Project structure:**

```
Demo-VA/
├── voice-assist/          # Your React frontend
├── backend/               # Your Flask backend
├── electron/
│   ├── main.js           # Electron main process
│   ├── preload.js
│   └── bundled/
│       ├── ollama.exe    # Windows binary
│       ├── ollama        # Linux binary
│       └── models/
│           └── llama3.2.gguf
└── package.json          # Build config
```

**3. Electron main.js:**

```javascript
const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");

let ollamaProcess = null;
let flaskProcess = null;

function startOllama() {
  const ollamaPath = path.join(__dirname, "bundled", "ollama.exe");
  const modelsPath = path.join(__dirname, "bundled", "models");

  ollamaProcess = spawn(ollamaPath, ["serve", "--models", modelsPath], {
    windowsHide: true,
  });

  console.log("Ollama started");
}

function startFlask() {
  const pythonPath = path.join(__dirname, "bundled", "python", "python.exe");
  const scriptPath = path.join(__dirname, "backend", "demo.py");

  flaskProcess = spawn(pythonPath, [scriptPath], {
    windowsHide: true,
  });

  console.log("Flask started");
}

app.on("ready", () => {
  startOllama();

  setTimeout(() => {
    startFlask();
  }, 3000); // Wait for Ollama to initialize

  setTimeout(() => {
    const win = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    win.loadURL("http://localhost:5173");
  }, 5000); // Wait for Flask
});

app.on("quit", () => {
  if (ollamaProcess) ollamaProcess.kill();
  if (flaskProcess) flaskProcess.kill();
});
```

**4. Build config (package.json):**

```json
{
  "build": {
    "appId": "com.yourcompany.voice-assistant",
    "productName": "Medical Voice Assistant",
    "files": ["voice-assist/dist/**/*", "backend/**/*", "electron/**/*"],
    "extraResources": [
      {
        "from": "electron/bundled",
        "to": "bundled"
      }
    ],
    "win": {
      "target": "nsis",
      "icon": "icon.ico"
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true
    }
  }
}
```

**5. Build:**

```bash
npm run build          # Build React app
electron-builder build  # Create installer
```

Result: `Medical-Voice-Assistant-Setup.exe` (~3GB) that users can install like any Windows app.

---

## Summary

| Deployment             | Best For         | User Setup      | Size  | HIPAA |
| ---------------------- | ---------------- | --------------- | ----- | ----- |
| **Embedded Ollama**    | Desktop app      | Install 1 .exe  | 3-4GB | ✅    |
| **Centralized Server** | Web app, clinics | None (browser)  | Small | ⚠️    |
| **Docker**             | Enterprise       | IT deploys once | 4-8GB | ✅    |
| **Cloud Fallback**     | Hybrid           | None            | Small | ⚠️    |

**My recommendation for healthcare:**

1. Build Electron desktop app with embedded Ollama (most HIPAA-friendly)
2. Offer Docker image for clinics that want server deployment
3. Keep spaCy fallback if Ollama fails to start

Want me to set up the Electron wrapper for your project?
