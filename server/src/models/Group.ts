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
        // We might validly duplicate content here slightly or just fetch from Document?
        // For efficiency in displaying lists, let's just keep filename/hash here.
        // Full content is in the 'Document' collection.
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
