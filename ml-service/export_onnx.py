import os
import torch
from transformers import AutoTokenizer
from src.model import SiameseNetwork

def export_to_onnx():
    print("Booting up full PyTorch Factory...")
    model = SiameseNetwork('sentence-transformers/all-MiniLM-L6-v2')
    
    # Load your fine-tuned weights!
    weight_file = 'plagiarism_detector_model.pth'
    if os.path.exists(weight_file):
        print(f"Discovered {weight_file}! Injecting your custom trained weights into the model...")
        model.load_state_dict(torch.load(weight_file, map_location='cpu'))
    else:
        print("No .pth weights found. Exporting base model.")
        
    model.eval()
    
    tokenizer = AutoTokenizer.from_pretrained('sentence-transformers/all-MiniLM-L6-v2')
    dummy_text = "Trace sentence for ONNX."
    inputs = tokenizer(dummy_text, padding='max_length', truncation=True, max_length=128, return_tensors="pt")
    
    save_dir = "onnx_model"
    os.makedirs(save_dir, exist_ok=True)
    onnx_path = os.path.join(save_dir, "model.onnx")
    
    print("Freezing layers and compiling ONNX binaries...")
    torch.onnx.export(
        model, 
        (inputs['input_ids'], inputs['attention_mask']), 
        onnx_path,
        export_params=True,
        input_names=['input_ids', 'attention_mask'],
        output_names=['output_embeddings'],
        dynamic_axes={
            'input_ids': {0: 'batch_size'},
            'attention_mask': {0: 'batch_size'},
            'output_embeddings': {0: 'batch_size'}
        },
        opset_version=14
    )
    
    print(f"Export Complete! The frozen brain is now saved at {onnx_path}.")

if __name__ == "__main__":
    export_to_onnx()
