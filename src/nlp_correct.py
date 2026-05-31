import os
import re
import logging
from symspellpy import SymSpell
from difflib import SequenceMatcher


class TextCorrector:
    def __init__(self, dict_path="data/frequency_dictionary_en_82_765.txt"):
        print("Initializing Text Corrector (Safe Mode)...")

        self.sym_spell = SymSpell(max_dictionary_edit_distance=2)

        if os.path.exists(dict_path):
            self.sym_spell.load_dictionary(dict_path, term_index=0, count_index=1)
        else:
            logging.warning(f"Dictionary not found at {dict_path}")

    # 🔥 similarity check (IMPORTANT)
    def similarity(self, a, b):
        return SequenceMatcher(None, a, b).ratio()

    # 🔥 main cleaning function
    def clean_text(self, text):
        if not text:
            return ""

        # Normalize spacing
        text = re.sub(r'\s+', ' ', text).strip()

        words = text.split()
        corrected_words = []

        for word in words:

            # Skip numbers & very short words
            if len(word) <= 3 or word.isdigit():
                corrected_words.append(word)
                continue

            try:
                suggestions = self.sym_spell.lookup(
                    word,
                    verbosity=0,
                    max_edit_distance=2
                )

                if suggestions:
                    best = suggestions[0].term

                    # 🔥 SAFE REPLACEMENT RULE
                    sim = self.similarity(word.lower(), best.lower())

                    if sim > 0.85:
                        corrected_words.append(best)
                    else:
                        corrected_words.append(word)
                else:
                    corrected_words.append(word)

            except Exception as e:
                logging.error(f"Error correcting word '{word}': {e}")
                corrected_words.append(word)

        # Restore sentence format (simple)
        final_text = " ".join(corrected_words)

        # Capitalize first letter
        if final_text:
            final_text = final_text[0].upper() + final_text[1:]

        return final_text

    # 🔥 keep compatibility with your main.py
    def neural_correct(self, text, line_scores=None, threshold=0.99):
        return self.clean_text(text)