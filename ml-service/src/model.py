import os

try:
    import torch
    import torch.nn as nn
    from transformers import AutoModel
    USE_TORCH = True
except ImportError:
    import numpy as np
    import onnxruntime as ort
    USE_TORCH = False

if USE_TORCH:
    class SiameseNetwork(nn.Module):
        def __init__(self, model_name='sentence-transformers/all-MiniLM-L6-v2'):
            super(SiameseNetwork, self).__init__()
        
        # Load the pre-trained Transformer
            self.transformer = AutoModel.from_pretrained(model_name)

        def mean_pooling(self, model_output, attention_mask):
        
        # Converts token embeddings to a single sentence vector.
        
            token_embeddings = model_output.last_hidden_state
            input_mask_expanded = attention_mask.unsqueeze(-1).expand(token_embeddings.size()).float()
            
            sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, 1)
            sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)
            
            return sum_embeddings / sum_mask

        def forward(self, input_ids, attention_mask):
        # Forward pass for a single input. Called twice for pairs.
            output = self.transformer(input_ids=input_ids, attention_mask=attention_mask)
            embedding = self.mean_pooling(output, attention_mask)
            return embedding
else:
    class SiameseNetwork:
        def __init__(self, model_path='onnx_model/model.onnx'):
            if not os.path.exists(model_path):
                raise FileNotFoundError(f"CRITICAL: ONNX model missing at {model_path}")
            
            # Load optimized CPU ONNX execution layer
            self.session = ort.InferenceSession(model_path, providers=['CPUExecutionProvider'])

        def __call__(self, input_ids, attention_mask):
            inputs = {
                "input_ids": np.array(input_ids, dtype=np.int64),
                "attention_mask": np.array(attention_mask, dtype=np.int64)
            }
            outputs = self.session.run(None, inputs)
            # The ONNX model performs the mean_pooling inside the computation graph itself
            return outputs[0]