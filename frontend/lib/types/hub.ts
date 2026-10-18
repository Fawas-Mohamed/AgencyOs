export type RequirementStatus =
  | 'DRAFT'
  | 'UNDER_REVIEW'
  | 'CONFIRMED'
  | 'CHANGES_REQUESTED'
  | 'ARCHIVED';
export type CommunicationType =
  | 'CALL'
  | 'EMAIL'
  | 'MEETING'
  | 'WHATSAPP_MESSAGE'
  | 'VIDEO_MEETING'
  | 'OTHER';
export interface UserRef {
  id: string;
  displayName: string;
}
export interface Actor {
  userId: string;
  agencyId: string;
  displayName: string;
  email: string;
  role: string;
  permissions: string[];
}
export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
export interface Client {
  id: string;
  name: string;
  company: string;
  contactName: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}
export interface RequirementItem {
  id?: string;
  title: string;
  description: string;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'MUST_HAVE';
  notes: string;
  position?: number;
}
export interface RequirementContent {
  title: string;
  objective: string;
  services: string[];
  items: RequirementItem[];
  designPreferences: string;
  referenceLinks: string[];
  constraints: string;
  assumptions: string;
  internalRecommendations: string;
  clientNotes: string;
  timeline: string;
  targetDate: string | null;
  budgetMin: string | null;
  budgetMax: string | null;
  currency: string | null;
}
export interface Requirement extends RequirementContent {
  id: string;
  clientId: string;
  status: RequirementStatus;
  version: number;
  lockVersion: number;
  preparedBy: UserRef;
  confirmedBy: UserRef | null;
  confirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
  revisions?: { id: string; version: number; confirmedAt: string; confirmedBy: UserRef }[];
  history?: Activity[] | null;
  files?: ClientFile[] | null;
  notes?: ClientNote[] | null;
  communications?: Communication[] | null;
  allowedTransitions?: RequirementStatus[];
  editAllowed?: boolean;
}
export interface Communication {
  id: string;
  clientId: string;
  requirementId: string | null;
  type: CommunicationType;
  subject: string;
  summary: string;
  participants: string[];
  followUp: string;
  occurredAt: string;
  createdAt: string;
  createdBy: UserRef;
}
export interface ClientNote {
  id: string;
  clientId: string;
  body: string;
  requirementId: string | null;
  createdBy: UserRef;
  createdAt: string;
}
export interface ClientFile {
  id: string;
  clientId: string;
  requirementId: string | null;
  originalName: string;
  mimeType: string | null;
  size: number | null;
  referenceUrl: string | null;
  archivedAt: string | null;
  createdAt: string;
  uploadedBy: UserRef;
}
export interface Activity {
  id: string;
  eventType: string;
  summary: string;
  createdAt: string;
  actor: UserRef;
  metadata: Record<string, unknown> | null;
}
export interface Hub {
  summaryLimit: number;
  counts: Record<'requirements' | 'communications' | 'notes' | 'files' | 'timeline', number | null>;
  client: Client;
  requirements: Requirement[] | null;
  communications: Communication[] | null;
  notes: ClientNote[] | null;
  files: ClientFile[] | null;
  timeline: Activity[] | null;
  permissions: string[];
  relatedRecords: { kind: string; available: boolean; reason: string }[];
}

export interface ConfirmedPackage {
  schemaVersion: 1;
  requirementId: string;
  clientId: string;
  version: number;
  title: string;
  objective: string;
  services: string[];
  items: RequirementItem[];
  designPreferences: string;
  referenceLinks: string[];
  references: ClientFile[];
  clientProvided: {
    budgetMin: string | null;
    budgetMax: string | null;
    currency: string | null;
    timeline: string;
    targetDate: string | null;
    constraints: string;
    notes: string;
  };
  internal: { assumptions: string; recommendations: string };
  preparedBy: UserRef;
  confirmedBy: UserRef;
  confirmedAt: string;
}
