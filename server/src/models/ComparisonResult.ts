import mongoose, { Document, Schema } from 'mongoose';

// Define Region Schema (Embedded)
const RegionSchema = new Schema({
    a_start: Number,
    a_end: Number,
    b_start: Number,
    b_end: Number,
    score: Number,
    text_a: String,
    text_b: String
}, { _id: false });

export interface IComparisonResult extends Document {
    scanGroupId: mongoose.Types.ObjectId;
    file1: string;
    file2: string;
    score: number;
    regions: any[];
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
    score: { type: Number, required: true },
    regions: [RegionSchema]
}, { timestamps: true });

export default mongoose.model<IComparisonResult>('ComparisonResult', ComparisonResultSchema);
