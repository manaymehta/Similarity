import os

try:
    import torch
    import torch.nn.functional as F
    USE_TORCH = True
except ImportError:
    import numpy as np
    USE_TORCH = False

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
        words = text.split()
        chunks = []
        
        word_spans = []
        current_idx = 0
        for word in words:
            start = text.find(word, current_idx)
            end = start + len(word)
            word_spans.append({'word': word, 'start': start, 'end': end})
            current_idx = end
            
        if not word_spans:
             return []

        if len(words) < self.window_size:
            start_char = word_spans[0]['start']
            end_char = word_spans[-1]['end']
            chunks.append({
                'text': text[start_char:end_char],
                'start_char': start_char,
                'end_char': end_char,
                'chunk_index': 0
            })
            return chunks
            
        chunk_counter = 0
        for i in range(0, len(words), self.stride):
            window_words = word_spans[i : i + self.window_size]
            if not window_words:
                break
                
            start_char = window_words[0]['start']
            end_char = window_words[-1]['end']
            
            chunk_text_content = text[start_char:end_char]
            
            chunks.append({
                'text': chunk_text_content,
                'start_char': start_char,
                'end_char': end_char,
                'chunk_index': chunk_counter
            })
            chunk_counter += 1
            
            if i + self.window_size >= len(words):
                break
        return chunks

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

    def find_similarity_regions(self, text_a, text_b, high_threshold, low_threshold, vecs_a=None, vecs_b=None):
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
            target = (sim_matrix > high_threshold).nonzero(as_tuple=False).tolist()
            target.sort(key=lambda idx: sim_matrix[idx[0], idx[1]].item(), reverse=True)
        else:
            sim_matrix = np.dot(vecs_a, vecs_b.T)
            rows, cols = sim_matrix.shape
            target_indices = np.argwhere(sim_matrix > high_threshold).tolist()
            target = [(int(r), int(c)) for r, c in target_indices]
            target.sort(key=lambda idx: sim_matrix[idx[0], idx[1]], reverse=True)
            
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
            while curr_a >= 0 and curr_b >= 0:
                score = sim_matrix[curr_a, curr_b].item() if USE_TORCH else sim_matrix[curr_a, curr_b]
                if score > low_threshold and curr_a not in visited_a and curr_b not in visited_b:
                    a_start = curr_a
                    b_start = curr_b
                    visited_a.add(curr_a)
                    visited_b.add(curr_b)
                    curr_a -= 1
                    curr_b -= 1
                else:
                    break
            
            curr_a, curr_b = r_idx + 1, c_idx + 1
            while curr_a < rows and curr_b < cols:
                score = sim_matrix[curr_a, curr_b].item() if USE_TORCH else sim_matrix[curr_a, curr_b]
                if score > low_threshold and curr_a not in visited_a and curr_b not in visited_b:
                    a_end = curr_a
                    b_end = curr_b
                    visited_a.add(curr_a)
                    visited_b.add(curr_b)
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

    def get_regions_with_text(self, text_a, text_b, high_threshold, low_threshold, vecs_a=None, vecs_b=None):
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
                
                processed_regions.append({
                    'a_start': region['a_start'],
                    'a_end': region['a_end'],
                    'b_start': region['b_start'],
                    'b_end': region['b_end'],
                    'score': region['score'],
                    'text_a': text_a_content,
                    'text_b': text_b_content,
                    'a_start_char': a_start_char,
                    'a_end_char': a_end_char,
                    'b_start_char': b_start_char,
                    'b_end_char': b_end_char
                })
            except (IndexError, KeyError):
                continue
                
        return processed_regions

    def find_similarity_regions_from_chunks(self, vecs_a, vecs_b, high_threshold, low_threshold):
        is_empty = (vecs_a.numel() == 0 or vecs_b.numel() == 0) if USE_TORCH else (vecs_a.size == 0 or vecs_b.size == 0)
        if is_empty:
             return []

        if USE_TORCH:
            vecs_a = vecs_a.to(self.device)
            vecs_b = vecs_b.to(self.device)
            sim_matrix = torch.mm(vecs_a, vecs_b.T)
            rows, cols = sim_matrix.size()
            target = (sim_matrix > high_threshold).nonzero(as_tuple=False).tolist()
            target.sort(key=lambda idx: sim_matrix[idx[0], idx[1]].item(), reverse=True)
        else:
            sim_matrix = np.dot(vecs_a, vecs_b.T)
            rows, cols = sim_matrix.shape
            target_indices = np.argwhere(sim_matrix > high_threshold).tolist()
            target = [(int(r), int(c)) for r, c in target_indices]
            target.sort(key=lambda idx: sim_matrix[idx[0], idx[1]], reverse=True)
            
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
            while curr_a >= 0 and curr_b >= 0:
                score = sim_matrix[curr_a, curr_b].item() if USE_TORCH else sim_matrix[curr_a, curr_b]
                if score > low_threshold and curr_a not in visited_a and curr_b not in visited_b:
                    a_start = curr_a
                    b_start = curr_b
                    visited_a.add(curr_a)
                    visited_b.add(curr_b)
                    curr_a -= 1
                    curr_b -= 1
                else:
                    break
            
            curr_a, curr_b = r_idx + 1, c_idx + 1
            while curr_a < rows and curr_b < cols:
                score = sim_matrix[curr_a, curr_b].item() if USE_TORCH else sim_matrix[curr_a, curr_b]
                if score > low_threshold and curr_a not in visited_a and curr_b not in visited_b:
                    a_end = curr_a
                    b_end = curr_b
                    visited_a.add(curr_a)
                    visited_b.add(curr_b)
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

    def get_regions_with_chunks(self, chunks_a_meta, chunks_b_meta, vecs_a, vecs_b, high_threshold, low_threshold):
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

            processed_regions.append({
                'a_start': reg['a_start'], 'a_end': reg['a_end'],
                'b_start': reg['b_start'], 'b_end': reg['b_end'],
                'score': reg['score'],
                'text_a': text_a_stitched, 
                'text_b': text_b_stitched,
                'a_start_char': start_chunk_a.get('start_char', 0),  
                'a_end_char': end_chunk_a.get('end_char', 0),
                'b_start_char': start_chunk_b.get('start_char', 0),
                'b_end_char': end_chunk_b.get('end_char', 0)
            })
            
        return processed_regions

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
                        documents[i], documents[j], 0.6, 0.5, vecs_a=embeddings[i], vecs_b=embeddings[j]
                    )
                    
                    results.append({
                        "file1": ids[i], "file2": ids[j], "score": score, "regions": regions
                    })
                    
        return results