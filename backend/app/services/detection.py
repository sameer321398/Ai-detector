import cv2
import numpy as np
import base64
import os

import torch

# Prevent OpenCV and PyTorch from causing severe threading deadlocks on Linux containers
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"

# Set YOLO to use the temporary directory on Render to prevent config warnings
os.environ["YOLO_CONFIG_DIR"] = "/tmp"
os.environ["YOLO_DATA_DIR"] = "/tmp"

# Prevent PyTorch from spawning too many threads
torch.set_num_threads(1)
cv2.setNumThreads(1)

from ultralytics import YOLO

class YOLODetector:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(YOLODetector, cls).__new__(cls)
            # Load the YOLO model, using yolov8n.pt as standard if 11n is not available natively.
            cls._instance.model = YOLO("yolov8n.pt") 
        return cls._instance

    def process_frame(self, image_bytes: bytes) -> tuple[dict, str]:
        # Convert bytes to numpy array
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        
        if img is None:
            return {}, ""

        # Perform detection with heavily reduced image size to prevent Render free-tier crashes
        results = self.model(img, verbose=False, imgsz=320)
        
        # Parse results and draw boxes
        detections = []
        for result in results:
            boxes = result.boxes
            for box in boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                conf = float(box.conf[0])
                cls = int(box.cls[0])
                label = self.model.names[cls]
                
                detections.append({
                    "label": label,
                    "confidence": conf,
                    "box": [x1, y1, x2, y2]
                })
                
                # Draw on image
                cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(img, f"{label} {conf:.2f}", (x1, max(y1 - 10, 0)), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        # Encode image back to JPEG and Base64
        _, buffer = cv2.imencode('.jpg', img)
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return {"detections": detections}, img_base64

# Singleton instance
detector = YOLODetector()
