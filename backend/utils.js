function buildOrderIndex(order) {
    const idx = Object.create(null);
    for (let i = 0; i < order.length; i++) idx[order[i]] = i;
    return idx;
}

// пересечение множеств: принимает Set, возвращает Set
function intersectSets(sets) {
    if (!sets || sets.length === 0) return new Set();
    sets.sort((a, b) => a.size - b.size);
    const smallest = sets[0];
    const rest = sets.slice(1);
    const res = new Set();
    for (const v of smallest) {
        let keep = true;
        for (const s of rest) {
            if (!s.has(v)) {
                keep = false;
                break;
            }
        }
        if (keep) res.add(v);
    }
    return res;
}

module.exports = { buildOrderIndex, intersectSets };