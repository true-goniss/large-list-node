const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const { Logger } = require('../Logger/Logger');

function tokenize(str) {
    if (!str) return [];
    const m = String(str).toLowerCase().match(/[a-zа-яё0-9]+/g);
    return m || [];
}

class Indexing {

    static logger = new Logger();

    static async BuildIndexes(fullData, PREFIX_MAX = 6, NGRAM = 3, BATCH_SIZE = 5000, logging = true) {

        this.logger.Log('Building indexes with disk-based storage...', logging);

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
                this.logger.Log(`Processed ${processed}/${fullData.length} items`);
                this.logger.Log(`Memory usage: ${Math.round(memory.heapUsed / 1024 / 1024)}MB`);

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
            this.logger.Log('Could not clean up temp directory:', e.message, logging);
        }

        const endTime = performance.now();
        const memoryAfter = process.memoryUsage();

        this.logger.Log(`Indexing completed in ${(endTime - startTime).toFixed(2)}ms`, logging);
        this.logger.Log('Memory usage:');
        this.logger.Log(`  Heap used: ${Math.round((memoryAfter.heapUsed - memoryBefore.heapUsed) / 1024 / 1024)} MB delta`, logging);
        this.logger.Log(`  RSS: ${Math.round((memoryAfter.rss - memoryBefore.rss) / 1024 / 1024)} MB delta`, logging);
        this.logger.Log('Index sizes:', logging);
        this.logger.Log(`  Tokens: ${indexes.searchIndex.size}`, logging);
        this.logger.Log(`  Prefixes: ${indexes.prefixIndex.size}`, logging);
        this.logger.Log(`  N-grams: ${indexes.ngramIndex.size}`, logging);
        

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

    static searchIdsForQuery(query, indexes, NGRAM = 3) {
        if (!query || query.trim() === '') return null;
        if (!indexes) return new Set();

        const { searchIndex, prefixIndex, ngramIndex } = indexes;
        const tokens = tokenize(query);

        if (tokens.length === 0) return new Set();

        const sets = [];

        for (let i = 0; i < tokens.length; i++) {
            const t = tokens[i];
            const candidates = [];

            if (searchIndex.has(t)) {
                candidates.push(searchIndex.get(t));
            }

            if (i === tokens.length - 1) {
                for (let l = Math.min(t.length, 3); l <= Math.min(t.length, 6); l++) {
                    const pref = t.slice(0, l);
                    if (prefixIndex.has(pref)) {
                        candidates.push(prefixIndex.get(pref));
                    }
                }
            }

            if (t.length < NGRAM && ngramIndex.has(t)) {
                candidates.push(ngramIndex.get(t));
            }

            if (candidates.length === 0) {
                return new Set();
            }

            const union = new Set();
            for (const s of candidates) {
                for (const id of s) union.add(id);
            }
            sets.push(union);
        }

        if (sets.length === 0) return new Set();

        sets.sort((a, b) => a.size - b.size);
        const smallest = sets[0];
        const rest = sets.slice(1);
        const result = new Set();

        for (const id of smallest) {
            let found = true;
            for (const s of rest) {
                if (!s.has(id)) {
                    found = false;
                    break;
                }
            }
            if (found) result.add(id);
        }

        return result;
    }

    static calculateRelevance(item, query) {
        if (!item) return 0;

        let relevance = 0;
        const queryTokens = tokenize(query.toLowerCase());

        const name = item.name || '';
        const address = item.address || '';
        const description = item.description || '';
        const city = item.city || '';

        const nameTokens = tokenize(name.toLowerCase());
        const addressTokens = tokenize(address.toLowerCase());
        const descriptionTokens = tokenize(description.toLowerCase());
        const cityTokens = tokenize(city.toLowerCase());

        const allTextTokens = [...nameTokens, ...addressTokens, ...descriptionTokens, ...cityTokens];

        // Полное совпадение
        const exactPhrase = query.toLowerCase();
        if (name.toLowerCase().includes(exactPhrase)) relevance += 100;
        if (address.toLowerCase().includes(exactPhrase)) relevance += 50;
        if (description.toLowerCase().includes(exactPhrase)) relevance += 30;
        if (city.toLowerCase().includes(exactPhrase)) relevance += 40;

        // Порядок слов
        let orderMatch = 0;
        let exactWordMatches = 0;

        for (let i = 0; i < queryTokens.length; i++) {
            const queryToken = queryTokens[i];

            if (i < nameTokens.length && nameTokens[i] === queryToken) {
                orderMatch += 10 - i;
            }

            // Полное совпадение
            if (nameTokens.includes(queryToken)) exactWordMatches += 5;
            if (addressTokens.includes(queryToken)) exactWordMatches += 3;
            if (descriptionTokens.includes(queryToken)) exactWordMatches += 2;
            if (cityTokens.includes(queryToken)) exactWordMatches += 3;
        }

        relevance += orderMatch + exactWordMatches;

        // Защита от доп слов
        if (queryTokens.length > 1) {
            const extraWordsPenalty = Math.max(0, allTextTokens.length - queryTokens.length) * 0.5;
            relevance -= extraWordsPenalty;
        }

        // Бонус за совпадение всех токенов
        const allTokensMatch = queryTokens.every(token =>
            allTextTokens.includes(token)
        );
        if (allTokensMatch) relevance += 20;

        return Math.max(0, relevance);
    }
}

function searchItems(query, session, fullData, indexes) {
    const defaultOrder = Array.from({ length: fullData.length }, (_, i) => i);

    if (!query || !query.trim()) {
        return {
            ids: Array.isArray(session?.order) ? session.order : defaultOrder,
            totalFound: Array.isArray(session?.order) ? session.order.length : defaultOrder.length
        };
    }

    try {
        const resultSet = Indexing.searchIdsForQuery(query, indexes);

        if (resultSet === null) {
            return {
                ids: Array.isArray(session?.order) ? session.order : defaultOrder,
                totalFound: Array.isArray(session?.order) ? session.order.length : defaultOrder.length
            };
        }

        console.log(`Поиск: "${query}", найдено результатов: ${resultSet.size}`);

        const limitedResults = Array.from(resultSet).slice(0, 1000);
        const totalFound = resultSet.size;
        if (limitedResults.length > 0) {
            const relevanceMap = new Map();

            for (const id of limitedResults) {
                const item = fullData.find(x => x.id === id);
                if (!item) continue;

                const relevance = Indexing.calculateRelevance(item, query);
                relevanceMap.set(id, relevance);
            }

            limitedResults.sort((a, b) => {
                const relA = relevanceMap.get(a) || 0;
                const relB = relevanceMap.get(b) || 0;
                return relB - relA;
            });

            return {
                ids: limitedResults,
                totalFound: totalFound
            };
        }

        return { ids: [], totalFound: 0 };
    } catch (error) {
        console.error('Ошибка поиска:', error);
        return { ids: [], totalFound: 0 };
    }
}

module.exports = Indexing;
module.exports.tokenize = tokenize;
module.exports.searchItems = searchItems;