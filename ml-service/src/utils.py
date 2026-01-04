import os
import glob
import torch
from transformers import AutoTokenizer
from src.model import SiameseNetwork
from src.inference import PlagiarismChecker

def load_submissions_from_folder(folder_path):
    # Reads all .txt files from the specified folder. Returns dictionary: {'filename': 'content'}
    submissions = {}
    search_path = os.path.join(folder_path, "*.txt")
    files = glob.glob(search_path)
    
    if not files:
        print(f"No .txt files found in {folder_path}")
        return {}
        
    print(f"Found {len(files)} documents.")
    for file_path in files:
        filename = os.path.basename(file_path)
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                if len(content.strip()) > 0:
                    submissions[filename] = content
        except Exception as e:
            print(f"Error reading {filename}: {e}")
            
    return submissions

def create_checker(model_path='plagiarism_detector_model.pth'):
    # device, model, tokenizer as checker instance.
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")
    
    tokenizer = AutoTokenizer.from_pretrained('sentence-transformers/all-MiniLM-L6-v2')
    model = SiameseNetwork().to(device)
    
    if os.path.exists(model_path):
        model.load_state_dict(torch.load(model_path, map_location=device))
        print(f"Loaded model from {model_path}")
    else:
        print("Model file not found. Using untrained weights.")
        
    return PlagiarismChecker(model, tokenizer, device)

def print_regions(checker, text_a, text_b, filename_a, filename_b, high_thresh=0.60, low_thresh=0.50):
    # Finds and prints similarity regions between two docs.
    print(f"Documents Match: {filename_a} vs {filename_b}")
    
    regions = checker.find_similarity_regions(text_a, text_b, high_threshold=high_thresh, low_threshold=low_thresh)
    
    if not regions:
        print("No significant similarity regions found.")
        return

    # convert text to chunks
    chunks_a = checker.chunk_text(text_a)
    chunks_b = checker.chunk_text(text_b)

    # then regions containing 1 or more chunks to text 
    for i, region in enumerate(regions): # regions - {'a_start': int, 'a_end': int, 'b_start': int, 'b_end': int, 'score': float}
        score = region['score']
        print(f"\nRegion #{i+1} (Avg Score: {score:.4f})")
        
        # Document A
        start_a, end_a = region['a_start'], region['a_end']
        print(f"{filename_a} Chunks {start_a}-{end_a}")
        region_text_a = " ".join(chunks_a[start_a : end_a+1])
        print(f"\"{region_text_a}\"")
        
        # Document B
        start_b, end_b = region['b_start'], region['b_end']
        print(f"{filename_b} Chunks {start_b}-{end_b}")
        region_text_b = " ".join(chunks_b[start_b : end_b+1])
        print(f"\"{region_text_b}\"")

def save_embeddings(embeddings_db, path='embeddings.pth'):
    #Save the embeddings dictionary to disk
    print(f"Saving database to {path}...")
    torch.save(embeddings_db, path)

def load_embeddings(path='embeddings.pth'):
    #Load the embeddings dictionary from disk if it exists
    if os.path.exists(path):
        print(f"Loading database from {path}...")
        try:
             # Use weights_only=False locally as we trust our own file
             return torch.load(path, weights_only=False) 
        except:
             # Fallback for older pytorch versions / if argument not supported
             print("Failed to load embeddings with weights_only=False. Falling back to default.")
             return torch.load(path)
    return {}
