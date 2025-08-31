const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const logger = require('../Log/Logger');

function tokenize(str) {
    if (!str) return [];
    const m = String(str).toLowerCase().match(/[a-zа-яё0-9]+/g);
    return m || [];
}

const CONFIG = {
    PREFIX_MAX: 6,
    NGRAM: 3,
    BATCH_SIZE: 5000
};

class Indexing {

    params = {
        PREFIX_MAX: 6,
        NGRAM: 3,
        BATCH_SIZE: 5000
    }

    static async BuildIndexes(
        fullData,
        config = CONFIG,
        logging = true
    ) {

        const { PREFIX_MAX, NGRAM, BATCH_SIZE } = config;

        logger.Log('Building indexes with disk-based storage...', logging);

        const startTime = performance.now();
        const memoryBefore = process.memoryUsage();

        const tempDir = path.join(__dirname, 'temp_indexes');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        let processed = 0;

        while (processed < fullData.length) {
            const batch = fullData.slice(processed, processed + BATCH_SIZE);
            await this.processBatch(batch, tempDir, PREFIX_MAX, NGRAM, processed, logging);
            processed += batch.length;

            if (logging && processed % 50000 === 0) {
                const memory = process.memoryUsage();
                logger.Log(`Processed ${processed}/${fullData.length} items`, logging);
                logger.Log(`Memory usage: ${Math.round(memory.heapUsed / 1024 / 1024)}MB`, logging);

                if (global.gc) global.gc();
            }
        }

        const indexes = this.loadIndexesFromDisk(tempDir);

        try {
            const files = fs.readdirSync(tempDir);
            for (const file of files) {
                fs.unlinkSync(path.join(tempDir, file));
            }
            fs.rmdirSync(tempDir);
        } catch (e) {
            logger.Log('Could not clean up temp directory:', e.message, logging);
        }

        const endTime = performance.now();
        const memoryAfter = process.memoryUsage();

        logger.Log(`Indexing completed in ${(endTime - startTime).toFixed(2)}ms`, logging);
        logger.Log('Memory usage:');
        logger.Log(`Heap used: ${Math.round((memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024)} MB delta`, logging);
        logger.Log(`RSS: ${Math.round((memoryAfter.rss - memoryBefore.rss) / 1024 / 1024)} MB delta`, logging);
        logger.Log('Index sizes:', logging);
        logger.Log(`Tokens: ${indexes.searchIndex.size}`, logging);
        logger.Log(`Prefixes: ${indexes.prefixIndex.size}`, logging);
        logger.Log(`N-grams: ${indexes.ngramIndex.size}`, logging);

        return indexes;
    }

    static async processBatch(batch, tempDir, PREFIX_MAX, NGRAM, batchNumber, logging) {
        const batchSearchIndex = new Map();
        const batchPrefixIndex = new Map();
        const batchNgramIndex = new Map();

        for (const item of batch) {
            const text = `${item.name || ''} ${item.address || ''} ${item.description || ''} ${item.city || ''}`;
            const tokens = tokenize(text);

            for (const token of tokens) {
                if (!batchSearchIndex.has(token)) batchSearchIndex.set(token, new Set());
                batchSearchIndex.get(token).add(item.id);

                const maxLen = Math.min(token.length, PREFIX_MAX);
                for (let l = 1; l <= maxLen; l++) {
                    const pref = token.slice(0, l);
                    if (!batchPrefixIndex.has(pref)) batchPrefixIndex.set(pref, new Set());
                    batchPrefixIndex.get(pref).add(item.id);
                }

                if (token.length >= NGRAM) {
                    for (let i = 0; i <= token.length - NGRAM; i++) {
                        const gram = token.slice(i, i + NGRAM);
                        if (!batchNgramIndex.has(gram)) batchNgramIndex.set(gram, new Set());
                        batchNgramIndex.get(gram).add(item.id);
                    }
                } else {
                    if (!batchNgramIndex.has(token)) batchNgramIndex.set(token, new Set());
                    batchNgramIndex.get(token).add(item.id);
                }
            }
        }

        this.saveBatchToDisk(batchSearchIndex, path.join(tempDir, `search_${batchNumber}.json`));
        this.saveBatchToDisk(batchPrefixIndex, path.join(tempDir, `prefix_${batchNumber}.json`));
        this.saveBatchToDisk(batchNgramIndex, path.join(tempDir, `ngram_${batchNumber}.json`));
    }

    static saveBatchToDisk(batchIndex, filePath) {
        const serializable = [];
        for (const [key, valueSet] of batchIndex) {
            serializable.push([key, Array.from(valueSet)]);
        }

        fs.writeFileSync(filePath, JSON.stringify(serializable));
    }

    static loadIndexesFromDisk(tempDir) {
        const searchIndex = new Map();
        const prefixIndex = new Map();
        const ngramIndex = new Map();

        const files = fs.readdirSync(tempDir);

        const loadFiles = (filePattern, targetMap) => {
            const filesToLoad = files.filter(f => f.startsWith(filePattern));
            for (const file of filesToLoad) {
                const data = JSON.parse(fs.readFileSync(path.join(tempDir, file), 'utf8'));
                for (const [key, valueArray] of data) {
                    if (!targetMap.has(key)) targetMap.set(key, new Set());
                    const existingSet = targetMap.get(key);
                    for (const id of valueArray) {
                        existingSet.add(id);
                    }
                }
            }
        };

        loadFiles('search_', searchIndex);
        loadFiles('prefix_', prefixIndex);
        loadFiles('ngram_', ngramIndex);

        return { searchIndex, prefixIndex, ngramIndex };
    }
}

module.exports = Indexing;
module.exports.tokenize = tokenize;
module.exports.CONFIG = CONFIG;