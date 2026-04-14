export const PAIR_CACHE_TTL = 7 * 24 * 3600;

// same redis key for a file pair regardless of argument order
export function pairCacheKey(hashA: string, hashB: string): string {
    return `pair:${[hashA, hashB].sort().join(':')}`;
}

// Generates all unique N*(N-1)/2 pairs from an array of hashes.
export function generateAllPairs(hashes: string[]): Array<[string, string]> {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < hashes.length; i++) {
        for (let j = i + 1; j < hashes.length; j++) {
            pairs.push([hashes[i]!, hashes[j]!]);
        }
    }
    return pairs;
}
