const Indexing = require('./Indexing');

const logger = require('../Log/Logger');

tokenize = Indexing.tokenize;
NGRAM = Indexing.CONFIG.NGRAM;

class Searcher {

    static Search(textQuery, order, fullData, indexes) {

        const defaultOrder = Array.from({ length: fullData.length }, (_, i) => i);

        if (!textQuery || !textQuery.trim()) {
            return {
                ids: Array.isArray(order) ? order : defaultOrder,
                totalFound: Array.isArray(order) ? order.length : defaultOrder.length
            };
        }

        try {

            const trimmedQuery = textQuery.trim();

            // поиск по ID (только цифры)
            if (/^\d+$/.test(trimmedQuery)) {
                const searchId = parseInt(trimmedQuery);

                if (searchId >= 1 && searchId <= fullData.length) {
                    return {
                        ids: [searchId],
                        totalFound: 1
                    };
                } else {
                    return { ids: [], totalFound: 0 };
                }
            }

            const resultSet = this._SearchIdsForQuery(textQuery, indexes, NGRAM);

            if (resultSet === null) {
                return {
                    ids: Array.isArray(order) ? order : defaultOrder,
                    totalFound: Array.isArray(order) ? order.length : defaultOrder.length
                };
            }

            logger.Log(`Поиск: "${textQuery}", найдено результатов: ${resultSet.size}`);

            const limitedResults = Array.from(resultSet).slice(0, 1000);
            const totalFound = resultSet.size;
            if (limitedResults.length > 0) {
                const relevanceMap = new Map();

                for (const id of limitedResults) {
                    const item = fullData.find(x => x.id === id);
                    if (!item) continue;

                    const relevance = this._CalculateRelevance(item, textQuery);
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
            logger.Log('Ошибка поиска:', error);
            return { ids: [], totalFound: 0 };
        }
    }

    static _CalculateRelevance(item, query) {
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

    static _SearchIdsForQuery(query, indexes, NGRAM) {
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
}

module.exports = Searcher;