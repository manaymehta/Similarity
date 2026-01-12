import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema({
    name: {
        type: String,
        default: 'Untitled Group'
    },
    files: [{
        hash: {
            type: String,
            required: true
        },
        filename: {
            type: String,
            required: true
        },
    }],
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

export default mongoose.model('Group', groupSchema);
