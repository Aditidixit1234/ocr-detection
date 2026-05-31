import torch
import numpy as np
import os
import easyocr
from PIL import Image
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

# ✅ Vision API setup
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = r"C:\Users\KIIT0001\Desktop\ocr-detecttion-final-project\important\resonant-fiber-495217-j2-7e25a1bf5def.json"

from google.cloud import vision
print("ENV PATH:", os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"))


class OCRSystem:
    def __init__(self, model_name="microsoft/trocr-base-handwritten"):
        print(f"Loading OCR Model: {model_name}...")

        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print("Using device:", self.device)

        self.processor = TrOCRProcessor.from_pretrained(model_name)
        self.model = VisionEncoderDecoderModel.from_pretrained(model_name).to(self.device)

        if self.device.type == "cuda":
            self.model = self.model.half()

        self.model.eval()

        self.reader = easyocr.Reader(['en'], gpu=self.device.type == "cuda")

        # Vision client
        self.vision_client = vision.ImageAnnotatorClient()

    def _to_device(self, tensor):
        tensor = tensor.to(self.device)
        if self.device.type == "cuda":
            return tensor.half()
        return tensor

    # -------------------------------
    # Vision API
    # -------------------------------
    def run_vision_api(self, image_path):
        try:
            with open(image_path, "rb") as img_file:
                content = img_file.read()

            image = vision.Image(content=content)
            response = self.vision_client.text_detection(image=image)

            texts = response.text_annotations

            if texts:
                full_text = texts[0].description.strip()
                confidence = [0.9] * len(full_text.split())
            else:
                full_text = ""
                confidence = []

            return full_text, confidence

        except Exception as e:
            print("Vision API Error:", e)
            return "", []

    # -------------------------------
    # MAIN PROCESS FUNCTION
    # -------------------------------
    def process_image(self, image_path):

        image = Image.open(image_path).convert("RGB")
        img_np = np.array(image)

        # ✅ Safe defaults for EasyOCR
        easy_text = ""
        easy_conf = 0.0

        print("Detecting text regions with EasyOCR...")
        detections = self.reader.readtext(img_np, detail=1)

        # ✅ Extract EasyOCR text and confidence properly
        if detections:
            easy_text = " ".join([item[1] for item in detections])
            easy_conf = sum([item[2] for item in detections]) / len(detections)
            print(f"EasyOCR found: {easy_text}")
            print(f"EasyOCR confidence: {easy_conf:.4f}")
        else:
            print("EasyOCR found nothing.")

        # -------------------------------
        # CASE 1: NO DETECTION
        # -------------------------------
        if not detections:
            print("Fallback triggered (TrOCR full image)...")

            trocr_text, trocr_conf = self._process_fallback(image)
            trocr_scores = [trocr_conf]

            vision_text, vision_scores = self.run_vision_api(image_path)

        else:
            # -------------------------------
            # GROUP LINES
            # -------------------------------
            lines = self._group_detections_to_lines(detections)

            crops = []
            for line in lines:
                min_x = min([min([p[0] for p in d[0]]) for d in line])
                max_x = max([max([p[0] for p in d[0]]) for d in line])
                min_y = min([min([p[1] for p in d[0]]) for d in line])
                max_y = max([max([p[1] for p in d[0]]) for d in line])

                padding = 5
                crop = image.crop((
                    max(0, int(min_x - padding)),
                    max(0, int(min_y - padding)),
                    min(img_np.shape[1], int(max_x + padding)),
                    min(img_np.shape[0], int(max_y + padding))
                ))
                crops.append(crop)

            # -------------------------------
            # TROCR
            # -------------------------------
            with torch.no_grad():
                pixel_values = self.processor(crops, return_tensors="pt", padding=True).pixel_values
                pixel_values = self._to_device(pixel_values)

                outputs = self.model.generate(
                    pixel_values,
                    max_new_tokens=128,
                    num_beams=4,
                    early_stopping=True,
                    return_dict_in_generate=True,
                    output_scores=True
                )

            texts = self.processor.batch_decode(outputs.sequences, skip_special_tokens=True)

            if hasattr(outputs, "sequences_scores") and outputs.sequences_scores is not None:
                trocr_scores = torch.exp(outputs.sequences_scores / 2.0).cpu().numpy().tolist()
            else:
                trocr_scores = [0.8] * len(texts)

            trocr_text = " ".join(texts)

            # -------------------------------
            # VISION API
            # -------------------------------
            vision_text, vision_scores = self.run_vision_api(image_path)

        # -------------------------------
        # FINAL COMPARISON
        # -------------------------------
        best_text, best_conf, best_src = self._compare_results(
            trocr_text, trocr_scores, "trocr",
            vision_text, vision_scores, "vision_api"
        )

        # -------------------------------
        # SAFE AVG
        # -------------------------------
        def avg(scores):
            return sum(scores) / len(scores) if scores else 0

        trocr_avg  = avg(trocr_scores)
        vision_avg = avg(vision_scores)
        best_avg   = avg(best_conf)

        # -------------------------------
        # FINAL RESPONSE
        # -------------------------------
        return {
            "easy_text": easy_text,              # ✅ real EasyOCR text
            "easy_conf": easy_conf,              # ✅ real EasyOCR confidence

            "trocr_text": trocr_text,
            "trocr_conf": trocr_avg,

            "vision_text": vision_text,
            "vision_conf": vision_avg if vision_avg > 0 else 0.85,

            "raw_text": best_text,
            "cleaned_text": best_text,
            "insights": best_text,

            "confidence": best_avg,
            "ocr_source": best_src
        }

    # -------------------------------
    # COMPARISON
    # -------------------------------
    def _compare_results(self, text1, conf1, src1, text2, conf2, src2):

        avg1 = sum(conf1) / len(conf1) if conf1 else 0
        avg2 = sum(conf2) / len(conf2) if conf2 else 0

        print(f"Comparing → {src1}: {avg1:.2f} vs {src2}: {avg2:.2f}")

        if avg2 > avg1:
            return text2, conf2, src2
        else:
            return text1, conf1, src1

    # -------------------------------
    # HELPERS
    # -------------------------------
    def _group_detections_to_lines(self, detections, y_threshold=20):
        if not detections:
            return []

        detections.sort(key=lambda x: x[0][0][1])

        lines = []
        current_line = [detections[0]]

        for i in range(1, len(detections)):
            prev_y = detections[i-1][0][0][1]
            curr_y = detections[i][0][0][1]

            if abs(curr_y - prev_y) < y_threshold:
                current_line.append(detections[i])
            else:
                current_line.sort(key=lambda x: x[0][0][0])
                lines.append(current_line)
                current_line = [detections[i]]

        if current_line:
            current_line.sort(key=lambda x: x[0][0][0])
            lines.append(current_line)

        return lines

    def _process_fallback(self, image):
        with torch.no_grad():
            pixel_values = self.processor(image, return_tensors="pt").pixel_values
            pixel_values = self._to_device(pixel_values)

            outputs = self.model.generate(
                pixel_values,
                max_new_tokens=128,
                return_dict_in_generate=True,
                output_scores=True
            )

        text = self.processor.batch_decode(
            outputs.sequences,
            skip_special_tokens=True
        )[0].strip()

        conf = 0.8
        if hasattr(outputs, "sequences_scores") and outputs.sequences_scores is not None:
            conf = float(torch.exp(outputs.sequences_scores[0] / 2.0).cpu().item())
            conf = max(0.1, min(0.99, conf))

        return text, conf