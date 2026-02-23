import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, X } from 'lucide-react'

interface FilterOption {
  n: string
  v: string
}

interface FilterItem {
  key: string
  name: string
  value: FilterOption[]
}

interface FilterPanelProps {
  filters: FilterItem[]
  selectedFilters: Record<string, string>
  onFilterChange: (key: string, value: string) => void
  onClearFilters: () => void
}

export default function FilterPanel({ filters, selectedFilters, onFilterChange, onClearFilters }: FilterPanelProps) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)

  if (!filters || filters.length === 0) return null

  const hasActiveFilters = Object.values(selectedFilters).some(v => v)

  const toggleExpand = (key: string) => {
    setExpandedKey(expandedKey === key ? null : key)
  }

  return (
    <div className="mb-4 rounded-lg bg-gray-50 p-3 dark:bg-gray-800/50">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">筛选条件</span>
        {hasActiveFilters && (
          <button
            onClick={onClearFilters}
            className="flex items-center gap-1 text-xs text-red-500 hover:text-red-600"
          >
            <X size={12} />
            清除筛选
          </button>
        )}
      </div>

      <div className="space-y-2">
        {filters.map((filter) => {
          const selectedValue = selectedFilters[filter.key]
          const selectedName = selectedValue 
            ? filter.value.find(opt => opt.v === selectedValue)?.n 
            : null
          const isExpanded = expandedKey === filter.key

          return (
            <div key={filter.key} className="rounded-md bg-white dark:bg-gray-700">
              <button
                onClick={() => toggleExpand(filter.key)}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className="text-gray-600 dark:text-gray-400">{filter.name}:</span>
                  {selectedName ? (
                    <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                      {selectedName}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400">全部</span>
                  )}
                </span>
                {isExpanded ? (
                  <ChevronUp size={14} className="text-gray-400" />
                ) : (
                  <ChevronDown size={14} className="text-gray-400" />
                )}
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-wrap gap-1.5 px-3 pb-3">
                      <button
                        onClick={() => onFilterChange(filter.key, '')}
                        className={`rounded px-2 py-1 text-xs transition-colors ${
                          !selectedValue
                            ? 'bg-purple-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500'
                        }`}
                      >
                        全部
                      </button>
                      {filter.value.map((option) => (
                        <button
                          key={option.v}
                          onClick={() => onFilterChange(filter.key, option.v)}
                          className={`rounded px-2 py-1 text-xs transition-colors ${
                            selectedValue === option.v
                              ? 'bg-purple-500 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-600 dark:text-gray-300 dark:hover:bg-gray-500'
                          }`}
                        >
                          {option.n}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>
    </div>
  )
}
