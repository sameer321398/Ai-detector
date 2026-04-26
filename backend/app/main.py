from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api import camera

app = FastAPI(title="Live AI Detector API")

# Configure CORS for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(camera.router, prefix="/api")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Live AI Detector API is running"}
