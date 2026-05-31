import torch
import re
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM


class InsightsExtractor:
    def __init__(self, model_name="facebook/bart-large-cnn"):
        print(f"Loading Summarizer: {model_name}...")

        self.device = "cuda" if torch.cuda.is_available() else "cpu"

        self.tokenizer = AutoTokenizer.from_pretrained(model_name)
        self.model = AutoModelForSeq2SeqLM.from_pretrained(model_name).to(self.device)

        self.model.eval()

    def extract(self, text):
        """Extract dates + generate meaningful summary only when needed."""

        if not text:
            return {
                "cleaned_text": "",
                "summary": "",
                "dates_found": [],
                "word_count": 0
            }

        # -----------------------------
        # 1. Extract Dates
        # -----------------------------
        date_pattern = r'\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*)\b'
        dates = re.findall(date_pattern, text, re.IGNORECASE)

        # -----------------------------
        # 2. Smart Summary Logic
        # -----------------------------
        words = text.split()
        word_count = len(words)

        if word_count > 25:
            try:
                inputs = self.tokenizer(
                    text,
                    max_length=1024,
                    return_tensors="pt",
                    truncation=True
                ).to(self.device)

                with torch.no_grad():
                    summary_ids = self.model.generate(
                        inputs["input_ids"],
                        num_beams=4,
                        max_length=60,
                        min_length=15,
                        early_stopping=True,
                        no_repeat_ngram_size=3
                    )

                summary = self.tokenizer.decode(summary_ids[0], skip_special_tokens=True)

            except Exception as e:
                print(f"Summarization error: {e}")
                summary = "Summary generation failed"

        else:
            # 🔥 IMPORTANT FIX: avoid useless summary
            summary = "Text too short for summarization"

        # -----------------------------
        # 3. Return Structured Output
        # -----------------------------
        return {
            "cleaned_text": text,
            "summary": summary,
            "dates_found": dates,
            "word_count": word_count
        }