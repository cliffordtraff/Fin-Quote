import { BitmapCoordinatesRenderingScope, CanvasRenderingTarget2D } from 'fancy-canvas';
import { AutoscaleInfo, Coordinate, IChartApi, ISeriesApi, ISeriesPrimitive, IPrimitivePaneRenderer, IPrimitivePaneView, Logical, SeriesOptionsMap, SeriesType, Time } from 'lightweight-charts';
declare class TrendLinePaneRenderer implements IPrimitivePaneRenderer {
    _p1: ViewPoint;
    _p2: ViewPoint;
    _text1: string;
    _text2: string;
    _options: TrendLineOptions;
    constructor(p1: ViewPoint, p2: ViewPoint, text1: string, text2: string, options: TrendLineOptions);
    draw(target: CanvasRenderingTarget2D): void;
    _drawTextLabel(scope: BitmapCoordinatesRenderingScope, text: string, x: number, y: number, left: boolean): void;
}
interface ViewPoint {
    x: Coordinate | null;
    y: Coordinate | null;
}
declare class TrendLinePaneView implements IPrimitivePaneView {
    _source: TrendLine;
    _p1: ViewPoint;
    _p2: ViewPoint;
    constructor(source: TrendLine);
    update(): void;
    renderer(): TrendLinePaneRenderer;
}
interface Point {
    time: Time;
    price: number;
}
export interface TrendLineOptions {
    lineColor: string;
    width: number;
    showLabels: boolean;
    labelBackgroundColor: string;
    labelTextColor: string;
}
export declare class TrendLine implements ISeriesPrimitive<Time> {
    _chart: IChartApi;
    _series: ISeriesApi<keyof SeriesOptionsMap>;
    _p1: Point;
    _p2: Point;
    _paneViews: TrendLinePaneView[];
    _options: TrendLineOptions;
    _minPrice: number;
    _maxPrice: number;
    constructor(chart: IChartApi, series: ISeriesApi<SeriesType>, p1: Point, p2: Point, options?: Partial<TrendLineOptions>);
    autoscaleInfo(startTimePoint: Logical, endTimePoint: Logical): AutoscaleInfo | null;
    updateAllViews(): void;
    paneViews(): TrendLinePaneView[];
    _pointIndex(p: Point): number | null;
}
export {};
