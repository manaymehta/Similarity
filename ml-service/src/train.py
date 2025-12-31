import torch
import torch.nn as nn
import torch.optim as optim

def train_model(model, dataloader, device, epochs=3, save_path='plagiarism_detector_model.pth'):
    # Loss: CosineEmbeddingLoss
    # Margin 0.5: Push dissimilar vectors at least 0.5 distance apart
    criterion = nn.CosineEmbeddingLoss(margin=0.5)
    
    optimizer = optim.AdamW(model.parameters(), lr=2e-5)

    model.train()
    print(f"Starting training for {epochs} epochs on {device}...")
    
    for epoch in range(epochs):
        total_loss = 0
        
        for batch_idx, batch in enumerate(dataloader):
            ids_a = batch['input_ids_a'].to(device)
            mask_a = batch['attention_mask_a'].to(device)
            ids_b = batch['input_ids_b'].to(device)
            mask_b = batch['attention_mask_b'].to(device)
            labels = batch['label'].to(device)
            
            # Convert 0/1 labels to -1/1 for CosineEmbeddingLoss
            # 1 = Similar, -1 = Dissimilar
            targets = labels.clone()
            targets[targets == 0] = -1
            
            optimizer.zero_grad()
            
            embedding_a = model(ids_a, mask_a)
            embedding_b = model(ids_b, mask_b)
            
            loss = criterion(embedding_a, embedding_b, targets)
            
            loss.backward()
            optimizer.step()
            
            total_loss += loss.item()
            
            if batch_idx % 50 == 0:
                print(f"Epoch {epoch+1} | Batch {batch_idx} | Loss: {loss.item():.4f}")
        
        avg_loss = total_loss / len(dataloader)
        print(f"--- Epoch {epoch+1} Complete. Average Loss: {avg_loss:.4f} ---")

    torch.save(model.state_dict(), save_path)
    print(f"Model saved to {save_path}")