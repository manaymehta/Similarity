import argparse
import torch
from torch.utils.data import DataLoader
from transformers import AutoTokenizer

from src.dataset import ParaphraseDataset
from src.model import SiameseNetwork
from src.train import train_model
from src.visualize import PlagiarismVisualizer
from src.utils import load_submissions_from_folder, create_checker, load_embeddings, save_embeddings, print_regions
import os

def run_training(csv_path, epochs, save_path):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")
    
    tokenizer = AutoTokenizer.from_pretrained('sentence-transformers/all-MiniLM-L6-v2')
    dataset = ParaphraseDataset(csv_path, tokenizer)
    dataloader = DataLoader(dataset, batch_size=16, shuffle=True)
    
    model = SiameseNetwork().to(device)
    
    train_model(model, dataloader, device, epochs=epochs, save_path=save_path)

def run_explorer(input_dir, model_path, db_path='embeddings.pth'):
    checker = create_checker(model_path)
    student_submissions = load_submissions_from_folder(input_dir)
    if not student_submissions:
        return

    # 1. Load Persistence Layer
    embeddings_db = load_embeddings(db_path)

    print("Checking for new documents...")
    for name, text in student_submissions.items():
        if name in embeddings_db:
            print(f"{name} Already in DB")
        else:
            print(f"Computing embedding for {name}...")
            embeddings_db[name] = checker.get_document_embedding(text)
            save_embeddings(embeddings_db, db_path)
        
    print("Comparing documents...")
    names = list(student_submissions.keys())
    results = []
    
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            # Only compare files we actually have
            if names[i] in embeddings_db and names[j] in embeddings_db:
                score = checker.compare_documents(embeddings_db[names[i]], embeddings_db[names[j]])
                print(f"{names[i]} vs {names[j]}: {score:.4f}")
                results.append((names[i], names[j], score))
            
    viz = PlagiarismVisualizer(embeddings_db, names)
    viz.plot_similarity_heatmap(results)

def run_search(input_file, model_path, db_path='embeddings.pth'):
    #Checks a SINGLE file against the entire database.
    if not os.path.exists(db_path):
        print("Error: No embedding database found. Run 'explore' mode first.")
        return

    checker = create_checker(model_path)
    
    # Load comparison DB
    embeddings_db = load_embeddings(db_path)
    
    # Load Input File
    with open(input_file, 'r', encoding='utf-8') as f:
        input_text = f.read()
    
    print(f"Computing embedding for input: {os.path.basename(input_file)}")
    input_vec = checker.get_document_embedding(input_text)
    
    print("\n--- Top Matches ---")
    matches = []
    for stored_name, stored_vec in embeddings_db.items():
        score = checker.compare_documents(input_vec, stored_vec)
        matches.append((stored_name, score))
        
    # Sort by score descending
    matches.sort(key=lambda x: x[1], reverse=True)
    
    for name, score in matches[:5]: # Top 5
        print(f"{name}: {score:.4f}")
        
    # Validation, Detailed View for Top Matches
    if matches:
        top_match = matches[0]
        if top_match[1] > 0.50: # Threshold
            print(f"\n--- Detailed Analysis vs Top Match ({top_match[0]}) ---")
            # We need to load text for the detailed view logic, which we unfortunately don't have stored in embeddings DB.
            # Assuming files are still in data/assignments for now
            top_file_path = os.path.join('data', 'assignments', top_match[0])
            if os.path.exists(top_file_path):
                with open(top_file_path, 'r', encoding='utf-8') as f:
                    top_text = f.read()
                
                from src.utils import print_regions
                print_regions(checker, input_text, top_text, os.path.basename(input_file), top_match[0])

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Deep Learning Plagiarism Explorer")
    parser.add_argument('--mode', type=str, required=True, choices=['train', 'explore', 'search'], help="Operation mode")
    parser.add_argument('--csv', type=str, default='data/raw/paws_train.csv', help="Path to training CSV")
    parser.add_argument('--input_dir', type=str, default='data/assignments', help="Folder containing student .txt files")
    parser.add_argument('--input_file', type=str, help="Single file path for 'search' mode")
    parser.add_argument('--model_path', type=str, default='plagiarism_detector_model.pth', help="Path to save/load model")
    parser.add_argument('--db_path', type=str, default='embeddings.pth', help="Path to embedding database")
    parser.add_argument('--epochs', type=int, default=3, help="Training epochs")
    
    args = parser.parse_args()
    
    if args.mode == 'train':
        run_training(args.csv, args.epochs, args.model_path)
    elif args.mode == 'explore':
        run_explorer(args.input_dir, args.model_path, args.db_path)
    elif args.mode == 'search':
        if not args.input_file:
            print("Error: --input_file is required for search mode.")
        else:
            run_search(args.input_file, args.model_path, args.db_path)