# SATELLITE INTERACTIVE VISUALIZER

## Project Overview
The **Satellite Interactive Visualizer** is a dynamic, 3D web-based interface that enables users to explore and interact with active satellites orbiting Earth. The platform features real-time satellite data displayed on a 3D globe, providing insights into satellite characteristics and their orbital paths. Additionally, the system will incorporate LLM-powered query capabilities for enhanced user interactivity.

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
│   ├── app.py                  # API endpoints for satellite data
│   ├── ingest_tle_from_source.py  # Script for TLE ingestion
│   ├── load_data.py            # TLE parsing and database updates
│   ├── setup_database.py       # Database setup
│   ├── table_analysis.py       # TLE validation and analysis
│   ├── remove_outliers.py      # Data cleanup and outlier detection
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Globe.js         # 3D visualization of Earth and satellites
│   │   │   ├── Sidebar.js       # Sidebar for satellite search and filters
│   │   │   └── SatelliteInfo.js # Information display panel
│   │   ├── App.js              # Main React component
│   │   ├── index.js            # React entry point
│   └── package.json            # React project configuration
├── data/                       # Satellite TLE and related data
├── venv/                       # Python virtual environment
├── requirements.txt            # Python dependencies
├── README.md                   # Project documentation
├── Dockerfile                  # Containerization for the application
└── .devcontainer/              # Development container configuration
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
