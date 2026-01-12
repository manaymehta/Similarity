# Project Deep Dive: Similarity Detector
> **Context**: This document provides a granular technical breakdown of the system components.

## 1. Machine Learning Service (`ml-service/`)
**Role**: The computational brain. It accepts text, generates vector embeddings, and performs N-vs-N semantic comparisons.

### A. Model Architecture (`src/model.py`)
*   **Base Model**: `sentence-transformers/all-MiniLM-L6-v2` (HuggingFace).
    *   *Reason*: Optimized for semantic search; faster than BERT-Base.
*   **Forward Pass**:
    1.  **Input**: Token IDs + Attention Mask (Max 128 tokens).
    2.  **Transformer**: Passes through BERT layers to get `last_hidden_state`.
    3.  **Mean Pooling**: Averages token vectors (accounting for attention mask).
    4.  **Output**: A **384-dimensional dense vector**.

### B. Training Logic (`src/train.py`)
*   **Objective**: Fine-tune the model to distinguish semantic paraphrases.
*   **Loss Function**: `nn.CosineEmbeddingLoss`
    *   **Margin**: `0.5`
    *   **Logic**:
        *   If `Label=1` (Paraphrase): Minimize `1 - cos(A, B)`.
        *   If `Label=-1` (Not Paraphrase): Maximize distance (up to margin 0.5).
*   **Optimizer**: `AdamW` (Learning Rate: `2e-5`).

### C. Inference Strategy (`src/inference.py`)
Handling large documents via **Sliding Window**:
*   **Chunking**: Documents > 128 tokens are split.
    *   `window_size=64` words.
    *   `stride=30` words (50% overlap).
    *   **Rationale**: BERT models have a hard limit (usually 512 tokens). Embedding a 10-page essay as one vector dilutes the signal. Sliding windows allow granular, sentence-level detection.
*   **Normalization**: Code applies L2 Normalization (`F.normalize(p=2)`) to vectors.
    *   *Benefit*: This allows us to use **Dot Product** (`torch.mm`) which is faster than calculating Cosine Similarity manually, as $A \cdot B = \cos(\theta)$ when $|A|=|B|=1$.

### D. Region Expansion Algorithm (`find_similarity_regions`)
Identifies "Plagiarism Islands" in a sea of text.
1.  **Matrix Calculation**: Compute `SimMatrix = A_chunks @ B_chunks.T`.
2.  **Seed Selection**: Find all cells $(i, j)$ where `Sim > 0.60`.
3.  **Expansion Loop**:
    *   For each seed, look Left $(i-1, j-1)$ and Right $(i+1, j+1)$.
    *   If Neighbor Sim > `0.50`, merge it into the current region.
    *   **Rationale**: Lowers false positives. A single 0.55 match might be a common idiom ("In conclusion..."). A 0.55 match *immediately following* a 0.80 match is likely part of a larger copied paragraph.

### E. Persistence Layer (`embeddings.pth`)
*   **Format**: `Dict[Filename -> Tensor(N, 384)]`.
*   **Behavior**: Saved to disk. On startup, loaded into RAM. Allows incremental updates (O(1) for old files).


---
## 2. Backend Server (`server/`)
**Role**: API Gateway & Task Orchestrator. Managed by Node.js/Express.

### A. Data Flow (Upload -> Result)
1.  **Ingestion (`groupsRoutes.ts`)**:
    *   Endpoint: `POST /api/groups`
    *   Middleware: `multer` (MemoryStorage). Files are held in RAM buffer.
2.  **State Management (`Group` Model)**:
    *   A `Group` document is created in MongoDB immediately upon upload.
    *   Status: `pending` -> `processing` -> `completed`.
3.  **Processing (`groupsController.ts`)**:
    *   **Async Execution**: The API processes files (hashing, checking cache, encoding via ML service) and creates the group.
    *   **Rationale**: ML encoding is resource intensive. Calculated chunks are cached in ChromaDB to speed up future requests.

### B. Integration (`groupsController.ts` -> ML Service)
*   **Protocol**: HTTP (axios).
*   **Target**: `http://127.0.0.1:5001/encode` (Per file) and `/compare-group` (Per group).
*   **Payload**: `{ documents: ... }` or `{ hashes: ... }`.
*   **Response Handling**:
    *   /encode: Receives chunks + vectors. Returns `ComparisonResult[]`. 
    *   /compare-group: Receives list of `ComparisonResult` objects (containing `Region[]`). Returns `ComparisonResult[]`. 

