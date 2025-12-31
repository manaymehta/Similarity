import torch
from torch.utils.data import Dataset
import pandas as pd

class ParaphraseDataset(Dataset):
    def __init__(self, csv_file, tokenizer, max_length=128):
        """
        Custom Dataset to handle PAWS/MRPC CSV format.
        Expects CSV columns: 'sentence1', 'sentence2', 'label'
        """
        self.data = pd.read_csv(csv_file)
        
        # Validation
        required_cols = ['sentence1', 'sentence2', 'label']
        if not all(col in self.data.columns for col in required_cols):
            raise ValueError(f"CSV must contain columns: {required_cols}")
            
        self.tokenizer = tokenizer
        self.max_length = max_length

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        row = self.data.iloc[idx]
        
        # Tokenize Sentence A
        sent_a = self.tokenizer(
            str(row['sentence1']), 
            padding='max_length', 
            truncation=True, 
            max_length=self.max_length, 
            return_tensors="pt"
        )
        
        # Tokenize Sentence B
        sent_b = self.tokenizer(
            str(row['sentence2']), 
            padding='max_length', 
            truncation=True, 
            max_length=self.max_length, 
            return_tensors="pt"
        )

        return {
            'input_ids_a': sent_a['input_ids'].squeeze(0),
            'attention_mask_a': sent_a['attention_mask'].squeeze(0),
            'input_ids_b': sent_b['input_ids'].squeeze(0),
            'attention_mask_b': sent_b['attention_mask'].squeeze(0),
            'label': torch.tensor(row['label'], dtype=torch.float)
        }