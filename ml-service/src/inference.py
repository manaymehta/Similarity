import nltk
from .stop_phrases import filter_regions
from .lexical import jaccard_similarity, classify_match_type

# Maximum number of consecutive below-threshold diagonal cells the expansion
# will bridge before stopping. A value of 1 means: if chunk pair (i,j) scores
# weakly but (i+1,j+1) scores strongly, the weak chunk is included in the region
# rather than splitting the passage into two separate findings.
_GAP_TOLERANCE = 1

try:
    import torch
    import torch.nn.functional as F
    USE_TORCH = True
except ImportError:
    import numpy as np
    USE_TORCH = False

# Download NLTK tokenizer data on first use. punkt_tab is the newer format (NLTK >= 3.8.2),
# punkt is the fallback for older installs. Both are tried so either version works.
def _ensure_nltk_data():
    for resource in ('tokenizers/punkt_tab', 'tokenizers/punkt'):
        try:
            nltk.data.find(resource)
            return
        except LookupError:
            pass
    try:
        nltk.download('punkt_tab', quiet=True)
    except Exception:
        nltk.download('punkt', quiet=True)

_ensure_nltk_data()


class PlagiarismChecker:
    def __init__(self, model, tokenizer, device, window_size=64, stride=30):
        self.model = model
        self.tokenizer = tokenizer
        self.window_size = window_size
        self.stride = stride
        self.device = device

        if USE_TORCH:
            self.model.eval()

    def chunk_text(self, text):
        """
        Split text into overlapping sentence-aware chunks.

        Sentences are grouped until they reach ~window_size words, then the window
        advances by (n_sentences - 2), giving a 2-sentence overlap between adjacent
        chunks. This preserves semantic boundaries that a fixed word-count window
        would arbitrarily cut through.
        """
        sentences = nltk.sent_tokenize(text)
        if not sentences:
            return []

        # Map each sentence back to its character span in the original text.
        # text.find(sent, pos) is reliable here because we always advance pos
        # past the last match, preventing duplicate-sentence collisions.
        sentence_spans = []
        search_pos = 0
        for sent in sentences:
            idx = text.find(sent, search_pos)
            if idx == -1:
                idx = search_pos
            sentence_spans.append({'text': sent, 'start': idx, 'end': idx + len(sent)})
            search_pos = idx + len(sent)

        total_words = sum(len(s['text'].split()) for s in sentence_spans)

        # Short text: return as a single chunk
        if total_words < self.window_size:
            return [{
                'text': text[sentence_spans[0]['start']:sentence_spans[-1]['end']],
                'start_char': sentence_spans[0]['start'],
                'end_char': sentence_spans[-1]['end'],
                'chunk_index': 0
            }]

        chunks = []
        chunk_index = 0
        i = 0

        while i < len(sentence_spans):
            word_count = 0
            j = i

            # Accumulate sentences until we hit window_size words
            while j < len(sentence_spans):
                sent_words = len(sentence_spans[j]['text'].split())
                if word_count + sent_words > self.window_size and j > i:
                    break
                word_count += sent_words
                j += 1

            if j == i:
                j = i + 1  # always consume at least one sentence even if it alone exceeds window

            chunk_sents = sentence_spans[i:j]
            chunk_text_content = text[chunk_sents[0]['start']:chunk_sents[-1]['end']]

            if len(chunk_text_content.split()) >= 10:
                chunks.append({
                    'text': chunk_text_content,
                    'start_char': chunk_sents[0]['start'],
                    'end_char': chunk_sents[-1]['end'],
                    'chunk_index': chunk_index
                })
                chunk_index += 1

            # 2-sentence overlap: advance by (n_sentences_in_chunk - 2)
            n_sents = j - i
            advance = max(1, n_sents - 2)
            i += advance

        return chunks

    def _compute_adaptive_thresholds(self, sim_matrix):
        """
        Derive high/low similarity thresholds from the matrix itself.

        high = mean + 2*std  — marks clearly anomalous (likely plagiarised) cells
        low  = mean + 1.5*std — used to expand confirmed regions into adjacent chunks

        Clamped to [0.50, 0.92] for high and [0.35, high-0.05] for low so the
        thresholds stay meaningful regardless of the document domain (legal, creative,
        technical text all have very different baseline cosine distributions).
        """
        if USE_TORCH:
            mean = float(sim_matrix.mean().item())
            std = float(sim_matrix.std().item())
        else:
            mean = float(sim_matrix.mean())
            std = float(sim_matrix.std())

        high = mean + 2.0 * std
        low = mean + 1.5 * std

        high = min(max(high, 0.50), 0.92)
        low = min(max(low, 0.35), high - 0.05)

        return high, low

    def get_document_embedding(self, text):
        chunks = self.chunk_text(text)
        chunk_embeddings = []

        if USE_TORCH:
            with torch.no_grad():
                for chunk in chunks:
                    inputs = self.tokenizer(chunk['text'], padding='max_length', truncation=True, max_length=128, return_tensors="pt")
                    input_ids = inputs['input_ids'].to(self.device)
                    mask = inputs['attention_mask'].to(self.device)

                    vector = self.model(input_ids, mask)
                    vector = F.normalize(vector, p=2, dim=1)
                    chunk_embeddings.append(vector.cpu())

            if chunk_embeddings:
                return torch.vstack(chunk_embeddings)
            else:
                dim = self.model.transformer.config.hidden_size if hasattr(self.model, 'transformer') else 384
                return torch.zeros(1, dim)
        else:
            for chunk in chunks:
                inputs = self.tokenizer(chunk['text'], padding='max_length', truncation=True, max_length=128)
                input_ids = np.array([inputs['input_ids']], dtype=np.int64)
                mask = np.array([inputs['attention_mask']], dtype=np.int64)

                vector = self.model(input_ids, mask)
                norm = np.linalg.norm(vector, ord=2, axis=1, keepdims=True)
                norm = np.where(norm == 0, 1e-12, norm)
                vector = vector / norm
                chunk_embeddings.append(vector)

            if chunk_embeddings:
                return np.vstack(chunk_embeddings)
            else:
                return np.zeros((1, 384), dtype=np.float32)

    def compare_documents(self, doc_a_vectors, doc_b_vectors):
        if USE_TORCH:
            doc_a_vectors = doc_a_vectors.to(self.device)
            doc_b_vectors = doc_b_vectors.to(self.device)
            sim_matrix = torch.mm(doc_a_vectors, doc_b_vectors.T)
            max_a, _ = torch.max(sim_matrix, dim=1)
            max_b, _ = torch.max(sim_matrix, dim=0)
            combined_max = torch.cat([max_a, max_b])
            k = min(5, combined_max.numel())
            top_k_values, _ = torch.topk(combined_max, k)
            return torch.mean(top_k_values).item()
        else:
            sim_matrix = np.dot(doc_a_vectors, doc_b_vectors.T)
            max_a = np.max(sim_matrix, axis=1)
            max_b = np.max(sim_matrix, axis=0)
            combined_max = np.concatenate([max_a, max_b])
            combined_max.sort()
            k = min(5, combined_max.size)
            top_k = combined_max[-k:] if k > 0 else combined_max
            return float(np.mean(top_k)) if k > 0 else 0.0

    def find_similarity_regions(self, text_a, text_b, high_threshold=None, low_threshold=None, vecs_a=None, vecs_b=None):
        chunks_a = self.chunk_text(text_a)
        chunks_b = self.chunk_text(text_b)

        if not chunks_a or not chunks_b:
            return []

        if vecs_a is None:
            vecs_a = self.get_document_embedding(text_a)
        if vecs_b is None:
            vecs_b = self.get_document_embedding(text_b)

        if USE_TORCH:
            vecs_a = vecs_a.to(self.device)
            vecs_b = vecs_b.to(self.device)
            sim_matrix = torch.mm(vecs_a, vecs_b.T)
            rows, cols = sim_matrix.size()
        else:
            sim_matrix = np.dot(vecs_a, vecs_b.T)
            rows, cols = sim_matrix.shape

        if high_threshold is None or low_threshold is None:
            high_threshold, low_threshold = self._compute_adaptive_thresholds(sim_matrix)

        if USE_TORCH:
            target_indices = (sim_matrix > high_threshold).nonzero(as_tuple=False).tolist()
            target = [(int(r), int(c)) for r, c in target_indices]
            target.sort(key=lambda idx: sim_matrix[idx[0], idx[1]].item(), reverse=True)
        else:
            target_indices = np.argwhere(sim_matrix > high_threshold).tolist()
            target = [(int(r), int(c)) for r, c in target_indices]
            target.sort(key=lambda idx: sim_matrix[idx[0], idx[1]], reverse=True)

        # NOTE — known limitation: visited_a and visited_b are independent index sets,
        # so a chunk from file A that legitimately matches two different parts of file B
        # will only appear in the first (highest-scoring) region found. Fixing this
        # properly requires tracking (chunk_a, chunk_b) pairs, which is a larger
        # algorithmic change deferred until test coverage exists.
        visited_a = set()
        visited_b = set()
        regions = []

        for r_idx, c_idx in target:
            if r_idx in visited_a or c_idx in visited_b:
                continue

            a_start, a_end = r_idx, r_idx
            b_start, b_end = c_idx, c_idx
            visited_a.add(r_idx)
            visited_b.add(c_idx)

            # Backward expansion with gap tolerance.
            # gap_buffer holds cells tentatively skipped; they are only permanently
            # claimed (added to visited) when a good cell comes after them.
            curr_a, curr_b = r_idx - 1, c_idx - 1
            gap_buffer: list = []
            while curr_a >= 0 and curr_b >= 0:
                score = sim_matrix[curr_a, curr_b].item() if USE_TORCH else sim_matrix[curr_a, curr_b]
                if score > low_threshold and curr_a not in visited_a and curr_b not in visited_b:
                    for ga, gb in gap_buffer:
                        visited_a.add(ga)
                        visited_b.add(gb)
                    gap_buffer = []
                    a_start = curr_a
                    b_start = curr_b
                    visited_a.add(curr_a)
                    visited_b.add(curr_b)
                    curr_a -= 1
                    curr_b -= 1
                elif len(gap_buffer) < _GAP_TOLERANCE and curr_a not in visited_a and curr_b not in visited_b:
                    gap_buffer.append((curr_a, curr_b))
                    curr_a -= 1
                    curr_b -= 1
                else:
                    break

            # Forward expansion with gap tolerance.
            curr_a, curr_b = r_idx + 1, c_idx + 1
            gap_buffer = []
            while curr_a < rows and curr_b < cols:
                score = sim_matrix[curr_a, curr_b].item() if USE_TORCH else sim_matrix[curr_a, curr_b]
                if score > low_threshold and curr_a not in visited_a and curr_b not in visited_b:
                    for ga, gb in gap_buffer:
                        visited_a.add(ga)
                        visited_b.add(gb)
                    gap_buffer = []
                    a_end = curr_a
                    b_end = curr_b
                    visited_a.add(curr_a)
                    visited_b.add(curr_b)
                    curr_a += 1
                    curr_b += 1
                elif len(gap_buffer) < _GAP_TOLERANCE and curr_a not in visited_a and curr_b not in visited_b:
                    gap_buffer.append((curr_a, curr_b))
                    curr_a += 1
                    curr_b += 1
                else:
                    break

            matrix_slice = sim_matrix[a_start:a_end+1, b_start:b_end+1]
            region_score = matrix_slice.mean().item() if USE_TORCH else float(matrix_slice.mean())

            regions.append({
                'a_start': a_start, 'a_end': a_end,
                'b_start': b_start, 'b_end': b_end,
                'score': region_score
            })

        return regions

    def get_regions_with_text(self, text_a, text_b, high_threshold=None, low_threshold=None, vecs_a=None, vecs_b=None):
        raw_regions = self.find_similarity_regions(text_a, text_b, high_threshold, low_threshold, vecs_a, vecs_b)

        if not raw_regions:
            return []

        chunks_a = self.chunk_text(text_a)
        chunks_b = self.chunk_text(text_b)

        processed_regions = []
        for region in raw_regions:
            try:
                subset_chunks_a = chunks_a[region['a_start'] : region['a_end']+1]
                if not subset_chunks_a: continue
                text_a_content = text_a[subset_chunks_a[0]['start_char'] : subset_chunks_a[-1]['end_char']]
                a_start_char = subset_chunks_a[0]['start_char']
                a_end_char = subset_chunks_a[-1]['end_char']

                subset_chunks_b = chunks_b[region['b_start'] : region['b_end']+1]
                if not subset_chunks_b: continue
                text_b_content = text_b[subset_chunks_b[0]['start_char'] : subset_chunks_b[-1]['end_char']]
                b_start_char = subset_chunks_b[0]['start_char']
                b_end_char = subset_chunks_b[-1]['end_char']

                lexical_score = jaccard_similarity(text_a_content, text_b_content)
                match_type = classify_match_type(region['score'], lexical_score)

                processed_regions.append({
                    'a_start': region['a_start'],
                    'a_end': region['a_end'],
                    'b_start': region['b_start'],
                    'b_end': region['b_end'],
                    'score': region['score'],
                    'lexical_score': lexical_score,
                    'match_type': match_type,
                    'text_a': text_a_content,
                    'text_b': text_b_content,
                    'a_start_char': a_start_char,
                    'a_end_char': a_end_char,
                    'b_start_char': b_start_char,
                    'b_end_char': b_end_char
                })
            except (IndexError, KeyError):
                continue

        return filter_regions(processed_regions)

    def find_similarity_regions_from_chunks(self, vecs_a, vecs_b, high_threshold=None, low_threshold=None):
        is_empty = (vecs_a.numel() == 0 or vecs_b.numel() == 0) if USE_TORCH else (vecs_a.size == 0 or vecs_b.size == 0)
        if is_empty:
            return []

        if USE_TORCH:
            vecs_a = vecs_a.to(self.device)
            vecs_b = vecs_b.to(self.device)
            sim_matrix = torch.mm(vecs_a, vecs_b.T)
            rows, cols = sim_matrix.size()
        else:
            sim_matrix = np.dot(vecs_a, vecs_b.T)
            rows, cols = sim_matrix.shape

        if high_threshold is None or low_threshold is None:
            high_threshold, low_threshold = self._compute_adaptive_thresholds(sim_matrix)

        if USE_TORCH:
            target_indices = (sim_matrix > high_threshold).nonzero(as_tuple=False).tolist()
            target = [(int(r), int(c)) for r, c in target_indices]
            target.sort(key=lambda idx: sim_matrix[idx[0], idx[1]].item(), reverse=True)
        else:
            target_indices = np.argwhere(sim_matrix > high_threshold).tolist()
            target = [(int(r), int(c)) for r, c in target_indices]
            target.sort(key=lambda idx: sim_matrix[idx[0], idx[1]], reverse=True)

        # NOTE — same visited_a/visited_b limitation as find_similarity_regions above.
        visited_a = set()
        visited_b = set()
        regions = []

        for r_idx, c_idx in target:
            if r_idx in visited_a or c_idx in visited_b:
                continue

            a_start, a_end = r_idx, r_idx
            b_start, b_end = c_idx, c_idx
            visited_a.add(r_idx)
            visited_b.add(c_idx)

            curr_a, curr_b = r_idx - 1, c_idx - 1
            gap_buffer: list = []
            while curr_a >= 0 and curr_b >= 0:
                score = sim_matrix[curr_a, curr_b].item() if USE_TORCH else sim_matrix[curr_a, curr_b]
                if score > low_threshold and curr_a not in visited_a and curr_b not in visited_b:
                    for ga, gb in gap_buffer:
                        visited_a.add(ga)
                        visited_b.add(gb)
                    gap_buffer = []
                    a_start = curr_a
                    b_start = curr_b
                    visited_a.add(curr_a)
                    visited_b.add(curr_b)
                    curr_a -= 1
                    curr_b -= 1
                elif len(gap_buffer) < _GAP_TOLERANCE and curr_a not in visited_a and curr_b not in visited_b:
                    gap_buffer.append((curr_a, curr_b))
                    curr_a -= 1
                    curr_b -= 1
                else:
                    break

            curr_a, curr_b = r_idx + 1, c_idx + 1
            gap_buffer = []
            while curr_a < rows and curr_b < cols:
                score = sim_matrix[curr_a, curr_b].item() if USE_TORCH else sim_matrix[curr_a, curr_b]
                if score > low_threshold and curr_a not in visited_a and curr_b not in visited_b:
                    for ga, gb in gap_buffer:
                        visited_a.add(ga)
                        visited_b.add(gb)
                    gap_buffer = []
                    a_end = curr_a
                    b_end = curr_b
                    visited_a.add(curr_a)
                    visited_b.add(curr_b)
                    curr_a += 1
                    curr_b += 1
                elif len(gap_buffer) < _GAP_TOLERANCE and curr_a not in visited_a and curr_b not in visited_b:
                    gap_buffer.append((curr_a, curr_b))
                    curr_a += 1
                    curr_b += 1
                else:
                    break

            matrix_slice = sim_matrix[a_start:a_end+1, b_start:b_end+1]
            region_score = matrix_slice.mean().item() if USE_TORCH else float(matrix_slice.mean())

            regions.append({
                'a_start': a_start, 'a_end': a_end,
                'b_start': b_start, 'b_end': b_end,
                'score': region_score
            })

        return regions

    def get_regions_with_chunks(self, chunks_a_meta, chunks_b_meta, vecs_a, vecs_b, high_threshold=None, low_threshold=None):
        raw_regions = self.find_similarity_regions_from_chunks(vecs_a, vecs_b, high_threshold, low_threshold)

        processed_regions = []
        for reg in raw_regions:
            start_a_idx = reg['a_start']
            end_a_idx = reg['a_end']
            start_b_idx = reg['b_start']
            end_b_idx = reg['b_end']

            if start_a_idx >= len(chunks_a_meta) or end_a_idx >= len(chunks_a_meta): continue
            if start_b_idx >= len(chunks_b_meta) or end_b_idx >= len(chunks_b_meta): continue

            start_chunk_a = chunks_a_meta[start_a_idx]
            end_chunk_a = chunks_a_meta[end_a_idx]

            start_chunk_b = chunks_b_meta[start_b_idx]
            end_chunk_b = chunks_b_meta[end_b_idx]

            text_a_stitched = " ".join([c.get('text_snippet', '') for c in chunks_a_meta[start_a_idx:end_a_idx+1]])
            text_b_stitched = " ".join([c.get('text_snippet', '') for c in chunks_b_meta[start_b_idx:end_b_idx+1]])

            lexical_score = jaccard_similarity(text_a_stitched, text_b_stitched)
            match_type = classify_match_type(reg['score'], lexical_score)

            processed_regions.append({
                'a_start': reg['a_start'], 'a_end': reg['a_end'],
                'b_start': reg['b_start'], 'b_end': reg['b_end'],
                'score': reg['score'],
                'lexical_score': lexical_score,
                'match_type': match_type,
                'text_a': text_a_stitched,
                'text_b': text_b_stitched,
                'a_start_char': start_chunk_a.get('start_char', 0),
                'a_end_char': end_chunk_a.get('end_char', 0),
                'b_start_char': start_chunk_b.get('start_char', 0),
                'b_end_char': end_chunk_b.get('end_char', 0)
            })

        return filter_regions(processed_regions)

    def compare_batch(self, documents, ids, threshold=0.1):
        n = len(documents)
        if n < 2:
            return []

        embeddings = []
        for doc in documents:
            embeddings.append(self.get_document_embedding(doc))

        results = []

        for i in range(n):
            for j in range(i + 1, n):
                vec_a = embeddings[i].to(self.device) if USE_TORCH else embeddings[i]
                vec_b = embeddings[j].to(self.device) if USE_TORCH else embeddings[j]

                score = self.compare_documents(vec_a, vec_b)

                if score >= threshold:
                    regions = self.get_regions_with_text(
                        documents[i], documents[j], vecs_a=embeddings[i], vecs_b=embeddings[j]
                    )

                    results.append({
                        "file1": ids[i], "file2": ids[j], "score": score, "regions": regions
                    })

        return results
