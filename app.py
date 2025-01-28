from flask import Flask, request, jsonify
import psycopg2
from dotenv import load_dotenv
import os
import joblib

# Load environment variables
load_dotenv()

# Database credentials
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")

# Flask app
app = Flask(__name__)

def connect_to_db():
    """
    Establishes a connection to the PostgreSQL database.
    """
    return psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        dbname=DB_NAME
    )

@app.route('/satellites', methods=['GET'])
def get_all_satellites():
    """
    API endpoint to retrieve all satellite data.
    """
    try:
        conn = connect_to_db()
        cursor = conn.cursor()

        query = "SELECT category, satellite_name, tle_line1, tle_line2 FROM satellites;"
        cursor.execute(query)
        satellites = cursor.fetchall()

        result = [
            {
                "category": row[0],
                "name": row[1],
                "line1": row[2],
                "line2": row[3]
            } for row in satellites
        ]

        cursor.close()
        conn.close()
        return jsonify(result), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/satellites/<category>', methods=['GET'])
def get_satellites_by_category(category):
    """
    API endpoint to retrieve satellite data by category.
    """
    try:
        conn = connect_to_db()
        cursor = conn.cursor()

        query = "SELECT satellite_name, tle_line1, tle_line2 FROM satellites WHERE category = %s;"
        cursor.execute(query, (category,))
        satellites = cursor.fetchall()

        result = [
            {"name": row[0], "line1": row[1], "line2": row[2]}
            for row in satellites
        ]

        cursor.close()
        conn.close()
        return jsonify(result), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/predict', methods=['POST'])
def predict():
    """
    API endpoint to predict using the trained ML model.
    """
    try:
        # Parse JSON request
        data = request.json
        features = data["features"]

        # Load the pre-trained model
        model = joblib.load('model.pkl')
        prediction = model.predict([features])

        return jsonify({"prediction": int(prediction[0])}), 200

    except FileNotFoundError:
        return jsonify({"error": "Model file not found. Train the model first."}), 500

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
