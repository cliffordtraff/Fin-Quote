const defaultOptions = {
    color: 'rgba(173, 216, 230, 0.1)', // Light blue with low opacity
};
class ExtendedHoursOverlayRenderer {
    constructor(regions, color) {
        this._regions = regions;
        this._color = color;
    }
    draw(target) {
        target.useBitmapCoordinateSpace(scope => {
            const ctx = scope.context;
            const height = scope.bitmapSize.height;
            this._regions.forEach((region, index) => {
                const x1Scaled = Math.round(region.x1 * scope.horizontalPixelRatio);
                const x2Scaled = Math.round(region.x2 * scope.horizontalPixelRatio);
                const width = x2Scaled - x1Scaled;
                if (width > 0) {
                    ctx.fillStyle = this._color;
                    ctx.fillRect(x1Scaled, 0, width, height);
                }
            });
        });
    }
}
class ExtendedHoursOverlayView {
    constructor(source) {
        this._regions = [];
        this._source = source;
    }
    update() {
        this._regions = [];
        const timeScale = this._source._chart.timeScale();
        const visibleRange = timeScale.getVisibleLogicalRange();
        if (!visibleRange) {
            return;
        }
        // Get time range from visible logical range
        const leftCoordinate = timeScale.logicalToCoordinate(visibleRange.from);
        const rightCoordinate = timeScale.logicalToCoordinate(visibleRange.to);
        if (leftCoordinate === null || rightCoordinate === null)
            return;
        const leftTime = timeScale.coordinateToTime(leftCoordinate);
        const rightTime = timeScale.coordinateToTime(rightCoordinate);
        if (!leftTime || !rightTime)
            return;
        // Convert to timestamps
        const startTimestamp = typeof leftTime === 'number' ? leftTime : Math.floor(new Date(leftTime).getTime() / 1000);
        const endTimestamp = typeof rightTime === 'number' ? rightTime : Math.floor(new Date(rightTime).getTime() / 1000);
        // Iterate through each hour in the visible range
        let currentTime = startTimestamp;
        while (currentTime <= endTimestamp) {
            if (this._isExtendedHours(currentTime)) {
                // Find the start of this extended hours region
                const regionStart = currentTime;
                // Find the end of this extended hours region
                let regionEnd = currentTime;
                while (regionEnd <= endTimestamp && this._isExtendedHours(regionEnd)) {
                    regionEnd += 60; // Increment by 1 minute
                }
                // Convert timestamps to coordinates
                const x1 = timeScale.timeToCoordinate(regionStart);
                const x2 = timeScale.timeToCoordinate(regionEnd);
                if (x1 !== null && x2 !== null) {
                    this._regions.push({
                        x1: Math.min(x1, x2),
                        x2: Math.max(x1, x2),
                    });
                }
                currentTime = regionEnd;
            }
            else {
                currentTime += 60; // Increment by 1 minute
            }
        }
    }
    renderer() {
        return new ExtendedHoursOverlayRenderer(this._regions, this._source._options.color);
    }
    _isExtendedHours(timestamp) {
        const date = new Date(timestamp * 1000);
        // Convert to ET timezone
        const etTime = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const hours = etTime.getHours();
        const minutes = etTime.getMinutes();
        const totalMinutes = hours * 60 + minutes;
        // Regular market hours: 9:30 AM - 4:00 PM ET (570 - 960 minutes)
        const marketOpen = 9 * 60 + 30; // 9:30 AM
        const marketClose = 16 * 60; // 4:00 PM
        // Check if it's a weekday (0 = Sunday, 6 = Saturday)
        const dayOfWeek = etTime.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
            return true; // Weekend is extended hours
        }
        // Extended hours: before 9:30 AM or after 4:00 PM
        return totalMinutes < marketOpen || totalMinutes >= marketClose;
    }
}
export class ExtendedHoursOverlay {
    constructor(chart, series, options) {
        this._chart = chart;
        this._series = series;
        this._options = Object.assign(Object.assign({}, defaultOptions), options);
        this._paneViews = [new ExtendedHoursOverlayView(this)];
    }
    updateAllViews() {
        this._paneViews.forEach(pw => pw.update());
    }
    paneViews() {
        return this._paneViews;
    }
    // Render behind everything else
    zOrder() {
        return 'bottom';
    }
}
