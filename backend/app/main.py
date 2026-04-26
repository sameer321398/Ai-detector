from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
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

# Setup serving of frontend (Unified Deployment)
# Get the absolute path to the frontend/dist folder
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
frontend_dist = os.path.join(BASE_DIR, "frontend", "dist")

if os.path.isdir(frontend_dist):
    # Mount the assets directory specifically
    app.mount("/assets", StaticFiles(directory=os.path.join(frontend_dist, "assets")), name="assets")
    
    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        # Serve index.html for root
        if full_path == "" or full_path == "/":
            return FileResponse(os.path.join(frontend_dist, "index.html"))
            
        # For other files (like vite.svg), try to serve them directly
        file_path = os.path.join(frontend_dist, full_path)
        if os.path.isfile(file_path):
            return FileResponse(file_path)
            
        # Fallback to index.html for client-side routing
        return FileResponse(os.path.join(frontend_dist, "index.html"))
else:
    @app.get("/")
    def read_root():
        return {"status": "ok", "message": "Live AI Detector API is running (Frontend dist folder not found!)"}
