from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import torch
import uvicorn

from src.utils import create_checker

# Define Data Models
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

class SimilarityResponse(BaseModel):
    score: float
    regions: List[Region]

# Load model on startup
print("Loading model...")
checker = create_checker('plagiarism_detector_model.pth')
print("Model loaded.")

app = FastAPI()

@app.get("/health")
def health_check():
    return {"status": "ok", "model_loaded": checker is not None}

@app.post("/compare", response_model=SimilarityResponse)
def compare_documents(request: CompareRequest):
    if not checker:
        raise HTTPException(status_code=503, detail="Model not initialized")
    
    doc_a = request.doc_a.content
    doc_b = request.doc_b.content
    
    # similarity score
    vec_a = checker.get_document_embedding(doc_a)
    vec_b = checker.get_document_embedding(doc_b)
    score = checker.compare_documents(vec_a, vec_b)
    
    # regions
    # Using thresholds from original utils (0.6, 0.5)
    processed_regions_dicts = checker.get_regions_with_text(doc_a, doc_b, high_threshold=0.6, low_threshold=0.5)
    processed_regions = [Region(**r) for r in processed_regions_dicts]
    
    return SimilarityResponse(score=score, regions=processed_regions)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
