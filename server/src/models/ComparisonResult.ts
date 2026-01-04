import mongoose, { Document, Schema } from 'mongoose';

export interface IComparisonResult extends Document {
    scanGroupId: mongoose.Types.ObjectId;
    file1: string;
    file2: string;
    similarityScore: number;
}

const ComparisonResultSchema = new Schema<IComparisonResult>({
    scanGroupId: {
        type: Schema.Types.ObjectId,
        ref: 'ScanGroup',
        required: true,
        index: true
    },
    file1: { type: String, required: true },
    file2: { type: String, required: true },
    similarityScore: { type: Number, required: true },
}, { timestamps: true });

export default mongoose.model<IComparisonResult>('ComparisonResult', ComparisonResultSchema);
