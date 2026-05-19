from typing import Set


def _word_bigrams(text: str) -> Set[str]:
    """Return the set of word bigrams for a piece of text.

    Falls back to unigrams when the text is a single word, so very short
    chunks still produce a non-empty set for comparison.
    """
    words = text.lower().split()
    if len(words) < 2:
        return set(words)
    return {f"{words[i]} {words[i+1]}" for i in range(len(words) - 1)}


def jaccard_similarity(text_a: str, text_b: str) -> float:
    """Word-bigram Jaccard overlap between two strings.

    Returns a value in [0, 1]:
      - 1.0  → identical word sequences
      - 0.0  → no shared bigrams at all
      - intermediate values indicate partial lexical overlap

    Bigrams (pairs of consecutive words) are used rather than unigrams
    because they capture word-order information. Two texts can share every
    individual word but in completely different arrangements, which unigrams
    would score as 1.0 even though the sentences mean different things.
    """
    ngrams_a = _word_bigrams(text_a)
    ngrams_b = _word_bigrams(text_b)

    if not ngrams_a and not ngrams_b:
        return 0.0

    intersection = len(ngrams_a & ngrams_b)
    union = len(ngrams_a | ngrams_b)
    return intersection / union if union > 0 else 0.0


def classify_match_type(semantic_score: float, lexical_score: float) -> str:
    """Classify a matched region based on its semantic and lexical scores.

    Categories:
      "verbatim"  — high semantic AND high lexical: the text is largely the
                    same word-for-word. Direct copy or minimal rewording.
      "paraphrase" — high semantic but low lexical: the meaning is the same
                    but the wording is substantially different. Indicates
                    AI-assisted paraphrasing or manual rewriting.
      "similar"   — everything else: moderate overlap that may or may not be
                    deliberate. Shown but flagged at lower severity.

    Thresholds were chosen conservatively to minimise false positives
    in each category rather than maximise coverage.
    """
    if semantic_score >= 0.78 and lexical_score >= 0.50:
        return "verbatim"
    if semantic_score >= 0.60 and lexical_score < 0.30:
        return "paraphrase"
    return "similar"
