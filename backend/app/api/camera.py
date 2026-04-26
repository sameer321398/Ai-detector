from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from ..services.detection import detector
import json

router = APIRouter()

@router.websocket("/ws/detect")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Receive frame as bytes
            data = await websocket.receive_bytes()
            
            # Process frame using YOLO detector
            results, processed_img_base64 = detector.process_frame(data)
            
            # Send results back
            response = {
                "image": processed_img_base64,
                "detections": results.get("detections", [])
            }
            await websocket.send_text(json.dumps(response))
            
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error in websocket: {e}")
