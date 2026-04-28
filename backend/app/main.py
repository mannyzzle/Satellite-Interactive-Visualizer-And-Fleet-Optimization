from fastapi import FastAPI, Request
import sys
import time
from fastapi.middleware.cors import CORSMiddleware
import os

# Ensure the backend root directory is in sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    from api import satellites, cdm, old_tles, launches, llm, reentry, space_weather, digest  # Absolute import for Docker
except ImportError:
    from .api import satellites, cdm, old_tles, launches, llm, reentry, space_weather, digest  # Relative import for local

   
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
app.include_router(launches.router, prefix="/api/launches", tags=["Launches"])
app.include_router(reentry.router, prefix="/api/reentry", tags=["Reentry"])
app.include_router(space_weather.router, prefix="/api/space-weather", tags=["SpaceWeather"])
app.include_router(digest.router, prefix="/api/digest", tags=["Digest"])


# Sampled telemetry on AI endpoints — feeds llm_request_log for tuning.
_AI_PATH_PREFIXES = ("/api/llm/", "/api/digest/", "/api/reentry/", "/api/space-weather/")


@app.middleware("http")
async def llm_telemetry_middleware(request: Request, call_next):
    path = request.url.path
    if not any(path.startswith(p) for p in _AI_PATH_PREFIXES):
        return await call_next(request)

    t0 = time.time()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        return response
    finally:
        latency_ms = int((time.time() - t0) * 1000)
        try:
            try:
                from services import llm_service
            except ImportError:
                from .services import llm_service
            ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
            if not ip:
                ip = request.client.host if request.client else "unknown"
            llm_service.log_request(
                endpoint=path,
                ip=ip,
                latency_ms=latency_ms,
                status=status,
            )
        except Exception:
            pass

@app.get("/")
def root():
    return {"message": "Welcome to the Satellite Interactive Visualizer Backend!"}

@app.on_event("startup")
def startup_event():
    print("🚀 Backend is starting...")

    # ✅ Print registered API routes to check if `/count` exists
    for route in app.routes:
        print(f"🔍 Route loaded: {route.path}")

    try:
        db_user = os.getenv('DB_USER')
        db_password = os.getenv('DB_PASSWORD')
        db_host = os.getenv('DB_HOST')
        db_port = os.getenv('DB_PORT',"5432")
        db_name = os.getenv('DB_NAME')

        db_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
        engine = create_engine(db_url)

        with engine.connect() as connection:
            print("✅ Successfully connected to the database!")
    except SQLAlchemyError as e:
        print(f"❌ Database connection failed: {str(e)}")

    print("🔍 FastAPI app has started.")


@app.on_event("shutdown")
def shutdown_event():
    print("🛑 Backend is shutting down...")

#OKAY
