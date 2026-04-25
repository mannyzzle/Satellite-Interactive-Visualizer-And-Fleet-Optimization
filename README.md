# SATELLITE INTERACTIVE VISUALIZER (SAT-TRACK)

![Landing Page](landing-page.png)

## Project Overview
The **Satellite Interactive Visualizer** AKA SAT-TRACK is a dynamic, 3D web-based interface that enables users to explore and interact with active satellites orbiting Earth. The platform features real-time satellite data displayed on a 3D globe, providing insights into satellite characteristics and their orbital paths. Furthermore updates on recent/future launches and probabilistic collision events. Additionally, the system will incorporate LLM-powered query capabilities for enhanced user interactivity.

## Features
### Core Functionality:
- **3D Satellite Visualization**: Display all active satellites on a 3D globe using real-time data.
- **Satellite Information Panel**: Click on any satellite to view detailed information, including:
  - Name
  - Orbit Type (LEO, MEO, GEO, HEO)
  - Orbital Parameters (inclination, perigee, apogee, velocity, etc.)
  - Epoch and mean motion
- **Search & Filter**: Search by satellite name, NORAD number, or filter by category and orbit type.

### Backend:
- RESTful API using Python (Flask or FastAPI) to serve satellite data from a PostgreSQL database.
- Real-time updates with WebSocket integration.

### Frontend:
- 3D visualization powered by [Three.js](https://threejs.org/).
- Front-end interactivity using React.js.
- Stylish UI with Tailwind CSS or Material UI.

### Future Enhancements:
- LLM Integration:
  - Answer user questions about satellite operations, locations, and orbital dynamics.
  - Provide suggestions for viewing satellites in specific areas.
- Real-time satellite position updates using APIs such as SpaceTrak.

---

## Repository Structure
```
SATELLITE-INTERACTIVE-VISUALIZER/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI entry; mounts /api routers
│   │   ├── database.py            # psycopg2 connection (SSL required)
│   │   ├── variables.py           # SGP4/Skyfield helpers + purpose classifier
│   │   ├── tle_fetch.py           # Pulls TLEs from Space-Track
│   │   ├── tle_processor.py       # Archives stale, inserts active, classifies
│   │   ├── cdm.py                 # Worker: pulls Conjunction Data Messages
│   │   ├── fetch_launches.py      # SpaceLaunchNow → DB upsert
│   │   ├── omni_low.py            # NOAA SWPC + ACE space weather ingest
│   │   ├── de421.bsp              # JPL planetary ephemeris (binary)
│   │   ├── api/
│   │   │   ├── satellites.py      # /api/satellites/*
│   │   │   ├── cdm.py             # /api/cdm/fetch
│   │   │   ├── old_tles.py        # /api/old_tles/fetch/{norad}
│   │   │   └── launches.py        # /api/launches/{upcoming,previous}
│   │   └── services/llm_service.py
│   ├── tests/                     # pytest: contracts, orbital mechanics, filters, k6 load
│   ├── Dockerfile                 # API service image
│   ├── Updater.Dockerfile         # Worker image (TLE/CDM/launch/weather)
│   ├── railway.toml
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── main.jsx, App.jsx
│   │   ├── config.js              # Single source for backend URL (env-overridable)
│   │   ├── pages/                 # Home, Tracking, SatelliteList, SatelliteDetail, Launches, About
│   │   ├── components/            # Navbar, SatelliteCounter, Infographics, ...
│   │   └── api/satelliteService.js
│   ├── tests/                     # Vitest unit + Playwright e2e + stress
│   ├── public/                    # Earth day/night textures, favicon, 404.html
│   ├── vite.config.js, tailwind.config.js
│   └── package.json
├── README.md
└── package.json                   # root: gh-pages dev dep
```

## Tests

This project ships with a meaningful test suite — not toy unit tests. Each
group asserts something the project's value props depend on.

```bash
# Backend: API contracts + orbital-mechanics correctness + filter semantics
cd backend
pip install -r tests/requirements-test.txt
pytest -v -m "not load"

# Frontend unit tests (jsdom)
cd frontend
pnpm install
pnpm test:unit

# Frontend end-to-end against the live deploy (Playwright)
pnpm exec playwright install
pnpm test:e2e

# In-browser stress: 500 satellites + 1000 orbits, FPS + memory assertions
pnpm test:stress

# Backend load tests (k6 — manual, hits prod read-only)
brew install k6
k6 run backend/tests/load/api_smoke.k6.js
k6 run backend/tests/load/cdm_burst.k6.js
k6 run backend/tests/load/sustained.k6.js
```

---

## Installation
### Prerequisites
- Python 3.8+
- Node.js (for front-end development)
- PostgreSQL

### Backend Setup
1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/satellite-interactive-visualizer.git
   cd satellite-interactive-visualizer
   ```
2. Create a Python virtual environment:
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Set up the PostgreSQL database:
   - Create a database named `satellites`.
   - Update `.env` with your database credentials.
   ```
   DB_HOST=localhost
   DB_NAME=satellites
   DB_USER=your_user
   DB_PASSWORD=your_password
   ```
5. Run the database setup:
   ```bash
   python backend/setup_database.py
   ```
6. Ingest TLE data:
   ```bash
   python backend/ingest_tle_from_source.py
   ```
7. Start the backend server:
   ```bash
   python backend/app.py
   ```

### Frontend Setup
1. Navigate to the `frontend/` directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm start
   ```

---

## Usage
1. Open the front-end application in your browser at `http://localhost:3000`.
2. Interact with the 3D globe to explore active satellites.
3. Use the sidebar to search for satellites or filter by orbit type.
4. Click on a satellite to view its detailed information.

---

## Contributing
We welcome contributions! Please submit pull requests or open issues for suggestions and bug reports.

---

## License
This project is licensed under the MIT License.
