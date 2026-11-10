'use client';

export interface FilterTab {
  id: string;
  label: string;
  count: number;
}

interface ProductFiltersProps {
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  /** Tabs are built from the live series table; 'all' is added here. */
  tabs: FilterTab[];
  total: number;
}

export function ProductFilters({
  activeCategory,
  onCategoryChange,
  searchQuery,
  onSearchChange,
  tabs,
  total,
}: ProductFiltersProps) {
  const categories: FilterTab[] = [
    { id: 'all', label: 'All', count: total },
    ...tabs.filter(t => t.count > 0), // Only show tabs with products
  ];

  return (
    <div className="product-filters">
      <div className="filter-tabs">
        {categories.map(cat => (
          <button
            key={cat.id}
            className={`filter-tab ${activeCategory === cat.id ? 'active' : ''}`}
            onClick={() => onCategoryChange(cat.id)}
          >
            <span className="filter-label">{cat.label}</span>
            <span className="filter-count">{cat.count}</span>
          </button>
        ))}
      </div>

      <div className="filter-search">
        <SearchIcon />
        <input
          type="text"
          className="search-input"
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button className="search-clear" onClick={() => onSearchChange('')}>
            <CloseIcon />
          </button>
        )}
      </div>

      <style jsx>{`
        .product-filters {
          display: flex;
          flex-direction: column;
          gap: 16px;
          margin-bottom: 24px;
        }

        @media (min-width: 768px) {
          .product-filters {
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
          }
        }

        .filter-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .filter-tab {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          background: var(--color-white-pure);
          border: 1px solid var(--color-white-border);
          border-radius: 4px;
          cursor: pointer;
          transition: all 200ms ease;
        }

        .filter-tab:hover {
          border-color: var(--color-gold);
        }

        .filter-tab.active {
          background: var(--color-gold);
          border-color: var(--color-gold);
          color: var(--color-white-pure);
        }

        .filter-label {
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .filter-count {
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 24px;
          height: 24px;
          padding: 0 6px;
          background: var(--color-white-grey);
          border-radius: 12px;
          font-family: var(--font-mono);
          font-size: 11px;
          font-weight: 600;
        }

        .filter-tab.active .filter-count {
          background: rgba(255, 255, 255, 0.2);
          color: var(--color-white-pure);
        }

        .filter-search {
          position: relative;
          display: flex;
          align-items: center;
        }

        .filter-search svg {
          position: absolute;
          left: 12px;
          width: 16px;
          height: 16px;
          color: var(--color-ink-soft);
          pointer-events: none;
        }

        .search-input {
          width: 100%;
          min-width: 200px;
          padding: 10px 36px 10px 38px;
          font-family: var(--font-mono);
          font-size: 13px;
          color: var(--color-ink);
          background: var(--color-white-pure);
          border: 1px solid var(--color-white-border);
          border-radius: 4px;
          transition: border-color 200ms ease;
        }

        .search-input:hover {
          border-color: var(--color-gold);
        }

        .search-input:focus {
          outline: none;
          border-color: var(--color-gold);
          box-shadow: 0 0 0 3px var(--color-gold-ghost);
        }

        .search-clear {
          position: absolute;
          right: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--color-ink-soft);
        }

        .search-clear:hover {
          color: var(--color-ink);
        }

        .search-clear svg {
          position: static;
          width: 14px;
          height: 14px;
        }
      `}</style>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="6.5" cy="6.5" r="4" />
      <path d="M10 10l3.5 3.5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M2 2l10 10M12 2L2 12" />
    </svg>
  );
}