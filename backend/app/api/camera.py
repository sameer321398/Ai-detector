from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from ..services.detection import detector
import json

router = APIRouter()

@router.websocket("/ws/detect")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            try:
                # Receive frame as bytes
                data = await websocket.receive_bytes()
                
                # Process frame using YOLO detector in a threadpool to prevent blocking the async event loop!
                results, processed_img_base64 = await run_in_threadpool(detector.process_frame, data)
                
                # Send results back
                response = {
                    "image": processed_img_base64,
                    "detections": results.get("detections", [])
                }
                await websocket.send_text(json.dumps(response))
            except Exception as loop_e:
                print(f"Error processing frame: {loop_e}")
                # Send a blank response or error to keep pipeline moving
                await websocket.send_text(json.dumps({"image": "", "detections": []}))
                
    except WebSocketDisconnect:
        print("Client disconnected")
    except Exception as e:
        print(f"Error in websocket: {e}")
