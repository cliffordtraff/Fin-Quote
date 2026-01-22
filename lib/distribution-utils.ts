/**
 * Utility functions for computing distribution curves (KDE) for stock returns
 *
 * The y-axis of the distribution represents probability density - how likely
 * returns are to fall within each range. Higher peaks = more stocks with that return.
 * The ticker dots' y-positions are for visual spacing only, not density values.
 */

export interface DistributionPoint {
  x: number  // Return percentage
  y: number  // Density value
}

/**
 * Gaussian kernel function for KDE
 */
function gaussianKernel(u: number): number {
  return Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI)
}

/**
 * Compute Kernel Density Estimate (KDE) from an array of return values
 *
 * @param returns - Array of return percentages
 * @param xMin - Minimum x value for the curve
 * @param xMax - Maximum x value for the curve
 * @param numPoints - Number of points to generate for the curve
 * @param bandwidth - KDE bandwidth (smoothing parameter). If not provided, uses Silverman's rule.
 * @returns Array of {x, y} points representing the density curve
 */
export function computeKDE(
  returns: number[],
  xMin: number,
  xMax: number,
  numPoints: number = 200,
  bandwidth?: number
): DistributionPoint[] {
  if (returns.length === 0) {
    return []
  }

  // Use Silverman's rule of thumb for bandwidth if not provided
  // h = 0.9 * min(std, IQR/1.34) * n^(-1/5)
  if (!bandwidth) {
    const n = returns.length
    const sorted = [...returns].sort((a, b) => a - b)
    const q1 = sorted[Math.floor(n * 0.25)]
    const q3 = sorted[Math.floor(n * 0.75)]
    const iqr = q3 - q1

    const mean = returns.reduce((a, b) => a + b, 0) / n
    const std = Math.sqrt(returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / n)

    bandwidth = 0.9 * Math.min(std, iqr / 1.34) * Math.pow(n, -0.2)

    // Ensure bandwidth is reasonable
    bandwidth = Math.max(bandwidth, 0.1)
  }

  const points: DistributionPoint[] = []
  const step = (xMax - xMin) / (numPoints - 1)
  const n = returns.length

  for (let i = 0; i < numPoints; i++) {
    const x = xMin + i * step
    let density = 0

    for (const r of returns) {
      const u = (x - r) / bandwidth
      density += gaussianKernel(u)
    }

    density = density / (n * bandwidth)
    points.push({ x, y: density })
  }

  return points
}

/**
 * Split the distribution curve at x=0 into negative (red) and positive (green) parts
 * Returns SVG path data for each half
 */
export function splitDistributionPath(
  points: DistributionPoint[],
  xScale: (x: number) => number,
  yScale: (y: number) => number,
  baselineY: number
): { negativePath: string; positivePath: string; outlinePath: string } {
  if (points.length === 0) {
    return { negativePath: '', positivePath: '', outlinePath: '' }
  }

  // Find the point closest to x=0 for splitting
  let zeroIndex = points.findIndex(p => p.x >= 0)
  if (zeroIndex === -1) zeroIndex = points.length - 1
  if (zeroIndex === 0) zeroIndex = 1

  // Interpolate the y value at exactly x=0
  const prevPoint = points[zeroIndex - 1]
  const nextPoint = points[zeroIndex]
  const t = (0 - prevPoint.x) / (nextPoint.x - prevPoint.x)
  const yAtZero = prevPoint.y + t * (nextPoint.y - prevPoint.y)

  // Build negative (left of 0) path
  const negativePoints = points.filter(p => p.x <= 0)
  if (negativePoints.length > 0 && negativePoints[negativePoints.length - 1].x < 0) {
    negativePoints.push({ x: 0, y: yAtZero })
  }

  // Build positive (right of 0) path
  const positivePoints = points.filter(p => p.x >= 0)
  if (positivePoints.length > 0 && positivePoints[0].x > 0) {
    positivePoints.unshift({ x: 0, y: yAtZero })
  }

  // Create filled area paths (closed shapes from baseline)
  const negativePath = createFilledPath(negativePoints, xScale, yScale, baselineY)
  const positivePath = createFilledPath(positivePoints, xScale, yScale, baselineY)

  // Create outline path (just the top of the curve)
  const outlinePath = createOutlinePath(points, xScale, yScale)

  return { negativePath, positivePath, outlinePath }
}

function createFilledPath(
  points: DistributionPoint[],
  xScale: (x: number) => number,
  yScale: (y: number) => number,
  baselineY: number
): string {
  if (points.length === 0) return ''

  // Start at baseline, draw curve, return to baseline
  const pathParts: string[] = []

  // Move to first point on baseline
  pathParts.push(`M ${xScale(points[0].x)} ${baselineY}`)

  // Line to first curve point
  pathParts.push(`L ${xScale(points[0].x)} ${yScale(points[0].y)}`)

  // Draw the curve
  for (let i = 1; i < points.length; i++) {
    pathParts.push(`L ${xScale(points[i].x)} ${yScale(points[i].y)}`)
  }

  // Line to last point on baseline
  pathParts.push(`L ${xScale(points[points.length - 1].x)} ${baselineY}`)

  // Close the path
  pathParts.push('Z')

  return pathParts.join(' ')
}

function createOutlinePath(
  points: DistributionPoint[],
  xScale: (x: number) => number,
  yScale: (y: number) => number
): string {
  if (points.length === 0) return ''

  const pathParts: string[] = []
  pathParts.push(`M ${xScale(points[0].x)} ${yScale(points[0].y)}`)

  for (let i = 1; i < points.length; i++) {
    pathParts.push(`L ${xScale(points[i].x)} ${yScale(points[i].y)}`)
  }

  return pathParts.join(' ')
}

/**
 * Get appropriate x-axis range based on the return data
 * Ensures it's symmetric around 0 and includes all data points
 */
export function getAxisRange(returns: number[], padding: number = 1): { min: number; max: number } {
  if (returns.length === 0) {
    return { min: -10, max: 10 }
  }

  const dataMin = Math.min(...returns)
  const dataMax = Math.max(...returns)
  const absMax = Math.max(Math.abs(dataMin), Math.abs(dataMax), 2)

  return {
    min: -Math.ceil(absMax + padding),
    max: Math.ceil(absMax + padding),
  }
}
