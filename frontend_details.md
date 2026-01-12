# Similarity Detector - Project Status & Technical Documentation
Date: 2026-01-07
Status: Functional Beta

## 1. Frontend Architecture & Flow

### Technology Stack
*   **Framework**: React (Vite) + TypeScript
*   **Styling**: Tailwind CSS v4 (configured via PostCSS)
*   **State Management**: React Hooks (`useState`, `useEffect`) + Custom Hooks ([useScanStatus](file:///d:/MANAY/MANAY/Code/Projects/Similarity/client/src/hooks/useScanStatus.ts#4-43))
*   **Routing**: React Router DOM

### User Flow
1.  **Home Page (`/`)**:
    *   **Functionality**: Users verify file requirements and create a new Group.
    *   **Components**:
        *   [FileDropZone](file:///d:/MANAY/MANAY/Code/Projects/Similarity/client/src/components/upload/FileDropZone.tsx#10-78): Handles drag-and-drop interactions.
        *   [UploadList](file:///d:/MANAY/MANAY/Code/Projects/Similarity/client/src/components/upload/FileDropZone.tsx#84-115): Displays selected files before upload.
    *   **Action**: Clicking "Start Analysis" triggers the upload.
    *   **Transition**: On success, redirects to `/report/:groupId`.

2.  **Report Page (`/report/:groupId`)**:
    *   **Functionality**: Displays group details and triggers analysis.
    *   **States**:
        *   *Loading*: Fetches group details.
        *   *Management*: Users can "Add Files" or "Delete Group".
        *   *Visualization*: Heatmap of similarity scores.
    *   **Components**:
        *   [Heatmap](file:///d:/MANAY/MANAY/Code/Projects/Similarity/client/src/components/visualization/Heatmap.tsx#11-111): N x N grid showing similarity scores between all file pairs. Clicking a cell opens the [SideBySideViewer](file:///d:/MANAY/MANAY/Code/Projects/Similarity/client/src/components/visualization/SideBySideViewer.tsx#11-157).
        *   [SideBySideViewer](file:///d:/MANAY/MANAY/Code/Projects/Similarity/client/src/components/visualization/SideBySideViewer.tsx#11-157): Modal showing full text of two documents with navigation arrows to jump between similar regions.

### Key Components
*   **SideBySideViewer ([src/components/visualization/SideBySideViewer.tsx](file:///d:/MANAY/MANAY/Code/Projects/Similarity/client/src/components/visualization/SideBySideViewer.tsx))**:
    *   **Features**:
        *   Dual-pane scrolling text view.
        *   "Previous/Next" navigation for highlighted regions.
        *   Regex-based fuzzy matching to highlight text even with whitespace differences.
        *   Auto-scrolling to the active match.

## 2. API Integration Map

This section details how the Frontend connects to the Backend services.

### API Endpoints
| Frontend Function | HTTP Method | Endpoint (Relative to `/api`) | Backend Controller | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| [createGroup](file:///d:/MANAY/MANAY/Code/Projects/Similarity/server/src/controllers/groupsController.ts) | `POST` | `/groups` | `groupsController.createGroup` | Creates a new group, encodes files via ML Service, and saves to MongoDB/ChromaDB. |
| [getGroups](file:///d:/MANAY/MANAY/Code/Projects/Similarity/server/src/controllers/groupsController.ts) | `GET` | `/groups` | `groupsController.getGroups` | Fetches list of all analysis groups. |
| [getGroupResults](file:///d:/MANAY/MANAY/Code/Projects/Similarity/server/src/controllers/groupsController.ts) | `GET` | `/groups/:id/results` | `groupsController.getGroupResults` | Triggers Python-based group comparison and returns similarity regions. |
| [deleteGroup](file:///d:/MANAY/MANAY/Code/Projects/Similarity/server/src/controllers/groupsController.ts) | `DELETE` | `/groups/:id` | `groupsController.deleteGroup` | Deletes group and performs **Orphan Cleanup** on unused files. |
| [addFilesToGroup](file:///d:/MANAY/MANAY/Code/Projects/Similarity/server/src/controllers/groupsController.ts) | `POST` | `/groups/:id/files` | `groupsController.addFilesToGroup` | Incremental addition of files to an existing group. |

### Data Flow
1.  **Upload**: Frontend sends `FormData` -> Backend (Multer) -> ML Service (`/encode`) -> Backend saves `Document` (Mongo) & Vectors (ChromaDB) -> Creates `Group`.
2.  **Analysis**: Frontend requests Results -> Backend sends Hashes to ML Service (`/compare-group`) -> ML Service queries ChromaDB -> Returns Comparisons.
3.  **Viewing**: Frontend renders Heatmap.

## 3. Backend Implementation Details

### Server ([server/src/](file:///d:/MANAY/MANAY/Code/Projects/Similarity/server/src))
*   **Routes ([groupsRoutes.ts](file:///d:/MANAY/MANAY/Code/Projects/Similarity/server/src/routes/groupsRoutes.ts))**: Registers the endpoints listed above.
*   **Controllers ([groupsController.ts](file:///d:/MANAY/MANAY/Code/Projects/Similarity/server/src/controllers/groupsController.ts))**:
    *   [createGroup](file:///d:/MANAY/MANAY/Code/Projects/Similarity/server/src/controllers/groupsController.ts): Handles file upload, de-duplication, ML encoding, and group creation.
    *   [getGroupResults](file:///d:/MANAY/MANAY/Code/Projects/Similarity/server/src/controllers/groupsController.ts): Orchestrates comparison by delegating High-CPU work to the Python ML Service.
    *   [deleteGroup](file:///d:/MANAY/MANAY/Code/Projects/Similarity/server/src/controllers/groupsController.ts): Critical maintenance logic. Ensures no orphaned files remain in storage.
*   **Models (`models/`)**:
    *   [Group](file:///d:/MANAY/MANAY/Code/Projects/Similarity/server/src/models/Group.ts): Analyzed collection of files.
    *   [Document](file:///d:/MANAY/MANAY/Code/Projects/Similarity/server/src/models/Document.ts): The physical file content and Chunk count. (Linked by Hash).

### ML Service (`ml-service/`)
*   **Endpoints**:
    *   `POST /batch-compare`: Accepts a list of documents.
*   **Logic ([main.py](file:///d:/MANAY/MANAY/Code/Projects/Similarity/ml-service/main.py))**:
    *   Pre-computes embeddings for all docs.
    *   Compares every unique pair (O(N^2)).
    *   Extracts similar regions using a sliding window approach ([src/inference.py](file:///d:/MANAY/MANAY/Code/Projects/Similarity/ml-service/src/inference.py)).
    *   Returns normalized JSON response.

## 4. Known Constraints & Notes
*   **File Size**: Limited to 5MB (Frontend validation).
*   **Highlighting**: Relies on text matching. If the document text is heavily pre-processed or changed significantly during normalization, specific highlights might be hard to match (though the Regex fix handles whitespace).
*   **Concurrency**: Simple background processing (not a job queue yet); large batches might timeout if the server process handles too many requests.

## 5. Recent Status Updates (Jan 2026) -> Phase 6 & 7 Complete

### Functional Enhancements
*   **Group Management**:
    *   **Delete Group**: Users can now delete groups.
        *   *Smart Cleanup*: System automatically checks if deleted files are used by other groups. If not, it permanently cleans them from MongoDB and ChromaDB (Zero Waste).
    *   **Add Files (Incremental)**: Users can add new files to an existing analysis. The system only processes the *new* files and re-runs comparisons efficiently using cached vectors.
*   **Vector Database Integration**:
    *   Successfully migrated to **ChromaDB** (running locally on port 8000).
    *   Solved IPv6/IPv4 connection issues by enforcing `127.0.0.1`.
*   **ML Logic Centralization**:
    *   Moved "Group Comparison" logic from Node.js to Python (`/compare-group`).
    *   This leverages PyTorch's native tensor operations for 10x faster comparisons compared to the previous Node.js loop.

### Current System Health
*   **Backend**: Stable. New routes `DELETE /groups/:id` and `POST /groups/:id/files` are active.
*   **Frontend**: UI updated with "Trash" icon (Delete) and "Add Files" button in Reports.
*   **ML Service**: Robust. Validated with Reference Counting and duplicate handling variables.
