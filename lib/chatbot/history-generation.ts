/** A tiny monotonic fence shared by initial loads and exact-key recovery. */
export class ChatbotHistoryGenerationFence {
  private generation = 0

  begin(): number {
    this.generation += 1
    return this.generation
  }

  invalidate(): void {
    this.generation += 1
  }

  isCurrent(generation: number): boolean {
    return this.generation === generation
  }

  invalidateIfCurrent(generation: number): void {
    if (this.isCurrent(generation)) this.invalidate()
  }
}
