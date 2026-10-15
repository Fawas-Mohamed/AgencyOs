import { RequirementStatus } from '@prisma/client';
import { assertEditable, assertTransition } from './workflow';
const expected: Record<RequirementStatus, RequirementStatus[]> = {
  DRAFT: ['UNDER_REVIEW', 'ARCHIVED'],
  UNDER_REVIEW: ['CONFIRMED', 'CHANGES_REQUESTED', 'ARCHIVED'],
  CHANGES_REQUESTED: ['DRAFT', 'UNDER_REVIEW', 'ARCHIVED'],
  CONFIRMED: ['DRAFT', 'ARCHIVED'],
  ARCHIVED: [],
};
describe('requirement workflow', () => {
  for (const from of Object.values(RequirementStatus))
    for (const to of Object.values(RequirementStatus)) {
      it(
        from + ' -> ' + to + ' is ' + (expected[from].includes(to) ? 'allowed' : 'rejected'),
        () => {
          const change = () => assertTransition(from, to, 'Documented reviewer reason');
          if (expected[from].includes(to)) expect(change).not.toThrow();
          else expect(change).toThrow();
        },
      );
    }
  it.each([
    ['CONFIRMED', 'DRAFT'],
    ['UNDER_REVIEW', 'CHANGES_REQUESTED'],
    ['DRAFT', 'ARCHIVED'],
  ] as const)('requires an explanation for %s -> %s', (from, to) => {
    expect(() => assertTransition(from, to)).toThrow();
  });
  it.each(['DRAFT', 'CHANGES_REQUESTED'] as const)('allows content edits in %s', (status) =>
    expect(() => assertEditable(status)).not.toThrow(),
  );
  it.each(['UNDER_REVIEW', 'CONFIRMED', 'ARCHIVED'] as const)('locks content in %s', (status) =>
    expect(() => assertEditable(status)).toThrow(),
  );
});
