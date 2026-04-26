import cv2
import numpy as np
import base64
import os

class YOLODetector:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(YOLODetector, cls).__new__(cls)
            
            # Load the lightweight ONNX model using OpenCV instead of PyTorch!
            model_path = os.path.join(os.path.dirname(__file__), "..", "..", "yolov8n.onnx")
            cls._instance.net = cv2.dnn.readNetFromONNX(model_path)
            
            # Standard COCO classes
            cls._instance.classes = ["person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush"]
        return cls._instance

    def process_frame(self, image_bytes: bytes) -> tuple[dict, str]:
        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        
        if img is None:
            return {}, ""

        # Prepare image for OpenCV DNN (YOLOv8 was exported at 320x320)
        blob = cv2.dnn.blobFromImage(img, 1/255.0, (320, 320), swapRB=True, crop=False)
        self.net.setInput(blob)
        preds = self.net.forward()
        
        # YOLOv8 ONNX output shape is (1, 84, 2100) -> Transpose to (2100, 84)
        preds = preds[0].T 
        
        boxes = []
        scores = []
        class_ids = []
        
        img_h, img_w = img.shape[:2]
        x_factor = img_w / 320
        y_factor = img_h / 320

        # Parse the raw ONNX output
        for row in preds:
            classes_scores = row[4:]
            max_score = np.amax(classes_scores)
            
            if max_score > 0.3:
                class_id = np.argmax(classes_scores)
                
                cx, cy, w, h = row[0:4]
                
                width = int(w * x_factor)
                height = int(h * y_factor)
                x = int((cx * x_factor) - (width / 2))
                y = int((cy * y_factor) - (height / 2))
                
                boxes.append([x, y, width, height])
                scores.append(float(max_score))
                class_ids.append(class_id)
                
        # Perform Non-Maximum Suppression to remove overlapping boxes
        indices = cv2.dnn.NMSBoxes(boxes, scores, 0.3, 0.45)
        
        detections = []
        if len(indices) > 0:
            for i in indices.flatten():
                box = boxes[i]
                x, y, w, h = box
                label = self.classes[class_ids[i]]
                conf = scores[i]
                
                detections.append({
                    "label": label,
                    "confidence": conf,
                    "box": [x, y, x+w, y+h]
                })
                
                # Draw on image
                cv2.rectangle(img, (x, y), (x+w, y+h), (0, 255, 0), 2)
                cv2.putText(img, f"{label} {conf:.2f}", (x, max(y - 10, 0)), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

        # Encode image back to JPEG and Base64
        _, buffer = cv2.imencode('.jpg', img)
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return {"detections": detections}, img_base64

# Singleton instance
detector = YOLODetector()
