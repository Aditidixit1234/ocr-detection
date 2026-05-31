# Handwriting OCR & Insights Pipeline

A modular, state-of-the-art handwriting recognition pipeline that converts images of handwritten text into corrected digital text and structured insights.

## Current Features
- **TrOCR-Base Integration:** Uses Transformer-based OCR for professional-grade handwriting recognition.
- **Spell Correction:** Integrated SymSpell-based correction to handle OCR transcription errors.
- **Automated Summarization:** Uses BART (Large-CNN) to generate concise summaries from recognized text.
- **Structured Insights:** Automatically extracts dates, word counts, and key metrics in JSON format.
- **GPU Accelerated:** Optimized for NVIDIA RTX 40-series GPUs (CUDA 12.4).
- **Finetuning Research:** Includes scripts for fine-tuning TrOCR on the IAM Handwriting Database.

## Project Structure
- `src/`: Production-ready modular code (OCR, NLP, Summarizer).
- `research/`: Experimental scripts and fine-tuning logs.
- `data/`: Frequency dictionaries and local vocabularies.
- `main.py`: The unified entry point for the pipeline.

## Installation
```bash
pip install -r requirements.txt
```

## Usage
Run the pipeline on any handwritten image:
```bash
python main.py --image path/to/your/image.jpg
```

---
*Developed as part of the Handwriting Recognition Mini-Project.*
