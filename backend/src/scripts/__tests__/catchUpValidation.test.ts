import { describe, it, expect } from '@jest/globals';
import { assertExpectedHourlyItems } from '../catchUpValidation.js';

describe('catch-up sync validation', () => {
  it('accepts exactly 24 records per missing day', () => {
    const items = Array.from({ length: 48 }, (_, index) => ({ id: index }));

    expect(() => assertExpectedHourlyItems('MCP', items, 2)).not.toThrow();
  });

  it('throws when a fetch returns fewer records than expected', () => {
    const items = Array.from({ length: 23 }, (_, index) => ({ id: index }));

    expect(() => assertExpectedHourlyItems('Consumption', items, 1)).toThrow(
      'Consumption returned 23 hourly records, expected at least 24'
    );
  });
});
