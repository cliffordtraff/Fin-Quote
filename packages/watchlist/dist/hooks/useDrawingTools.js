import { useState, useCallback, useRef, useEffect } from 'react';
import { TrendLine } from '@watchlist/components/TradingView/plugins/trend-line';
export function useDrawingTools(chartRef, seriesRef, externalTool) {
    const [activeTool, setActiveTool] = useState('none');
    const activeToolRef = useRef('none');
    const isDrawingRef = useRef(false);
    const firstPoint = useRef(null);
    const trendLines = useRef([]);
    // Sync with external tool prop
    useEffect(() => {
        if (externalTool !== undefined) {
            setActiveTool(externalTool);
            activeToolRef.current = externalTool;
            if (externalTool === 'none') {
                isDrawingRef.current = false;
                firstPoint.current = null;
            }
        }
    }, [externalTool]);
    const startDrawing = useCallback((tool) => {
        setActiveTool(tool);
        activeToolRef.current = tool;
        isDrawingRef.current = false;
        firstPoint.current = null;
    }, []);
    const stopDrawing = useCallback(() => {
        setActiveTool('none');
        activeToolRef.current = 'none';
        isDrawingRef.current = false;
        firstPoint.current = null;
    }, []);
    const handleChartClick = useCallback((param) => {
        var _a, _b;
        if (activeToolRef.current === 'none' || !chartRef.current || !seriesRef.current)
            return;
        // Get price and time from click
        const price = seriesRef.current.coordinateToPrice((_b = (_a = param.point) === null || _a === void 0 ? void 0 : _a.y) !== null && _b !== void 0 ? _b : 0);
        const time = param.time;
        if (!price || !time)
            return;
        if (activeToolRef.current === 'trendline') {
            if (!isDrawingRef.current) {
                // First point
                firstPoint.current = { time, price };
                isDrawingRef.current = true;
            }
            else {
                // Second point - create the trend line
                if (firstPoint.current) {
                    const trendLine = new TrendLine(chartRef.current, seriesRef.current, firstPoint.current, { time, price }, {
                        lineColor: 'rgb(0, 122, 255)',
                        width: 2,
                        showLabels: true,
                        labelBackgroundColor: 'rgba(255, 255, 255, 0.85)',
                        labelTextColor: 'rgb(0, 122, 255)',
                    });
                    // Attach primitive to series
                    seriesRef.current.attachPrimitive(trendLine);
                    trendLines.current.push(trendLine);
                    // Reset drawing state
                    isDrawingRef.current = false;
                    firstPoint.current = null;
                }
            }
        }
    }, [chartRef, seriesRef]);
    const clearAllDrawings = useCallback(() => {
        if (!seriesRef.current)
            return;
        trendLines.current.forEach(line => {
            var _a;
            (_a = seriesRef.current) === null || _a === void 0 ? void 0 : _a.detachPrimitive(line);
        });
        trendLines.current = [];
    }, [seriesRef]);
    return {
        activeTool,
        isDrawing: isDrawingRef.current,
        startDrawing,
        stopDrawing,
        handleChartClick,
        clearAllDrawings,
    };
}
