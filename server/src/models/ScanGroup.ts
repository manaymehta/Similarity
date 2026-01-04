import mongoose, { Document, Schema } from 'mongoose';

export interface IFile {
    filename: string;
    content: string;
}

export interface IScanGroup extends Document {
    status: 'pending' | 'processing' | 'completed' | 'failed';
    files: IFile[];
    createdAt: Date;
}

const FileSchema = new Schema<IFile>({
    filename: { type: String, required: true },
    content: { type: String, required: true },
}, { _id: false });

const ScanGroupSchema = new Schema<IScanGroup>({
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
    },
    files: [FileSchema],
}, { timestamps: true });

// Auto-delete data after 30 days
ScanGroupSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export default mongoose.model<IScanGroup>('ScanGroup', ScanGroupSchema);
