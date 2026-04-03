import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import chromadb

from dotenv import load_dotenv

try:
    import torch
    import torch.nn.functional as F
    USE_TORCH = True
except ImportError:
    import numpy as np
    USE_TORCH = False

load_dotenv()

from src.utils import create_checker

class Document(BaseModel):
    filename: str
    content: str

class CompareRequest(BaseModel):
    doc_a: Document
    doc_b: Document

class Region(BaseModel):
    a_start: int
    a_end: int
    b_start: int
    b_end: int
    score: float
    text_a: str
    text_b: str
    a_start_char: int
    a_end_char: int
    b_start_char: int
    b_end_char: int

class SimilarityResponse(BaseModel):
    score: float
    regions: List[Region]

print("Loading model...")
checker = create_checker('plagiarism_detector_model.pth')
print("Model loaded.")

app = FastAPI()

@app.get("/health")
def health_check():
    return {"status": "ok", "model_loaded": checker is not None, "engine": "PyTorch" if USE_TORCH else "ONNX/Numpy"}

@app.post("/compare", response_model=SimilarityResponse)
def compare_documents(request: CompareRequest):
    if not checker:
        raise HTTPException(status_code=503, detail="Model not initialized")
    
    doc_a = request.doc_a.content
    doc_b = request.doc_b.content
    
    vec_a = checker.get_document_embedding(doc_a)
    vec_b = checker.get_document_embedding(doc_b)
    score = checker.compare_documents(vec_a, vec_b)
    
    processed_regions_dicts = checker.get_regions_with_text(doc_a, doc_b, high_threshold=0.6, low_threshold=0.5)
    processed_regions = [Region(**r) for r in processed_regions_dicts]
    
    return SimilarityResponse(score=score, regions=processed_regions)

class EncodeRequest(BaseModel):
    document: Document

class ChunkData(BaseModel):
    vector: List[float]
    text: str
    chunk_index: int
    start_char: int
    end_char: int

class EncodeResponse(BaseModel):
    chunks: List[ChunkData]

@app.post("/encode", response_model=EncodeResponse)
def encode_document_chunks(request: EncodeRequest):
    if not checker:
        raise HTTPException(status_code=503, detail="Model not initialized")
    
    doc_content = request.document.content
    chunks_meta = checker.chunk_text(doc_content)
    response_chunks = []
    
    if USE_TORCH:
        with torch.no_grad():
            for i, meta in enumerate(chunks_meta):
                chunk_str = meta['text']
                inputs = checker.tokenizer(chunk_str, padding='max_length', truncation=True, max_length=128, return_tensors="pt")
                input_ids = inputs['input_ids'].to(checker.device)
                mask = inputs['attention_mask'].to(checker.device)

                vector = checker.model(input_ids, mask)
                vector = F.normalize(vector, p=2, dim=1)
                vec_list = vector.cpu().numpy()[0].tolist()
                
                response_chunks.append(ChunkData(vector=vec_list, text=meta['text'], chunk_index=i, start_char=meta['start_char'], end_char=meta['end_char']))
    else:
        for i, meta in enumerate(chunks_meta):
            chunk_str = meta['text']
            inputs = checker.tokenizer(chunk_str, padding='max_length', truncation=True, max_length=128, return_tensors=None)
            input_ids = np.array([inputs['input_ids']], dtype=np.int64)
            mask = np.array([inputs['attention_mask']], dtype=np.int64)
            
            vector = checker.model(input_ids, mask)
            norm = np.linalg.norm(vector, ord=2, axis=1, keepdims=True)
            norm = np.where(norm == 0, 1e-12, norm)
            vector = vector / norm
            vec_list = vector[0].tolist()

            response_chunks.append(ChunkData(vector=vec_list, text=meta['text'], chunk_index=i, start_char=meta['start_char'], end_char=meta['end_char']))
            
    return EncodeResponse(chunks=response_chunks)

class BatchRequest(BaseModel):
    documents: List[Document]

