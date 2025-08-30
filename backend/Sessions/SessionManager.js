const { buildOrderIndex, intersectSets } = require('../utils');
const { searchIndex, prefixIndex, tokenize } = require('../Indexing/Indexing');

class SessionManager {

    constructor(searchIndex, prefixIndex) {
        this.searchIndex = searchIndex;
        this.prefixIndex = prefixIndex;
    }

    initializeSession(session, totalItems) {
        if (!session.initialized) {
            session.order = Array.from({ length: totalItems }, (_, i) => i + 1);
            session.orderIndex = buildOrderIndex(session.order);
            session.selected = [];
            session.viewState = { search: '', sortBy: null, sortDir: 'asc' };
            session.searchCache = Object.create(null);
            session.searchOrders = Object.create(null);
            session.initialized = true;
        }
    }

    // Построить массив совпадающих id по порядку: если есть searchOrders[search], используем её,
    // иначе сортировка ids по session.orderIndex
    buildMatchingArray(session, searchStr) {
        const key = String(searchStr || '').trim();
        if (!key) return [];

        if (session.searchCache[key]) return session.searchCache[key].slice(); // вернуть копию

        const tokens = tokenize(key);
        if (tokens.length === 0) {
            session.searchCache[key] = [];
            return [];
        }

        // множества для токенов
        const sets = [];
        for (const t of tokens) {
            // точный токен и префиксный
            const sExact = this.searchIndex.get(t);
            const sPref = this.prefixIndex.get(t);
            if (sExact && sPref) {
                // объединяем их
                sets.push(sExact);
            } else if (sExact) {
                sets.push(sExact);
            } else if (sPref) {
                sets.push(sPref);
            } else {
                // нет токенов
                session.searchCache[key] = [];
                return [];
            }
        }

        // Пересечение всех множеств
        const matchedSet = intersectSets(sets);
        if (matchedSet.size === 0) {
            session.searchCache[key] = [];
            return [];
        }

        // Если есть локальный порядок для этого поиска - используем его (должен содержать все id)
        if (Array.isArray(session.searchOrders[key]) && session.searchOrders[key].length > 0) {
            // Если локальный порядок хранит только часть - фильтруем по matchedSet
            const arr = session.searchOrders[key].filter(id => matchedSet.has(id));
            // добавим оставшиеся ids (если некоторые отсутствуют в локальном порядке) - в конце, упорядочим по orderIndex
            if (arr.length < matchedSet.size) {
                const missing = [];
                for (const id of matchedSet) {
                    if (!session.searchOrders[key].includes(id)) missing.push(id);
                }
                missing.sort((a, b) => (session.orderIndex[a] - session.orderIndex[b]));
                arr.push(...missing);
            }
            session.searchCache[key] = arr.slice();
            return arr.slice();
        }

        // Иначе сортируем id по orderIndex (для k matched)
        const ids = Array.from(matchedSet);
        ids.sort((a, b) => {
            const ia = session.orderIndex[a] ?? Number.MAX_SAFE_INTEGER;
            const ib = session.orderIndex[b] ?? Number.MAX_SAFE_INTEGER;
            return ia - ib;
        });

        session.searchCache[key] = ids.slice();
        return ids.slice();
    }

    updateOrder(session, newOrder) {
        session.order = newOrder;
        session.orderIndex = buildOrderIndex(newOrder);
        session.searchCache = Object.create(null);
    }

    updateSelection(session, ids, shouldSelect) {
        // копия массива для реактивности сессии
        const newSelected = [...session.selected];

        if (shouldSelect) {
            // Добавляем если еще нет в массиве
            ids.forEach(id => {
                if (!newSelected.includes(id)) {
                    newSelected.push(id);
                }
            });
        } else {
            // удалить id
            for (let i = newSelected.length - 1; i >= 0; i--) {
                if (ids.includes(newSelected[i])) {
                    newSelected.splice(i, 1);
                }
            }
        }
        session.selected = newSelected;
    }

    updateViewState(session, newState) {
        session.viewState = { ...session.viewState, ...newState };
    }

    updateSearchOrder(session, search, order) {
        session.searchOrders[search] = order;
        session.searchCache[search] = order;
    }
}

module.exports = SessionManager;