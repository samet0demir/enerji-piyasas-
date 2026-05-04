export function assertExpectedHourlyItems(source: string, items: unknown[], missingDayCount: number): void {
  const expectedMinimum = missingDayCount * 24;

  if (items.length < expectedMinimum) {
    throw new Error(`${source} returned ${items.length} hourly records, expected at least ${expectedMinimum}`);
  }
}