### C. Database Schema (MongoDB)
*   **Group**: `{ _id, name, files: [{hash, filename}], status, createdAt }`
*   **Document**: `{ hash, filename, fullText, chunkCount }` (Source of Truth for Text)
*   **ComparisonResult**: (Legacy/Optional) Used for caching results, but `/compare-group` often computes on-fly.

---
## 3. Frontend Client (`client/`)
**Role**: User Interface (Dashboard).
*   **Framework**: React 18 + Vite.
*   **Integration**: Polls `GET /api/groups` to list, and `/api/groups/:id/results` for report.
*   **Visualization**: Renders the N x N similarity matrix as a heatmap.


---

## 4. File Structure (Canonical Map)
```text
Similarity/
├── client/                  # [Frontend] React + Vite
├── server/                  # [Backend] Node.js API
│   ├── src/
│   │   ├── controllers/     # Business Logic (groupsController)
│   │   ├── models/          # Mongoose Models (Group, Document)
│   │   ├── utils/           # ChromaClient, Hash
│   │   └── routes/          # API Endpoints (groupsRoutes)
├── ml-service/              # [ML Engine] Python
│   ├── main.py              # HTTP Server Entry Point (FastAPI)
│   ├── data/                # Local Test Data
│   ├── requirements.txt     # Python Dependencies
│   └── src/                 # ML Source Code
│       ├── model.py         # SiameseNetwork Class
│       ├── inference.py     # PlagiarismChecker & Region Logic
│       ├── train.py         # Training Script
│       ├── utils.py         # Print Helpers
├── chroma_db/               # [Vector DB] Local Storage
└── README.md                # Project Overview
```

## 5. Technical Specifications (Configuration)
*   **Embedding Dim**: 384
*   **Similarity Thresholds**:
    *   High (Seed): 0.60
    *   Low (Expand): 0.50
*   **Max Text Length**: Unlimited (via Sliding Window)
*   **Upload Limit**: 5MB per file (Server constraint).

---

## 6. Recent Updates (Phase 6 & 7): Hybrid Vector Architecture
> **Context**: Moved from pure MongoDB storage to a Hybrid approach (MongoDB + ChromaDB) to enable incremental file addition and centralized ML logic.

### A. New Components
1.  **ChromaDB (Vector Store)**:
    *   **Port**: `8000` (Host: `127.0.0.1`).
    *   **Role**: Stores document *chunk embeddings* permanently.
    *   **Schema**:
        *   `ids`: `${file_hash}_${chunk_index}`
        *   `embeddings`: 384-d float vectors.
        *   `metadatas`: `{ file_hash, chunk_index, text_snippet, start_char, end_char }`

2.  **Updated ML Service (`ml-service/main.py`)**:
    *   **`POST /encode`**: Accepts a single document, chunks it, computes vectors, and returns them (for Node.js to save to Chroma).
    *   **`POST /compare-group`**: Accepts a list of file hashes.
        *   Fetches vectors directly from ChromaDB (using `file_hash`).
        *   Performs all-vs-all comparison using **Reference Counting** logic (optimized matrix operations).
        *   Returns detailed `ComparisonResult` with regions.

3.  **Updated Backend (`server/groupsController.ts`)**:
    *   **De-duplication**: Checks MongoDB for existing `file_hash`. If found, skips re-encoding (Instant upload).
    *   **Group Deletion**: Implements **Reference Counting Cleanup**.
        *   When a group is deleted, checks if its files are used by *any other* group.
        *   If `usageCount == 0`, deletes the file's metadata (MongoDB) and Vectors (ChromaDB) to prevent orphans.

### B. New Data Flow (Add Files to Group)
1.  User adds files to existing Group.
2.  Backend calculates Hash.
3.  **Cache Hit**: If hash exists in Mongo -> Link to Group.
4.  **Cache Miss**:
    *   Send to ML Service (`/encode`).
    *   Save Chunks to ChromaDB.
    *   Save Metadata to MongoDB.
    *   Link to Group.
5.  Call ML Service (`/compare-group`) with *new* list of hashes to get updated report.
