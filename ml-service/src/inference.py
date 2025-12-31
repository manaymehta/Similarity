import torch
import torch.nn.functional as F

class PlagiarismChecker:
    def __init__(self, model, tokenizer, device, window_size=64, stride=30):
        self.model = model
        self.tokenizer = tokenizer
        self.window_size = window_size
        self.stride = stride
        self.device = device
        self.model.eval()

    def chunk_text(self, text):
        words = text.split()
        chunks = []
        if len(words) < self.window_size:
            return [" ".join(words)]
            
        for i in range(0, len(words), self.stride):
            chunk = " ".join(words[i : i + self.window_size])
            chunks.append(chunk)
            if i + self.window_size >= len(words):
                break
        return chunks

    def get_document_embedding(self, text):
        chunks = self.chunk_text(text)
        chunk_embeddings = []

        with torch.no_grad():
            for chunk in chunks:
                inputs = self.tokenizer(
                    chunk, 
                    padding='max_length', 
                    truncation=True, 
                    max_length=128, # Full limit to avoid loss
                    return_tensors="pt"
                )
                
                input_ids = inputs['input_ids'].to(self.device)
                mask = inputs['attention_mask'].to(self.device)

                vector = self.model(input_ids, mask)
                
                # Normalize the magnitudes to 1 by L2 Normalization, for cosine similarity
                # This is not required for dot product, but it is required for cosine similarity
                vector = F.normalize(vector, p=2, dim=1)
                chunk_embeddings.append(vector.cpu())

        if chunk_embeddings:
            return torch.vstack(chunk_embeddings)
        else:
            dim = self.model.transformer.config.hidden_size
            return torch.zeros(1, dim)

    def compare_documents(self, doc_a_vectors, doc_b_vectors):        
        doc_a_vectors = doc_a_vectors.to(self.device)
        doc_b_vectors = doc_b_vectors.to(self.device)

        # Cosine Similarity Matrix
        # Dot product is done as the length is already considered as 1
        sim_matrix = torch.mm(doc_a_vectors, doc_b_vectors.T)
        
        # For each chunk in A, find its best match in B and vice versa
        max_a, _ = torch.max(sim_matrix, dim=1)
        max_b, _ = torch.max(sim_matrix, dim=0)
        
        combined_max = torch.cat([max_a, max_b])
        
        # average of the top 5 best matches
        k = min(5, combined_max.numel())
        top_k_values, _ = torch.topk(combined_max, k)
        
        return torch.mean(top_k_values).item()

    # expands the target regions to include similar chunks, increase the range of the regions
    def find_similarity_regions(self, text_a, text_b, high_threshold, low_threshold):
        # Returns a list of dicts: {'a_start': int, 'a_end': int, 'b_start': int, 'b_end': int, 'score': float}
        chunks_a = self.chunk_text(text_a)
        chunks_b = self.chunk_text(text_b)
        
        if not chunks_a or not chunks_b:
            return []
            
        vecs_a = self.get_document_embedding(text_a).to(self.device)
        vecs_b = self.get_document_embedding(text_b).to(self.device)
        
        sim_matrix = torch.mm(vecs_a, vecs_b.T)
        rows, cols = sim_matrix.size()
        
        # Identify targets           
        target = (sim_matrix > high_threshold).nonzero(as_tuple=False).tolist()
        
        # Sort by strongest targets first so that priority is given to regions with higher similarity
        target.sort(key=lambda idx: sim_matrix[idx[0], idx[1]].item(), reverse=True)
        
        visited_a = set()
        visited_b = set()
        regions = []
        
        for r_idx, c_idx in target:
            if r_idx in visited_a or c_idx in visited_b:
                continue
                
            # Initialize region
            a_start, a_end = r_idx, r_idx
            b_start, b_end = c_idx, c_idx
            visited_a.add(r_idx)
            visited_b.add(c_idx)
            
            # only checks for conditions where prev of A similar to prev of B or next of A similar to next of B, not diagonal similarity, something to work on in future maybe
            # Expand Backward
            curr_a, curr_b = r_idx - 1, c_idx - 1
            while curr_a >= 0 and curr_b >= 0:
                score = sim_matrix[curr_a, curr_b].item()
                if score > low_threshold and curr_a not in visited_a and curr_b not in visited_b:
                    a_start = curr_a
                    b_start = curr_b
                    visited_a.add(curr_a)
                    visited_b.add(curr_b)
                    curr_a -= 1
                    curr_b -= 1
                else:
                    break
            
            # Expand Forward
            curr_a, curr_b = r_idx + 1, c_idx + 1
            while curr_a < rows and curr_b < cols:
                score = sim_matrix[curr_a, curr_b].item()
                if score > low_threshold and curr_a not in visited_a and curr_b not in visited_b:
                    a_end = curr_a
                    b_end = curr_b
                    visited_a.add(curr_a)
                    visited_b.add(curr_b)
                    curr_a += 1
                    curr_b += 1
                else:
                    break
            
            regions.append({
                'a_start': a_start, 'a_end': a_end,
                'b_start': b_start, 'b_end': b_end,
                'score': sim_matrix[a_start:a_end+1, b_start:b_end+1].mean().item()
            })
            
        return regions