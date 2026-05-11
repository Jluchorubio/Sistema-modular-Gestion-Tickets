import { useState, useCallback } from 'react';

export function useSelection(visibleIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allChecked  = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someChecked = visibleIds.some((id) => selected.has(id));

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      const next   = new Set(prev);
      const allIn  = visibleIds.every((id) => prev.has(id));
      if (allIn) visibleIds.forEach((id) => next.delete(id));
      else       visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }, [visibleIds]);

  const toggleRow = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else              next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const selectedIds: string[] = [];
  selected.forEach((id) => selectedIds.push(id));

  return { selected, selectedIds, allChecked, someChecked, toggleAll, toggleRow, clear };
}
