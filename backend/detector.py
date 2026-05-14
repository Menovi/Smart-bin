"""YOLOv11-CA inference wrapper.

Loads your trained best.pt (export from Kaggle notebook) and runs detection.
The model outputs boxes for: biological, cardboard, metal, paper, plastic.

For 'litter outside the bin' detection logic:
- The ESP32-CAM is mounted ON the bin facing outward at the ground around it.
- Any detection with confidence > threshold counts as litter on the ground.
- More than `LITTER_OUTSIDE_THRESHOLD` detections triggers an alert.
"""
import os
from pathlib import Path
from typing import List, Dict, Any
import cv2
import numpy as np
from ultralytics import YOLO

MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "models/best.pt")
CONF_THRESHOLD = float(os.getenv("YOLO_CONF", "0.35"))
LITTER_OUTSIDE_THRESHOLD = int(os.getenv("LITTER_OUTSIDE_THRESHOLD", "1"))

#CLASS_NAMES = ["biological", "cardboard", "metal", "paper", "plastic"]


class LitterDetector:
    def __init__(self, model_path: str = MODEL_PATH):
        self.model_path = Path(model_path)
        self.model = None
        if self.model_path.exists():
            self.model = YOLO(str(self.model_path))
            print(f"[detector] loaded {self.model_path}")
        else:
            print(f"[detector] WARNING: {self.model_path} not found. "
                  f"Detection endpoint will return mock results until you "
                  f"copy your trained best.pt into backend/models/")

    def detect(self, image_bytes: bytes, save_dir: str = "uploads") -> Dict[str, Any]:
        """Run inference on raw image bytes; return structured detections."""
        Path(save_dir).mkdir(parents=True, exist_ok=True)

        # decode
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Could not decode image")

        ts = int(np.random.rand() * 1e9)
        raw_path = Path(save_dir) / f"raw_{ts}.jpg"
        ann_path = Path(save_dir) / f"ann_{ts}.jpg"
        cv2.imwrite(str(raw_path), img)

        if self.model is None:
            # Mock for development without weights
            return {
                "image_path": str(raw_path),
                "annotated_path": None,
                "classes": [],
                "num_detections": 0,
                "has_litter_outside": False,
                "mock": True,
            }

        results = self.model.predict(img, conf=CONF_THRESHOLD, verbose=False)
        r = results[0]

        detections = []
        annotated = img.copy()
        for box in r.boxes:
            cls_id = int(box.cls.item())
            cls_name = self.model.names.get(cls_id, str(cls_id))
            conf = float(box.conf.item())
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            detections.append({
                "class": cls_name,
                "confidence": round(conf, 3),
                "bbox": [x1, y1, x2, y2],
            })
            # annotate
            color = (0, 255, 0)
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
            label = f"{cls_name} {conf:.2f}"
            cv2.putText(annotated, label, (x1, max(20, y1 - 6)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

        cv2.imwrite(str(ann_path), annotated)

        return {
            "image_path": str(raw_path),
            "annotated_path": str(ann_path),
            "classes": detections,
            "num_detections": len(detections),
            "has_litter_outside": len(detections) >= LITTER_OUTSIDE_THRESHOLD,
        }


detector = LitterDetector()
