import { DrawingTool } from '@watchlist/hooks/useDrawingTools';
interface DrawingToolbarProps {
    activeTool: DrawingTool;
    onSelectTool: (tool: DrawingTool) => void;
    onClearAll: () => void;
}
export declare function DrawingToolbar({ activeTool, onSelectTool, onClearAll }: DrawingToolbarProps): null;
export {};
