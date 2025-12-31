import argparse
import torch
from torch.utils.data import DataLoader
from transformers import AutoTokenizer

from src.dataset import ParaphraseDataset
from src.model import SiameseNetwork
from src.train import train_model
from src.visualize import PlagiarismVisualizer
from src.utils import load_submissions_from_folder, create_checker

def run_training(csv_path, epochs, save_path):
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")
    
    tokenizer = AutoTokenizer.from_pretrained('sentence-transformers/all-MiniLM-L6-v2')
    dataset = ParaphraseDataset(csv_path, tokenizer)
    dataloader = DataLoader(dataset, batch_size=16, shuffle=True)
    
    model = SiameseNetwork().to(device)
    
    train_model(model, dataloader, device, epochs=epochs, save_path=save_path)

def run_explorer(input_dir, model_path):
    checker = create_checker(model_path)
    student_submissions = load_submissions_from_folder(input_dir)
    if not student_submissions:
        return

    print("Computing document embeddings...")
    embeddings_db = {}
    for name, text in student_submissions.items():
        embeddings_db[name] = checker.get_document_embedding(text)
        
    print("Comparing documents...")
    names = list(student_submissions.keys())
    results = []
    
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            score = checker.compare_documents(embeddings_db[names[i]], embeddings_db[names[j]])
            print(f"{names[i]} vs {names[j]}: {score:.4f}")
            results.append((names[i], names[j], score))
            
    viz = PlagiarismVisualizer(embeddings_db, names)
    viz.plot_similarity_heatmap(results)
    #viz.plot_classroom_clusters()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Deep Learning Plagiarism Explorer")
    parser.add_argument('--mode', type=str, required=True, choices=['train', 'explore'], help="Operation mode")
    parser.add_argument('--csv', type=str, default='data/raw/paws_train.csv', help="Path to training CSV")
    parser.add_argument('--input_dir', type=str, default='data/assignments', help="Folder containing student .txt files")
    parser.add_argument('--model_path', type=str, default='plagiarism_detector_model.pth', help="Path to save/load model")
    parser.add_argument('--epochs', type=int, default=3, help="Training epochs")
    
    args = parser.parse_args()
    
    if args.mode == 'train':
        run_training(args.csv, args.epochs, args.model_path)
    elif args.mode == 'explore':
        run_explorer(args.input_dir, args.model_path)