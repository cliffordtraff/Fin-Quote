import { CanvasRenderingTarget2D } from 'fancy-canvas';
import { IChartApi, ISeriesApi, ISeriesPrimitive, IPrimitivePaneRenderer, IPrimitivePaneView, SeriesType, Time } from 'lightweight-charts';
export interface ExtendedHoursOverlayOptions {
    color: string;
}
declare class ExtendedHoursOverlayRenderer implements IPrimitivePaneRenderer {
    _regions: Array<{
        x1: number;
        x2: number;
    }>;
    _color: string;
    constructor(regions: Array<{
        x1: number;
        x2: number;
    }>, color: string);
    draw(target: CanvasRenderingTarget2D): void;
}
declare class ExtendedHoursOverlayView implements IPrimitivePaneView {
    _source: ExtendedHoursOverlay;
    _regions: Array<{
        x1: number;
        x2: number;
    }>;
    constructor(source: ExtendedHoursOverlay);
    update(): void;
    renderer(): ExtendedHoursOverlayRenderer;
    _isExtendedHours(timestamp: number): boolean;
}
export declare class ExtendedHoursOverlay implements ISeriesPrimitive<Time> {
    _chart: IChartApi;
    _series: ISeriesApi<SeriesType>;
    _paneViews: ExtendedHoursOverlayView[];
    _options: ExtendedHoursOverlayOptions;
    constructor(chart: IChartApi, series: ISeriesApi<SeriesType>, options?: Partial<ExtendedHoursOverlayOptions>);
    updateAllViews(): void;
    paneViews(): ExtendedHoursOverlayView[];
    zOrder(): "bottom";
}
export {};
