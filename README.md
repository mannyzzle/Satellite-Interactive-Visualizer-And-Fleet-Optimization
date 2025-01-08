# Cloud-Based Machine Learning Pipeline

This project demonstrates a cloud-based machine learning pipeline designed to train, deploy, and serve predictive models. The pipeline integrates PostgreSQL for structured data management, machine learning for predictions, and Flask for serving the model via an API. Deployed on AWS, this project highlights cloud computing, DevOps, and data engineering practices.

---

## Table of Contents

1. [Overview](#overview)  
2. [Features](#features)  
3. [Tech Stack](#tech-stack)  
4. [Getting Started](#getting-started)  
   - [Prerequisites](#prerequisites)  
   - [Setup](#setup)  
5. [Usage](#usage)  
   - [Training the Model](#training-the-model)  
   - [API Endpoint](#api-endpoint)  
6. [Project Structure](#project-structure)  
7. [Deployment](#deployment)  
8. [Future Work](#future-work)  
9. [Contributing](#contributing)  
10. [License](#license)

---

## Overview

This project focuses on building a machine learning pipeline that:
- Fetches data from a PostgreSQL database hosted on AWS RDS.
- Trains a machine learning model to predict outcomes (e.g., ADHD diagnosis).
- Deploys the model using Flask, containerized with Docker, and hosted on a cloud platform.
- Provides a REST API for model predictions.

---

## Features

- **PostgreSQL Integration**: Manage structured data using AWS RDS.  
- **Machine Learning**: Train and evaluate models using `scikit-learn`.  
- **Flask API**: Expose the trained model as a RESTful API.  
- **Dockerized Deployment**: Containerized for easy deployment and scaling.  
- **Cloud Hosting**: Deployable to AWS, GCP, or other platforms.  

---

## Tech Stack

- **Backend**: Python, Flask  
- **Database**: PostgreSQL (AWS RDS)  
- **Machine Learning**: scikit-learn, pandas, numpy  
- **DevOps**: Docker, AWS  
- **API Testing**: Postman or cURL  

---

## Getting Started

### Prerequisites

- **Python 3.8+** installed locally or via a virtual environment.  
- **PostgreSQL Client (`psql`)** installed.  
- **Docker** installed for containerization.  
- **AWS Account** for RDS and deployment (optional for local setup).  
- **GitHub Codespaces** or local environment with necessary permissions.  

### Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/cloud-ml-pipeline.git
   cd cloud-ml-pipeline
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Set up environment variables**:
   Create a `.env` file in the project root with:
   ```
   DB_HOST=<your-rds-endpoint>
   DB_PORT=5432
   DB_USER=<your-db-username>
   DB_PASSWORD=<your-db-password>
   DB_NAME=<your-db-name>
   ```

4. **Run database migrations** (if any):
   ```bash
   python setup_database.py
   ```

5. **Train the model**:
   ```bash
   python train_model.py
   ```

6. **Run the Flask API**:
   ```bash
   python app.py
   ```

---

## Usage

### Training the Model

Modify the dataset or preprocessing in `train_model.py`. The training script:
- Connects to the PostgreSQL database.
- Fetches and preprocesses data.
- Trains a model using `scikit-learn`.
- Saves the model as `model.pkl` for API inference.

Run training:
```bash
python train_model.py
```

### API Endpoint

The Flask API exposes the following endpoint:

#### **`POST /predict`**
- **Description**: Get predictions from the trained model.
- **Request Body** (JSON):
  ```json
  {
    "features": [12, 6, 8]
  }
  ```
- **Response** (JSON):
  ```json
  {
    "prediction": "RISK"
  }
  ```

Example request:
```bash
curl -X POST http://127.0.0.1:5000/predict \
     -H "Content-Type: application/json" \
     -d '{"features": [12, 6, 8]}'
```

---

## Project Structure

```plaintext
cloud-ml-pipeline/
├── app.py                 # Flask API
├── train_model.py         # ML model training
├── setup_database.py      # Database setup script
├── requirements.txt       # Python dependencies
├── Dockerfile             # Docker container config
├── .env                   # Environment variables
├── README.md              # Project documentation
├── data/                  # (Optional) Local dataset storage
└── notebooks/             # Jupyter Notebooks for EDA
```

---

## Deployment

### Local Deployment

1. **Run Flask Locally**:
   ```bash
   python app.py
   ```
2. **Test the API** at `http://127.0.0.1:5000/predict`.

### Docker Deployment

1. **Build the Docker image**:
   ```bash
   docker build -t cloud-ml-pipeline .
   ```
2. **Run the container**:
   ```bash
   docker run -p 5000:5000 --env-file .env cloud-ml-pipeline
   ```

### Cloud Deployment (AWS Elastic Beanstalk)

1. Package the app with `Dockerfile` and `.env`.
2. Deploy to AWS Elastic Beanstalk or other container platforms.

---

## Future Work

- Add **authentication** to the API for secure access.
- Integrate **CI/CD pipelines** for automated testing and deployment.
- Extend support for more ML frameworks (e.g., TensorFlow, PyTorch).
- Implement real-time data ingestion pipelines.

---

## Contributing

1. Fork the repository.  
2. Create a new feature branch:  
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Commit changes:  
   ```bash
   git commit -m "Add your message here"
   ```
4. Push to your branch and create a pull request.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
