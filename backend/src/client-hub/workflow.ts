import { RequirementStatus } from '@prisma/client';
import { ApiError } from '../common/http';
export const EDITABLE: RequirementStatus[] = ['DRAFT', 'CHANGES_REQUESTED'];
export const TRANSITIONS: Record<RequirementStatus, readonly RequirementStatus[]> = {
  DRAFT: ['UNDER_REVIEW', 'ARCHIVED'],
  UNDER_REVIEW: ['CONFIRMED', 'CHANGES_REQUESTED', 'ARCHIVED'],
  CHANGES_REQUESTED: ['DRAFT', 'UNDER_REVIEW', 'ARCHIVED'],
  CONFIRMED: ['DRAFT', 'ARCHIVED'],
  ARCHIVED: [],
};
export function assertTransition(from: RequirementStatus, to: RequirementStatus, reason?: string) {
  if (!TRANSITIONS[from].includes(to)) throw new ApiError(409, 'INVALID_TRANSITION', 'This status transition is not allowed');
  if ((to === 'CHANGES_REQUESTED' || to === 'ARCHIVED' || from === 'CONFIRMED') && !reason?.trim()) throw new ApiError(400, 'REASON_REQUIRED', 'Provide a reason for this action');
}
export function assertEditable(status: RequirementStatus) {
  if (!EDITABLE.includes(status)) throw new ApiError(409, 'CONTENT_LOCKED', 'Reopen the requirement before changing agreed content');
}
