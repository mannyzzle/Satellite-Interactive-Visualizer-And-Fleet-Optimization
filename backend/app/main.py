from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import satellites, llm, cdm, old_tles
import os
from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError

app = FastAPI()

# CORS (Frontend Compatibility)
origins = [
    "http://localhost:5173",  # Vite default dev server
    "http://127.0.0.1:5173",
    "https://mannyzzle.github.io"  # Alternative dev server
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(satellites.router, prefix="/api/satellites", tags=["Satellites"])
app.include_router(llm.router, prefix="/api/llm", tags=["LLM"])
app.include_router(cdm.router, prefix="/api/cdm", tags=["CDM"])
app.include_router(old_tles.router, prefix="/api/old_tles", tags=["Old TLEs"])

@app.get("/")
def root():
    return {"message": "Welcome to the Satellite Interactive Visualizer Backend!"}

@app.on_event("startup")
def startup_event():
    print("🚀 Backend is starting...")
    
    # Test the database connection during startup
    try:
        db_user = os.getenv('DB_USER')
        db_password = os.getenv('DB_PASSWORD')
        db_host = os.getenv('DB_HOST')
        db_port = os.getenv('DB_PORT',"5432")
        db_name = os.getenv('DB_NAME')

        db_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
        engine = create_engine(db_url)
        
        # Check the database connection
        with engine.connect() as connection:
            print("✅ Successfully connected to the database!")
    except SQLAlchemyError as e:
        print(f"❌ Database connection failed: {str(e)}")
    
    # Additional logs for debugging purposes
    print("🔍 FastAPI app has started.")

@app.on_event("shutdown")
def shutdown_event():
    print("🛑 Backend is shutting down...")

