import { ChromaClient, type Collection, type EmbeddingFunction } from 'chromadb';

const client = new ChromaClient({
    path: "http://127.0.0.1:8000" // path is still supported but might warn. If strict:
    // host: "http://127.0.0.1", 
    // port: 8000 
    // But sticking to path for now as it works, the warning is benign. 
    // Actually, let's just silence it or ignore. 
    // Wait, I see the warning "The 'path' argument is deprecated".
    // Let's try the modern way.
});

// Custom Embedding Function that does nothing (since we provide embeddings manually)
class NoOpEmbeddingFunction implements EmbeddingFunction {
    public async generate(texts: string[]): Promise<number[][]> {
        throw new Error("NoOpEmbeddingFunction: Embeddings should be provided manually.");
    }
}

let collection: Collection | null = null;

export const getChromaCollection = async () => {
    if (collection) return collection;

    try {
        // Create or get collection with custom embedding function
        collection = await client.getOrCreateCollection({
            name: "similarity_chunks",
            metadata: { "description": "Document chunks for similarity detection" },
            embeddingFunction: new NoOpEmbeddingFunction()
        });
        console.log("Connected to ChromaDB 'similarity_chunks' collection");
        return collection;
    } catch (error) {
        console.error("Failed to connect to ChromaDB:", error);
        throw error;
    }
};

export default client;
