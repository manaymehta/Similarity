import re

# Regions shorter than this character count are noise — a 3-word match from a shared
# sentence fragment is not actionable plagiarism evidence.
MIN_REGION_CHARS = 80

# Common academic / boilerplate phrases that produce high cosine similarity scores
# between any two academic documents without indicating actual plagiarism.
# Stored normalised (lowercase, no trailing punctuation) for fast membership testing.
_STOP_PHRASES = {
    "in conclusion",
    "to conclude",
    "in summary",
    "to summarize",
    "to summarise",
    "in closing",
    "as mentioned above",
    "as discussed above",
    "as stated above",
    "as noted above",
    "as described above",
    "as shown above",
    "it is important to note",
    "it is important to note that",
    "it should be noted",
    "it should be noted that",
    "it is worth noting",
    "it is worth noting that",
    "as a result",
    "as a consequence",
    "for example",
    "for instance",
    "in other words",
    "that is to say",
    "in addition",
    "in addition to",
    "furthermore",
    "moreover",
    "on the other hand",
    "however",
    "nevertheless",
    "nonetheless",
    "therefore",
    "thus",
    "hence",
    "in this paper",
    "in this paper we",
    "this paper presents",
    "this paper proposes",
    "this paper describes",
    "the purpose of this paper",
    "the aim of this paper",
    "the aim of this study",
    "the objective of this study",
    "the goal of this study",
    "in this study",
    "in this research",
    "in this work",
    "this study aims",
    "this study investigates",
    "as shown in",
    "as can be seen",
    "as shown in figure",
    "as illustrated in",
    "with respect to",
    "with regard to",
    "in terms of",
    "it can be seen that",
    "it can be concluded that",
    "based on the results",
    "based on the findings",
    "the results show",
    "the results indicate",
    "the findings suggest",
    "the data shows",
    "according to",
    "as previously mentioned",
    "as previously discussed",
}


def _normalise(text: str) -> str:
    return re.sub(r'\s+', ' ', text.lower().strip().rstrip('.,;:'))


def _dominated_by_stop_phrase(normalised_text: str) -> bool:
    """Return True if the text is either identical to a stop phrase, or a stop
    phrase makes up more than 75% of its characters (e.g. 'In conclusion, ...')."""
    if normalised_text in _STOP_PHRASES:
        return True
    for phrase in _STOP_PHRASES:
        if len(normalised_text) > 0 and len(phrase) / len(normalised_text) > 0.75:
            if normalised_text.startswith(phrase):
                return True
    return False


def filter_regions(regions: list) -> list:
    """
    Remove regions that are:
    1. Too short to be meaningful (< MIN_REGION_CHARS characters on either side).
    2. Dominated by common academic boilerplate phrases.

    Operates purely on text content — no model calls required.
    """
    filtered = []
    for region in regions:
        text_a = region.get('text_a', '')
        text_b = region.get('text_b', '')

        if len(text_a) < MIN_REGION_CHARS or len(text_b) < MIN_REGION_CHARS:
            continue

        norm_a = _normalise(text_a)
        norm_b = _normalise(text_b)

        if _dominated_by_stop_phrase(norm_a) or _dominated_by_stop_phrase(norm_b):
            continue

        filtered.append(region)

    return filtered
