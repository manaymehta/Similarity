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
    *   **Functionality**: Users verify file requirements and upload documents.
    *   **Components**:
        *   [FileDropZone](file:///d:/MANAY/MANAY/Code/Projects/Similarity/client/src/components/upload/FileDropZone.tsx#10-78): Handles drag-and-drop interactions.
        *   [UploadList](file:///d:/MANAY/MANAY/Code/Projects/Similarity/client/src/components/upload/FileDropZone.tsx#84-115): Displays selected files before upload.
    *   **Action**: Clicking "Start Analysis" triggers the upload.
    *   **Transition**: On success, redirects to `/report/:scanId`.

2.  **Report Page (`/report/:scanId`)**:
    *   **Functionality**: Polls for analysis status, then displays results.
    *   **States**:
        *   *Loading/Processing*: Shows a spinner while polling `/api/scan/:scanId/status`.
        *   *Error*: Shows if scan fails.
        *   *Success*: Displays summary stats and visualizations.
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
| [uploadFiles](file:///d:/MANAY/MANAY/Code/Projects/Similarity/client/src/services/api.ts#38-54) | `POST` | `/scan/upload` | `scanController.uploadFiles` | Uploads files, creates [ScanGroup](file:///d:/MANAY/MANAY/Code/Projects/Similarity/client/src/services/api.ts#4-10) in MongoDB, and triggers background ML processing. |
| [getScanStatus](file:///d:/MANAY/MANAY/Code/Projects/Similarity/server/src/controllers/scanController.ts#94-115) | `GET` | `/scan/:scanId/status` | `scanController.getScanStatus` | Fetches current processing status (`pending`, `processing`, `completed`) and file metadata. |
| [getScanResults](file:///d:/MANAY/MANAY/Code/Projects/Similarity/client/src/services/api.ts#63-70) | `GET` | `/scan/:scanId/results` | `scanController.getScanResults` | Fetches detailed comparison results (scores + highlighted text regions) from [ComparisonResult](file:///d:/MANAY/MANAY/Code/Projects/Similarity/client/src/services/api.ts#21-27) collection. |

### Data Flow
1.  **Upload**: Frontend sends `FormData` -> Backend (Multer) saves content -> Backend creates [ScanGroup](file:///d:/MANAY/MANAY/Code/Projects/Similarity/client/src/services/api.ts#4-10) -> Backend calls ML Service.
2.  **Processing**: ML Service (`/batch-compare`) computes embeddings & comparisons -> Returns JSON with scores & regions -> Backend saves to `ComparisonResults` collection.
3.  **Viewing**: Frontend polls Status -> When `completed`, fetches Results -> Renders Heatmap -> User clicks cell -> Frontend renders Side-by-Side view using cached file content and result regions.

## 3. Backend Implementation Details

### Server ([server/src/](file:///d:/MANAY/MANAY/Code/Projects/Similarity/server/src))
*   **Routes ([scanRoutes.ts](file:///d:/MANAY/MANAY/Code/Projects/Similarity/server/src/routes/scanRoutes.ts))**: Registers the endpoints listed above.
*   **Controllers ([scanController.ts](file:///d:/MANAY/MANAY/Code/Projects/Similarity/server/src/controllers/scanController.ts))**:
    *   [uploadFiles](file:///d:/MANAY/MANAY/Code/Projects/Similarity/client/src/services/api.ts#38-54): Handling file storage and initiating [processScanGroup](file:///d:/MANAY/MANAY/Code/Projects/Similarity/server/src/controllers/scanController.ts#6-58).
    *   [processScanGroup](file:///d:/MANAY/MANAY/Code/Projects/Similarity/server/src/controllers/scanController.ts#6-58): **Critical logic**. Fetches files, sends to ML service, and bulk-inserts results into MongoDB. *Recently updated to correctly map `score` and [regions](file:///d:/MANAY/MANAY/Code/Projects/Similarity/ml-service/src/utils.py#47-77).*
    *   [getScanResults](file:///d:/MANAY/MANAY/Code/Projects/Similarity/client/src/services/api.ts#63-70): Retrieves comparison data.
*   **Models (`models/`)**:
    *   [ScanGroup](file:///d:/MANAY/MANAY/Code/Projects/Similarity/client/src/services/api.ts#4-10): Stores processing status and raw file content.
    *   [ComparisonResult](file:///d:/MANAY/MANAY/Code/Projects/Similarity/client/src/services/api.ts#21-27): Stores the `score` and [regions](file:///d:/MANAY/MANAY/Code/Projects/Similarity/ml-service/src/utils.py#47-77) array (array of `{a_start, a_end, score, text_a, text_b}`).

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
