const express = require('express');
const session = require('express-session');
const bodyParser = require('body-parser');
const cors = require('cors');
const { buildOrderIndex, intersectSets } = require('./utils');
const { tokenize } = require('./Indexing/Indexing');
const DataGenerator = require('./Data/DataGenerator');
const Indexing = require('./Indexing/Indexing');

const TOTAL_ITEMS = 1000000;
const PAGE_SIZE = 20;

const app = express();

app.use(cors({
    origin: true,
    credentials: true
}));
app.use(bodyParser.json());
app.use(session({
    secret: "supersecret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 1000 * 60 * 60 }
}));

function initSession(session) {
    if (!session.initialized) {
        session.order = Array.from({ length: TOTAL_ITEMS }, (_, i) => i + 1);
        session.selected = [];
        session.initialized = true;
        console.log('Session initialized');
    }
}

let fullData = null;
let indexes = null;

const start = async () => {
    fullData = DataGenerator.Generate(TOTAL_ITEMS);
    indexes = await Indexing.BuildIndexes(fullData);
}
start();

app.get('/api/items', (req, res) => {
    initSession(req.session);

    const search = req.query.search || '';
    const offset = parseInt(req.query.offset) || 0;
    const limit = Math.min(parseInt(req.query.limit) || PAGE_SIZE, 100);

    const searchResult = Indexing.searchItems(search, req.session, fullData, indexes);
    let itemIds = searchResult.ids || [];
    const totalFound = searchResult.totalFound || 0;

    if (!Array.isArray(itemIds)) {
        itemIds = [];
    }

    if (itemIds.length === 0 && search) {
        return res.json({ items: [], hasMore: false, totalFound: 0 });
    }

    if (itemIds.length === 0) {
        itemIds = req.session.order;
    }

    const items = itemIds.slice(offset, offset + limit).map(id => fullData[id - 1]);
    const hasMore = offset + items.length < itemIds.length;

    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.json({ items, hasMore, totalFound });
});

app.post('/api/selection', (req, res) => {
    initSession(req.session);

    const { ids, selected } = req.body;
    if (!ids || !Array.isArray(ids)) {
        return res.status(400).json({ error: 'Invalid ids' });
    }

    const numericIds = ids.map(id => parseInt(id));

    if (selected) {
        numericIds.forEach(id => {
            if (!req.session.selected.includes(id)) {
                req.session.selected.push(id);
            }
        });
    } else {

        req.session.selected = req.session.selected.filter(id => !numericIds.includes(id));
    }

    res.json({ success: true });
});

app.post('/api/reorder', (req, res) => {
    initSession(req.session);

    const { sourceId, destinationId } = req.body;
    const sourceIndex = req.session.order.indexOf(parseInt(sourceId));
    const destinationIndex = req.session.order.indexOf(parseInt(destinationId));

    if (sourceIndex === -1 || destinationIndex === -1) {
        return res.status(400).json({ error: 'Invalid item IDs' });
    }

    const [movedItem] = req.session.order.splice(sourceIndex, 1);
    req.session.order.splice(destinationIndex, 0, movedItem);

    res.json({ success: true });
});

app.get('/api/state', (req, res) => {
    initSession(req.session);

    const firstPageIds = req.session.order.slice(0, PAGE_SIZE);
    const orderFirstPage = firstPageIds.map(id => fullData[id - 1]);

    res.json({
        orderFirstPage,
        selected: req.session.selected
    });
});

app.post('/api/regenerate', (req, res) => {
    const count = req.body.count || TOTAL_ITEMS;

    const newData = generateData(count);

    const newIndexes = buildIndexes(newData);

    fullData.splice(0, fullData.length, ...newData);
    Object.assign(indexes, newIndexes);

    res.json({ success: true, count });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});