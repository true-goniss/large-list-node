import React, { useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';

const VirtualizedList = ({
  items,
  selected,
  hasMore,
  loading,
  onLoadMore,
  onReorder,
  onSelect
}) => {
  const Row = useCallback(({ index, style }) => {
    const item = items[index];
    if (!item) return null;

    const isSelected = selected.has(item.id);

    return (
      <div
        style={style}
        className="list-item"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', item.id);
        }}
        onDragOver={(e) => {
          e.preventDefault(); // для разрешения дропа
        }}
        onDrop={(e) => {
          e.preventDefault();
          const sourceId = e.dataTransfer.getData('text/plain');
          if (sourceId !== item.id) {
            onReorder(sourceId, item.id);
          }
        }}
      >
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onSelect(item.id, e.target.checked)}
        />
        <span>Item {item.id}</span>
        <span>{item.name}</span>
      </div>
    );
  }, [items, selected, onReorder, onSelect]);

  // Обработчик бесконечной загрузки
  const handleScroll = useCallback(({ scrollOffset, scrollUpdateWasRequested }) => {
    if (!scrollUpdateWasRequested && hasMore && !loading) {
      const listHeight = 400;
      const rowHeight = 50;
      const visibleRows = Math.ceil(listHeight / rowHeight);
      const triggerPoint = items.length - visibleRows * 2;

      if (scrollOffset >= triggerPoint * rowHeight) {
        onLoadMore();
      }
    }
  }, [hasMore, loading, items.length, onLoadMore]);

  return (
    <div>
      <List
        height={400}
        itemCount={items.length + (hasMore ? 1 : 0)}
        itemSize={50}
        onScroll={handleScroll}
      >
        {Row}
      </List>
    </div>
  );
};

export default VirtualizedList;