class BatchComparisonResult(BaseModel):
    file1: str
    file2: str
    score: float
    regions: List[Region]

class BatchResponse(BaseModel):
    results: List[BatchComparisonResult]

@app.post("/batch-compare", response_model=BatchResponse)
def batch_compare_documents(request: BatchRequest):
    if not checker:
        raise HTTPException(status_code=503, detail="Model not initialized")
    
    docs = request.documents
    results = []
    
    embeddings = {}
    for doc in docs:
        embeddings[doc.filename] = checker.get_document_embedding(doc.content)
    
    n = len(docs)
    for i in range(n):
        for j in range(i + 1, n):
            doc_a = docs[i]
            doc_b = docs[j]
            vec_a = embeddings[doc_a.filename]
            vec_b = embeddings[doc_b.filename]
            
            score = checker.compare_documents(vec_a, vec_b)
            regions_dicts = checker.get_regions_with_text(doc_a.content, doc_b.content, 0.6, 0.5)
            regions = [Region(**r) for r in regions_dicts]
            
            results.append(BatchComparisonResult(file1=doc_a.filename, file2=doc_b.filename, score=score, regions=regions))
            
    return BatchResponse(results=results)

try:
    chroma_host = os.environ.get('CHROMA_HOST', '127.0.0.1')
    chroma_port = int(os.environ.get('CHROMA_PORT', '8000'))
    chroma_client = chromadb.HttpClient(host=chroma_host, port=chroma_port)
    chroma_collection = chroma_client.get_or_create_collection(name="similarity_chunks")
    print("Connected to ChromaDB")
except Exception as e:
    print(f"Warning: Failed to connect to ChromaDB: {e}")
    chroma_collection = None

class CompareGroupRequest(BaseModel):
    hashes: List[str]
    filenames: dict

@app.post("/compare-group", response_model=BatchResponse)
def compare_group(request: CompareGroupRequest):
    if not checker:
        raise HTTPException(status_code=503, detail="Model not initialized")
    if not chroma_collection:
        raise HTTPException(status_code=503, detail="ChromaDB not connected")

    hashes = request.hashes
    if not hashes:
        return BatchResponse(results=[])

    try:
        results = chroma_collection.get(where={"file_hash": {"$in": hashes}}, include=["embeddings", "metadatas"])
    except Exception as e:
        print(f"Chroma Query Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    if not results['ids']:
        return BatchResponse(results=[])

    temp_storage = {}
    for i, _id in enumerate(results['ids']):
        meta = results['metadatas'][i]
        vector = results['embeddings'][i]
        h = meta['file_hash']
        
        if h not in temp_storage:
            temp_storage[h] = []
        
        temp_storage[h].append({'index': meta['chunk_index'], 'vector': vector, 'meta': meta})

    file_data = {}
    for h, items in temp_storage.items():
        items.sort(key=lambda x: x['index'])
        if USE_TORCH:
            vectors = torch.tensor([x['vector'] for x in items])
        else:
            vectors = np.array([x['vector'] for x in items], dtype=np.float32)

        chunks_meta = [x['meta'] for x in items]
        file_data[h] = {'vectors': vectors, 'chunks_meta': chunks_meta}

    comparison_results = []
    unique_hashes = list(file_data.keys())
    n = len(unique_hashes)

    for i in range(n):
        for j in range(i + 1, n):
            h1 = unique_hashes[i]
            h2 = unique_hashes[j]
            data1 = file_data[h1]
            data2 = file_data[h2]
            
            score = checker.compare_documents(data1['vectors'], data2['vectors'])
            
            regions = checker.get_regions_with_chunks(
                data1['chunks_meta'], data2['chunks_meta'],
                data1['vectors'], data2['vectors'], 0.6, 0.5
            )
            
            comparison_results.append(BatchComparisonResult(
                file1=request.filenames.get(h1, "Unknown"),
                file2=request.filenames.get(h2, "Unknown"),
                score=score,
                regions=[Region(**r) for r in regions]
            ))

    return BatchResponse(results=comparison_results)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=5001)
