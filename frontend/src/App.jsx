import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import './App.css';

function App() {
    const isProduction = process.env.NODE_ENV === 'production';
    const API_BASE = isProduction ? process.env.REACT_APP_BACKEND_API_URL
        : 'http://localhost:3001/api';

    const [items, setItems] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [search, setSearch] = useState('');
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loading, setLoading] = useState(false);
    const [totalFound, setTotalFound] = useState(0);

    const pendingSelections = useRef(new Map());
    const debounceTimeout = useRef(null);

    const flushSelections = useCallback(async () => {
        if (pendingSelections.current.size === 0) return;

        const selections = new Map(pendingSelections.current);
        pendingSelections.current.clear();

        const selectedIds = [];
        const deselectedIds = [];

        selections.forEach((isSelected, idStr) => {
            const idNum = Number(idStr);
            if (isSelected) {
                selectedIds.push(idNum);
            } else {
                deselectedIds.push(idNum);
            }
        });

        try {
            if (selectedIds.length > 0) {
                await fetch(`${API_BASE}/selection`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ ids: selectedIds, selected: true })
                });
            }

            if (deselectedIds.length > 0) {
                await fetch(`${API_BASE}/selection`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ ids: deselectedIds, selected: false })
                });
            }
        } catch (error) {
            selections.forEach((isSelected, id) => {
                pendingSelections.current.set(id, isSelected);
            });
            console.error('Failed to update selection:', error);
        }
    }, [API_BASE]);

    const handleSelect = useCallback((id, isSelected) => {
        const idStr = String(id);

        setSelected(prev => {
            const newSet = new Set(prev);
            if (isSelected) {
                newSet.add(idStr);
            } else {
                newSet.delete(idStr);
            }
            return newSet;
        });

        pendingSelections.current.set(idStr, isSelected);

        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }
        debounceTimeout.current = setTimeout(flushSelections, 1000);
    }, [flushSelections]);

    useEffect(() => {
        return () => {
            if (debounceTimeout.current) {
                clearTimeout(debounceTimeout.current);
            }
        };
    }, []);

    const loadItems = useCallback(async (reset = false) => {
        if (loading) return;

        setLoading(true);
        const currentOffset = reset ? 0 : offset;

        try {
            const url = `${API_BASE}/items?search=${encodeURIComponent(search)}&offset=${currentOffset}&limit=20`;
            const response = await fetch(url);
            const result = await response.json();

            setTotalFound(result.totalFound || 0);

            const normalized = (result.items || []).map(it => ({ ...it, id: String(it.id) }));

            if (reset) {
                const storedOrder = localStorage.getItem('itemsOrder');
                if (storedOrder) {
                    const orderedItemIds = JSON.parse(storedOrder);
                    const orderedItems = normalized.sort((a, b) => orderedItemIds.indexOf(a.id) - orderedItemIds.indexOf(b.id));
                    setItems(orderedItems);
                } else {
                    setItems(normalized);
                }
            } else {
                setItems(prev => [...prev, ...normalized]);
            }

            setOffset(currentOffset + (result.items?.length || 0));
            setHasMore(result.hasMore);
        } catch (error) {
            console.error('Failed to load items:', error);
        } finally {
            setLoading(false);
        }
    }, [search, offset, loading, API_BASE]);

    useEffect(() => {
        const restoreState = async () => {
            try {
                const response = await fetch(`${API_BASE}/state`, {
                    credentials: 'include'
                });

                const state = await response.json();
                if (state.orderFirstPage) {
                    const normalized = state.orderFirstPage.map(it => ({ ...it, id: String(it.id) }));
                    setItems(normalized);
                }
                if (state.selected) {
                    setSelected(new Set(state.selected.map(id => String(id))));
                }
            } catch (error) {
                console.error('Failed to restore state:', error);
            }
        };

        restoreState();
    }, [API_BASE]);

    useEffect(() => {
        localStorage.removeItem('scrollPosition');
    }, [search]);

    const divRef = useRef(null);
    useEffect(() => {
        const timer = setTimeout(() => {
            if (divRef.current) {
                const storedScrollPosition = localStorage.getItem('scrollPosition');
                if (storedScrollPosition) {
                    divRef.current.scrollTop = Number(storedScrollPosition);
                }
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [items]);

    const handleScroll = useCallback((e) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight * 1.5 && hasMore && !loading) {
            loadItems();
        }

        localStorage.setItem('scrollPosition', String(scrollTop));
    }, [hasMore, loading, loadItems]);

    const handleDragEnd = async (result) => {
        if (!result.destination) return;

        const newItems = Array.from(items);
        const [moved] = newItems.splice(result.source.index, 1);
        newItems.splice(result.destination.index, 0, moved);
        setItems(newItems);

        try {
            const response = await fetch(`${API_BASE}/reorder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    sourceId: Number(items[result.source.index].id),
                    destinationId: Number(items[result.destination.index].id)
                })
            });

            if (!response.ok) {
                setOffset(0);
                loadItems(true);
            } else {
                localStorage.setItem('itemsOrder', JSON.stringify(newItems.map(item => item.id)));
            }
        } catch (error) {
            console.error('Failed to reorder items:', error);
            setOffset(0);
            loadItems(true);
        }
    };

    return (
        <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <h1>Список: 1 - 1.000.000</h1>

            <input
                type="text"
                placeholder="Поиск..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        setOffset(0);
                        loadItems(true);
                    }
                }}
                className="search-bar"
            />

            <div
                ref={divRef}
                onScroll={handleScroll}
                style={{ height: '500px', overflow: 'auto', border: '1px solid #ddd', borderRadius: '8px' }}
            >
                <DragDropContext onDragEnd={handleDragEnd}>
                    <Droppable droppableId="items">
                        {(provided) => (
                            <div {...provided.droppableProps} ref={provided.innerRef}>
                                {loading && items.length === 0 && (
                                    <div className="loading">Загрузка...</div>
                                )}

                                {!loading && items.length === 0 && (
                                    <div style={{ padding: '20px', textAlign: 'center' }}>
                                        Нет данных
                                    </div>
                                )}

                                {items.map((item, index) => (
                                    <Draggable key={item.id} draggableId={String(item.id)} index={index}>
                                        {(provided, snapshot) => (
                                            <div
                                                ref={provided.innerRef}
                                                {...provided.draggableProps}
                                                {...provided.dragHandleProps}
                                                className={`list-item ${snapshot.isDragging ? 'dragging' : ''}`}
                                                style={{
                                                    ...provided.draggableProps.style,
                                                    backgroundColor: selected.has(String(item.id)) ? '#e3f2fd' : 'white'
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selected.has(String(item.id))}
                                                    onChange={(e) => handleSelect(item.id, e.target.checked)}
                                                />
                                                <div style={{ marginLeft: '10px', flex: 1 }}>
                                                    <div style={{ fontWeight: 'bold' }}>
                                                        {item.name} (ID: {item.id})
                                                    </div>
                                                    <div style={{ color: '#666', fontSize: '0.9em' }}>
                                                        {item.description}
                                                    </div>
                                                    <div style={{ color: '#666', fontSize: '0.9em' }}>
                                                        Адрес: {item.address}
                                                    </div>
                                                    <div style={{ color: '#666', fontSize: '0.9em' }}>
                                                        Пол: {item.isMale ? 'Мужской' : 'Женский'}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </Draggable>
                                ))}
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>

                {loading && items.length > 0 && <div className="loading">Загрузка...</div>}
                {!hasMore && items.length > 0 && <div className="loading">Все элементы загружены.</div>}
            </div>

            <div style={{ marginTop: '20px', color: '#666' }}>
                <p>Загружено: {items.length} </p>
                <p>Выбрано: {selected.size} </p>
                {search && <p>Найдено всего: {totalFound} </p>}
            </div>
        </div>
    );
}

export default App;