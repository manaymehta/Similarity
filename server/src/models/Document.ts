import mongoose from 'mongoose';

const documentSchema = new mongoose.Schema({
    hash: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    filename: {
        type: String,
        required: true
    },
    fullText: {
        type: String,
        required: true
    },
    chunkCount: {
        type: Number,
        default: 0
    },
    uploadDate: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model('Document', documentSchema);
