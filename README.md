# **Satellite Fleet Optimization: Cloud-Based LLM Pipeline**

This project demonstrates a cloud-based pipeline designed to analyze, optimize, and generate insights for satellite fleet operations. The pipeline integrates **PostgreSQL** for structured data management, geospatial analysis with **PostGIS**, predictive modeling for satellite operations, and **LLMs** for generating actionable business insights. Deployed on **AWS**, this project showcases cloud computing, geospatial analysis, and machine learning capabilities.

---

## **Table of Contents**
- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Setup](#setup)
- [Usage](#usage)
  - [Data Ingestion](#data-ingestion)
  - [Analysis](#analysis)
  - [API Endpoint](#api-endpoint)
- [Project Structure](#project-structure)
- [Deployment](#deployment)
  - [Local Deployment](#local-deployment)
  - [Cloud Deployment](#cloud-deployment)
- [Future Work](#future-work)
- [Contributing](#contributing)
- [License](#license)

---

## **Overview**
This project focuses on building a pipeline that:
- Ingests satellite data (e.g., orbital parameters, TLE data) into a PostgreSQL database hosted on **AWS RDS**.
- Performs geospatial and predictive analysis to optimize satellite fleet coverage and reduce downtime.
- Leverages **LLMs** to generate human-readable reports and actionable insights for business operations.
- Provides an API for querying satellite status and recommendations.

---

## **Features**
- **PostgreSQL with PostGIS Integration**: Manage geospatial satellite data and analyze coverage zones.
- **TLE Data Parsing**: Derive orbital parameters (e.g., inclination, eccentricity, RAAN, true anomaly) from TLE lines.
- **LLM Integration**: Generate summaries, reports, and insights from satellite data.
- **Predictive Modeling**: Forecast satellite downtime and identify high-risk coverage gaps.
- **REST API**: Query satellite performance and recommendations via Flask.
- **Cloud Deployment**: Fully hosted on AWS RDS, Elastic Beanstalk, and S3.

---

## **Tech Stack**
- **Backend**: Python, Flask
- **Database**: PostgreSQL with PostGIS (AWS RDS)
- **Machine Learning**: scikit-learn, pandas, numpy
- **LLMs**: Hugging Face Transformers
- **Geospatial Analysis**: geopandas, rasterio
- **DevOps**: Docker, AWS Elastic Beanstalk
- **API Testing**: Postman or cURL

---

## **Getting Started**

### **Prerequisites**
- **Python** 3.8+ installed locally or in a virtual environment.
- PostgreSQL Client (`psql`) installed.
- Docker installed for containerization.
- AWS account for RDS and deployment (optional for local setup).
- GitHub Codespaces or local environment with necessary permissions.

---

### **Setup**
1. **Clone the Repository**:
   ```bash
   git clone https://github.com/your-username/satellite-fleet-optimization.git
   cd satellite-fleet-optimization
   ```

2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Set Up Environment Variables**:
   Create a `.env` file in the project root:
   ```
   DB_HOST=<your-rds-endpoint>
   DB_PORT=5432
   DB_USER=<your-db-username>
   DB_PASSWORD=<your-db-password>
   DB_NAME=<your-db-name>
   ```

4. **Run Database Setup**:
   ```bash
   python setup_database.py
   ```

5. **Run the Flask API**:
   ```bash
   python app.py
   ```

---

## **Usage**

### **Data Ingestion**
- **Satellite Data**: Ingest TLE (Two-Line Element) satellite data into the PostgreSQL database.

Run the ingestion script:
```bash
python ingest_tle_from_source.py
```

### **Feature Calculation and Updates**
Calculate derived satellite features, including:
- Orbital parameters: inclination, eccentricity, RAAN, true anomaly, mean motion.
- Derived metrics: orbital period, semi-major axis, velocity, orbit type.
- Operational metrics: satellite age, stability, collision risk.

Run the feature update script:
```bash
python load_data.py
```

### **Analysis**
- Perform geospatial analysis on satellite coverage using **PostGIS**.
- Predict satellite downtime and identify coverage gaps with machine learning models.

Run the analysis scripts:
```bash
python train_model_period_predictions.py
python visualizations.py
```

### **API Endpoint**
The Flask API provides an endpoint to query satellite data and generate insights.

- **POST `/fleet_status`**
  - **Description**: Get satellite performance and recommendations.
  - **Request Body** (JSON):
    ```json
    {
      "region": "North America"
    }
    ```
  - **Response** (JSON):
    ```json
    {
      "satellites": [
        {
          "name": "Satellite A",
          "status": "Active",
          "coverage": "95%"
        },
        {
          "name": "Satellite B",
          "status": "Under Maintenance",
          "coverage": "N/A"
        }
      ],
      "recommendations": "Satellite B requires priority maintenance."
    }
    ```

Example query with `cURL`:
```bash
curl -X POST http://127.0.0.1:5000/fleet_status \
     -H "Content-Type: application/json" \
     -d '{"region": "North America"}'
```

---

## **Project Structure**
```
satellite-fleet-optimization/
├── app.py                 # Flask API
├── ingest_tle_from_source.py # Ingest TLE satellite data
├── load_data.py           # Calculate and update satellite features
├── setup_database.py      # Database setup script
├── train_model_period_predictions.py # Predict satellite orbital periods
├── visualizations.py      # Generate visualizations
├── requirements.txt       # Python dependencies
├── Dockerfile             # Docker container config
├── .env                   # Environment variables
├── README.md              # Project documentation
├── data/                  # (Optional) Local dataset storage
└── plots/                 # Generated plots and figures
```

---

## **Deployment**

### **Local Deployment**
1. Run Flask Locally:
   ```bash
   python app.py
   ```
2. Test the API at `http://127.0.0.1:5000`.

---

### **Cloud Deployment**

#### **1. Docker Deployment**
1. Build the Docker image:
   ```bash
   docker build -t satellite-fleet-optimization .
   ```
2. Run the container:
   ```bash
   docker run -p 5000:5000 --env-file .env satellite-fleet-optimization
   ```

#### **2. AWS Deployment**
1. Package the app with `Dockerfile` and `.env`.
2. Deploy to **AWS Elastic Beanstalk**.

---

## **Future Work**
- Extend LLM functionality for detailed business insights.
- Add real-time ingestion of satellite telemetry data.
- Build advanced predictive models for satellite repositioning.
- Integrate authentication for secure API access.

---

## **Contributing**
1. Fork the repository.
2. Create a new branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Commit your changes:
   ```bash
   git commit -m "Add your feature"
   ```
4. Push to the branch and create a pull request.

---

## **License**
This project is licensed under the MIT License. See the `LICENSE` file for details.

---
