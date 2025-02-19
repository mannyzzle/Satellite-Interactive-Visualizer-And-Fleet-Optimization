#app/main.py



from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import satellites, llm, infographics
from app.generate_infographics import generate_infographics, filters  # or similar


app = FastAPI()

# CORS (Frontend Compatibility)
origins = [
    "http://localhost:5173",  # Vite default dev server
    "http://127.0.0.1:5173",  # Alternative dev server
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
app.include_router(infographics.router, prefix="/api/infographics", tags=["Infographics"])

@app.get("/")
def root():
    return {"message": "Welcome to the Satellite Interactive Visualizer Backend!"}

@app.on_event("startup")
def startup_event():
    print("🚀 Backend is starting...")
    # Call the infographic generation logic at startup
    for filter_name, filter_condition in filters.items():
        generate_infographics(filter_name, filter_condition)
    generate_infographics("Launch Year (All)", None)
    generate_infographics("Country (All)", None)


@app.on_event("shutdown")
def shutdown_event():
    print("🛑 Backend is shutting down...")
