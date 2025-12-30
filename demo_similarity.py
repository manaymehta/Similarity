import torch

# Let's say Doc A has 2 chunks, Doc B has 3 chunks.
# (Simplified: 1x2 vectors for easy calculation)
doc_a = torch.tensor([
    [1.0, 0.0], # A1 (e.g., Topic: Apples)
    [0.1, 0.9]  # A2 (e.g., Topic: Bananas)
])

doc_b = torch.tensor([
    [0.9, 0.1], # B1 (Topic: Red Fruit - very similar to A1)
    [0.0, 1.0], # B2 (Topic: Yellow Fruit - very similar to A2)
    [0.5, 0.5]  # B3 (Topic: Mixed Fruit - middle ground)
])

# 1. Compute Similarity Matrix (Matrix Multiplication)
# sim_matrix[i][j] = similarity between Doc A[i] and Doc B[j]
# This basically compares EVERY section of A with EVERY section of B.
sim_matrix = torch.mm(doc_a, doc_b.T)
print("--- 1. Similarity Matrix (A rows vs B columns) ---")
print(sim_matrix)
print("\nInterpretation: Row 0 is Chunk A1 compared to B1, B2, B3.")

# 2. Max for each chunk in A (Best B for each A)
# dim=1 means "look across the columns for each row"
max_a, _ = torch.max(sim_matrix, dim=1)
print("\n--- 2. Best matches for each chunk in A ---")
print(max_a) 
# Result: [0.9000, 0.9000] 
# (A1 matched best with B1 (0.9), A2 matched best with B2 (0.9))

# 3. Max for each chunk in B (Best A for each B)
# dim=0 means "look across the rows for each column"
max_b, _ = torch.max(sim_matrix, dim=0)
print("\n--- 3. Best matches for each chunk in B ---")
print(max_b)
# Result: [0.9000, 0.9000, 0.5000]
# (B1 matched best with A1, B2 with A2, B3 with A2)

# 4. Combined
# This pools all "best effort" matches from both documents.
combined = torch.cat([max_a, max_b])
print("\n--- 4. Combined best match pool ---")
print(combined)

# 5. Final Score (Top-K)
# In your code, you take the Top 5. Here we only have 5 total, so we take them all.
k = min(5, combined.numel())
top_k_values, _ = torch.topk(combined, k)
final_score = torch.mean(top_k_values).item()
print("\n--- 5. Final Score (Average of pool) ---")
print(f"Score: {final_score:.4f}")
