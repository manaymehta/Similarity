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
1.  **Ingestion (`scanRoutes.ts`)**:
    *   Endpoint: `POST /api/scan/upload`
    *   Middleware: `multer` (MemoryStorage). Files are held in RAM buffer.
2.  **State Management (`ScanGroup` Model)**:
    *   A `ScanGroup` document is created in MongoDB immediately upon upload.
    *   Status: `pending` -> `processing` -> `completed`.
3.  **Processing (`scanController.ts`)**:
    *   **Async Execution**: The API returns `201 Created` immediately with a `scanId`. The processing runs in the background.
    *   **Rationale**: ML inference on 50 files can take minutes. A standard HTTP request would timeout. The "Pending/Completed" status pattern allows the Frontend to poll for results without blocking.

### B. Integration (`mlService.ts`)
*   **Protocol**: HTTP (axios).
*   **Target**: `http://localhost:8000/batch-compare`.
*   **Payload**: `{ documents: [{filename: "...", content: "..."}] }`.
*   **Response Handling**:
    *   Receives list of `BatchComparisonResult` objects (containing `Region[]`).
    *   Writes each result to the `ComparisonResult` MongoDB collection.

### C. Database Schema (MongoDB)
*   **ScanGroup**: `{ _id, status, files: [{filename, content}], createdAt }`
*   **ComparisonResult**: `{ scanGroupId, file1, file2, score, regions: [...] }`
    *   *Note*: Normalized schema. Results are linked to the Group ID.

---
## 3. Frontend Client (`client/`)
**Role**: User Interface (Dashboard).
*   **Framework**: React 18 + Vite.
*   **Integration**: Polls `GET /api/scan/:id/status` to check progress.
*   **Visualization**: Renders the N x N similarity matrix as a heatmap.


---

## 4. File Structure (Canonical Map)
```text
Similarity/
├── client/                  # [Frontend] React + Vite
├── server/                  # [Backend] Node.js API
│   ├── src/
│   │   ├── controllers/     # Business Logic (scanController)
│   │   ├── services/        # External Calls (mlService -> Python)
│   │   └── routes/          # API Endpoints
├── ml-service/              # [ML Engine] Python
│   ├── cli_main.py          # CLI Entry Point (Train/Explore/Search)
│   ├── main.py              # HTTP Server Entry Point (FastAPI/Flask)
│   ├── embeddings.pth       # [Artifact] Persisted Vector DB
│   ├── data/                # Local Test Data
│   └── src/                 # ML Source Code
│       ├── model.py         # SiameseNetwork Class
│       ├── inference.py     # PlagiarismChecker & Region Logic
│       ├── utils.py         # Load/Save Embeddings, Print Helpers
│       └── visualize.py     # Heatmap Plotting
└── README.md                # Project Overview
```

## 5. Technical Specifications (Configuration)
*   **Embedding Dim**: 384
*   **Similarity Thresholds**:
    *   High (Seed): 0.60
    *   Low (Expand): 0.50
*   **Max Text Length**: Unlimited (via Sliding Window)
*   **Upload Limit**: 5MB per file (Server constraint).
