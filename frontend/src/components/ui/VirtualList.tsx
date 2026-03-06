import React, { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

interface VirtualListProps<T> {
  items: T[]
  estimateSize: number
  renderItem: (item: T, index: number) => React.ReactNode
  overscan?: number
  className?: string
  containerClassName?: string
}

export default function VirtualList<T>({
  items,
  estimateSize,
  renderItem,
  overscan = 5,
  className = '',
  containerClassName = '',
}: VirtualListProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
  })

  if (items.length === 0) {
    return null
  }

  return (
    <div
      ref={parentRef}
      className={`overflow-auto ${className}`}
    >
      <div
        className={containerClassName}
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderItem(items[virtualItem.index], virtualItem.index)}
          </div>
        ))}
      </div>
    </div>
  )
}
