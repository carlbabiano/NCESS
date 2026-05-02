import './adminfilterbar.css';

/**
 * AdminFilterBar
 *
 * Props:
 *  groups           — array of { label, value, onChange, options: [string | {value, label, count}] }
 *                     Each group renders as inline tab pills.
 *  search           — controlled search string
 *  onSearch         — (value: string) => void
 *  searchPlaceholder
 *  actions          — ReactNode rendered on the right
 *  compact          — strips the card border/bg
 *  className
 *
 * Note: `count` and `selects` props are intentionally removed.
 * Status filtering is now done via inline tab groups passed through `groups`.
 */
export function AdminFilterBar({
  groups = [],
  search,
  onSearch,
  searchPlaceholder = 'Search...',
  actions,
  compact = false,
  className = '',
}) {
  return (
    <div className="admin-filterbar-wrapper">
      <div
        className={[
          'admin-filterbar',
          compact ? 'admin-filterbar--compact' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {/* Search */}
        {onSearch !== undefined && (
          <div className="admin-filterbar__search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={search ?? ''}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label="Search"
            />
          </div>
        )}

        {/* Tab groups */}
        {groups.map((group, gi) => (
          <div key={gi} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {gi === 0 && onSearch !== undefined && (
              <div className="admin-filterbar__divider" />
            )}

            <div className="admin-filterbar__tabs" role="tablist" aria-label={group.label}>
              {group.options.map((option) => {
                const value = option.value ?? option;
                const label = option.label ?? option;
                const count = option.count;
                const isActive = group.value === value;

                return (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`admin-filterbar__tab${isActive ? ' admin-filterbar__tab--active' : ''}`}
                    onClick={() => group.onChange?.(value)}
                  >
                    {label}
                    {count !== undefined && (
                      <span className="admin-filterbar__count">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {/* Right-side actions */}
        {actions && (
          <div className="admin-filterbar__right">
            <div className="admin-filterbar__actions">{actions}</div>
          </div>
        )}
      </div>
    </div>
  );
}