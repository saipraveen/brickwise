// API request/response DTOs

// --- Common response patterns ---

/** Standard error response */
export interface ApiErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  details?: Record<string, string>;
}

/** Paginated response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
  /** Informational message returned when the result set is empty */
  message?: string;
}

/** Pagination metadata */
export interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/** Standard success response for mutations */
export interface ApiSuccessResponse {
  success: boolean;
  message: string;
}

// --- Auth DTOs ---

/** POST /api/auth/register request */
export interface RegisterRequest {
  username: string;
  password: string;
  email: string;
}

/** POST /api/auth/login request */
export interface LoginRequest {
  username: string;
  password: string;
}

/** Auth response (login/register) */
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserInfo;
}

/** User info returned in auth responses */
export interface UserInfo {
  id: string;
  username: string;
  email: string;
}

/** POST /api/auth/refresh request */
export interface RefreshTokenRequest {
  refreshToken: string;
}

/** POST /api/auth/refresh response */
export interface RefreshTokenResponse {
  accessToken: string;
  refreshToken: string;
}

// --- Scan DTOs ---

/** POST /api/scan/identify request */
export interface ScanIdentifyRequest {
  image: string; // base64 encoded image
  maxParts?: number;
  minConfidence?: number;
}

/** POST /api/scan/identify response */
export interface ScanIdentifyResponse {
  sessionId: string;
  identifiedBricks: import('./recognition').IdentifiedBrick[];
  processingTimeMs: number;
  cached: boolean;
}

// --- Inventory DTOs ---

/** POST /api/inventory/bulk-add request */
export interface BulkAddBricksRequest {
  bricks: BrickAddEntry[];
}

/** A single brick to add in a bulk operation */
export interface BrickAddEntry {
  partNumber: string;
  colorId: number;
  quantity: number;
  bagNumber?: number;
  sourceSetNumber?: string;
}

/** PATCH /api/inventory/:id request */
export interface UpdateBrickRequest {
  quantity?: number;
  status?: import('./inventory').BrickStatus;
  bagNumber?: number | null;
}

/** GET /api/inventory query params */
export interface InventoryQueryParams {
  groupBy?: 'category' | 'color' | 'partNumber';
  status?: import('./inventory').BrickStatus;
  partNumber?: string;
  colorId?: number;
  categoryId?: number;
  page?: number;
  pageSize?: number;
}

// --- Set Collection DTOs ---

/** POST /api/sets request */
export interface AddSetRequest {
  setNumber: string;
}

/** PATCH /api/sets/:id/status request */
export interface UpdateSetStatusRequest {
  status: import('./inventory').SetBuildStatus;
  confirmConflicts?: boolean;
}

/** Conflict info when marking a set as built */
export interface SetConflictInfo {
  hasConflicts: boolean;
  conflictingBricks: ConflictBrickInfo[];
}

/** Details of a conflicting brick */
export interface ConflictBrickInfo {
  partNumber: string;
  colorId: number;
  colorName: string;
  currentStatus: import('./inventory').BrickStatus;
  quantity: number;
}

// --- Storage Bag DTOs ---

/** POST /api/bags/:id/bricks request */
export interface AssignBricksToBagRequest {
  bricks: BrickAddEntry[];
}

/** Bag overview for display */
export interface BagOverview {
  bagNumber: number;
  distinctBrickTypes: number;
  totalBrickCount: number;
}

// --- MOC DTOs ---

/** MOC summary for list display */
export interface MocSummary {
  id: string;
  title: string;
  designer: string;
  thumbnailUrl: string;
  pieceCount: number;
  theme?: string;
  coveragePercentage?: number;
}

/** MOC detail view */
export interface MocDetail {
  id: string;
  title: string;
  designer: string;
  thumbnailUrl: string;
  pieceCount: number;
  theme?: string;
  instructionsUrl?: string;
  requiredParts: import('./coverage').RequiredPart[];
}

/** GET /api/mocs/:id/buildability response */
export interface BuildabilityResponse {
  mocId: string;
  coverage: import('./coverage').CoverageResult;
}

// --- Rebuild Idea DTOs ---

/** Difficulty level for rebuild ideas */
export type DifficultyLevel = 'Beginner' | 'Intermediate' | 'Advanced';

/** Rebuild idea summary */
export interface RebuildIdeaSummary {
  id: string;
  title: string;
  imageUrl: string;
  coveragePercentage: number;
  difficulty: DifficultyLevel;
  theme?: string;
}

/** Rebuild idea detail */
export interface RebuildIdeaDetail {
  id: string;
  title: string;
  imageUrl: string;
  coveragePercentage: number;
  difficulty: DifficultyLevel;
  theme?: string;
  instructionsUrl?: string;
  requiredParts: import('./coverage').RequiredPart[];
  missingParts: import('./coverage').MissingPart[];
}

/** GET /api/rebuilds query params */
export interface RebuildQueryParams {
  setNumbers: string[]; // up to 10
  theme?: string;
  difficulty?: DifficultyLevel;
  minCoverage?: number; // 50-100
}

// --- Display Ideas DTOs ---

/** Display idea category */
export type DisplayCategory = 'shelf' | 'wall-mount' | 'diorama' | 'lighting' | 'stand';

/** Display idea for presentation */
export interface DisplayIdea {
  id: string;
  title: string;
  description: string; // 20-300 characters
  category: DisplayCategory;
  referenceImageUrl: string;
  additionalMaterials: string[];
  theme?: string;
  scale?: 'small' | 'medium' | 'large';
}

// --- Sharing DTOs ---

/** POST /api/sharing/invite request */
export interface InviteUserRequest {
  username: string;
  options: import('./sharing').ShareOptions;
}

// --- Search DTOs ---

/** GET /api/search query params */
export interface SearchQueryParams {
  query: string; // min 2 characters
  domain?: 'inventory' | 'collection' | 'mocs' | 'rebuilds';
  page?: number;
  pageSize?: number;
  filters?: Record<string, string>;
}

/** Search results grouped by domain */
export interface SearchResults {
  inventory?: PaginatedResponse<import('./inventory').BrickEntry>;
  collection?: PaginatedResponse<import('./inventory').SetEntry>;
  mocs?: PaginatedResponse<MocSummary>;
  rebuilds?: PaginatedResponse<RebuildIdeaSummary>;
  /** Warning message when cached data is served because a remote source is unavailable */
  cachedDataWarning?: string;
}
