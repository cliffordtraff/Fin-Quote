import { IChartApi, ISeriesApi, SeriesType, MouseEventParams } from 'lightweight-charts';
export type DrawingTool = 'none' | 'trendline';
export declare function useDrawingTools(chartRef: React.RefObject<IChartApi | null>, seriesRef: React.RefObject<ISeriesApi<SeriesType> | null>, externalTool?: DrawingTool): {
    activeTool: DrawingTool;
    isDrawing: boolean;
    startDrawing: (tool: DrawingTool) => void;
    stopDrawing: () => void;
    handleChartClick: (param: MouseEventParams) => void;
    clearAllDrawings: () => void;
};
