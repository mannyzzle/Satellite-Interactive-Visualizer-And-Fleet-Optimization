from fastapi import FastAPI
from app.api import satellites, llm

app = FastAPI()

# Include routers
app.include_router(satellites.router, prefix="/api/satellites")
app.include_router(llm.router, prefix="/api/llm")

@app.get("/")
def root():
    return {"message": "Welcome to the Satellite Interactive Visualizer Backend!"}

@app.on_event("startup")
def startup_event():
    print("Backend is starting...")

@app.on_event("shutdown")
def shutdown_event():
    print("Backend is shutting down...")
