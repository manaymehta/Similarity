import os
import argparse
from src.utils import create_checker, print_regions

def debug_pair(file_a, file_b):
    # Initialize device, tokenizer, model as checker
    checker = create_checker('plagiarism_detector_model.pth')

    with open(file_a, 'r', encoding='utf-8') as f:
        text_a = f.read()
    with open(file_b, 'r', encoding='utf-8') as f:
        text_b = f.read()
        
    # Analyze and Print similar Regions
    print_regions(
        checker, 
        text_a, 
        text_b, 
        filename_a=os.path.basename(file_a), 
        filename_b=os.path.basename(file_b),
        high_thresh=0.60,
        low_thresh=0.50
    )

if __name__ == "__main__":
    
    parser = argparse.ArgumentParser(description="Debug similarity between two specific files using Region Expansion.")
    parser.add_argument('file_a', nargs='?', help="First file path")
    parser.add_argument('file_b', nargs='?', help="Second file path")
    args = parser.parse_args()

    if args.file_a and args.file_b:
        debug_pair(args.file_a, args.file_b)
    else:
        print("No files provided.\n")