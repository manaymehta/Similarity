import torch
import torch.nn as nn
from transformers import AutoModel

class SiameseNetwork(nn.Module):
    def __init__(self, model_name='sentence-transformers/all-MiniLM-L6-v2'):
        super(SiameseNetwork, self).__init__()
        
        # Load the pre-trained Transformer (Shared Weights)
        self.transformer = AutoModel.from_pretrained(model_name)

    def mean_pooling(self, model_output, attention_mask):
        """
        Converts token embeddings to a single sentence vector.
        """
        token_embeddings = model_output.last_hidden_state
        input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
        
        sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, 1)
        sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        
        return sum_embeddings / sum_mask

    def forward(self, input_ids, attention_mask):
        """
        Forward pass for a single input. Called twice for pairs.
        """
        output = self.transformer(input_ids=input_ids, attention_mask=attention_mask)
        embedding = self.mean_pooling(output, attention_mask)
        return embedding