import matplotlib.pyplot as plt
import seaborn as sns
import umap
import numpy as np
import torch

class PlagiarismVisualizer:
    def __init__(self, embeddings_db, student_names):
        self.embeddings_db = embeddings_db
        self.student_names = student_names
    
    def plot_similarity_heatmap(self, results):
        n = len(self.student_names)
        matrix = np.zeros((n, n))
        name_to_idx = {name: i for i, name in enumerate(self.student_names)}
        
        for (name_a, name_b, score) in results:
            i, j = name_to_idx[name_a], name_to_idx[name_b]
            matrix[i][j] = score
            matrix[j][i] = score
            
        np.fill_diagonal(matrix, 1.0)
        
        plt.figure(figsize=(10, 8))
        sns.heatmap(matrix, xticklabels=self.student_names, yticklabels=self.student_names, 
                    annot=True, cmap="Reds", vmin=0, vmax=1)
        plt.title("Plagiarism Intensity Heatmap")
        plt.tight_layout()
        plt.show()

    def plot_classroom_clusters(self):
        vectors = []
        valid_names = []
        
        # Average chunks to get document-level vectors
        for name in self.student_names:
            if self.embeddings_db[name].shape[0] > 0:
                doc_vector = torch.mean(self.embeddings_db[name], dim=0).numpy()
                vectors.append(doc_vector)
                valid_names.append(name)
            
        vector_matrix = np.array(vectors)
        
        if len(vector_matrix) < 3:
            print("Not enough data points for UMAP (need at least 3). Skipping cluster plot.")
            return

        reducer = umap.UMAP(n_neighbors=min(5, len(vector_matrix)-1), min_dist=0.3, metric='cosine', random_state=42)
        embedding_2d = reducer.fit_transform(vector_matrix)
        
        plt.figure(figsize=(10, 8))
        x = embedding_2d[:, 0]
        y = embedding_2d[:, 1]
        
        plt.scatter(x, y, c='blue', alpha=0.6)
        
        for i, name in enumerate(valid_names):
            plt.text(x[i], y[i], name, fontsize=9)
            
        plt.title("Classroom Cluster Map (UMAP)")
        plt.xlabel("Dim 1")
        plt.ylabel("Dim 2")
        plt.grid(True, linestyle='--', alpha=0.3)
        plt.tight_layout()
        plt.show()