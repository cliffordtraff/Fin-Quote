'use client'

import { DrawingTool } from '@watchlist/hooks/useDrawingTools'

interface DrawingToolbarProps {
  activeTool: DrawingTool
  onSelectTool: (tool: DrawingTool) => void
  onClearAll: () => void
}

export function DrawingToolbar({ activeTool, onSelectTool, onClearAll }: DrawingToolbarProps) {
  return null // Drawing toolbar disabled
}