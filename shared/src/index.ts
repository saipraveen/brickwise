// Shared types package for BrickWise
// Domain types, DTOs, and constants shared between client and server

export type {
  BrickStatus,
  BrickEntry,
  SetBuildStatus,
  SetEntry,
  StorageBag,
  BagBrickEntry,
  BagLocation,
  InventorySummary,
  InventoryFilter,
} from './inventory.js';

export type {
  CatalogPart,
  CatalogSet,
  CatalogColor,
  CatalogSetPart,
  SyncStatus,
} from './catalog.js';

export type {
  BoundingBox,
  IdentifiedBrick,
  ScanResult,
  RecognizedPart,
  AlternativePart,
  RecognitionResult,
  RecognitionOptions,
  CapturedImage,
  ServiceStatus,
} from './recognition.js';

export type {
  RequiredPart,
  CoverageResult,
  MissingPart,
} from './coverage.js';

export type {
  ShareOptions,
  ShareLink,
  ShareInvite,
  SharedView,
  SharedCollectionView,
  SharedSetSummary,
  SharedInventoryView,
  CategoryCount,
} from './sharing.js';

export type {
  ApiErrorResponse,
  PaginatedResponse,
  PaginationMeta,
  ApiSuccessResponse,
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  UserInfo,
  RefreshTokenRequest,
  RefreshTokenResponse,
  ScanIdentifyRequest,
  ScanIdentifyResponse,
  BulkAddBricksRequest,
  BrickAddEntry,
  UpdateBrickRequest,
  InventoryQueryParams,
  AddSetRequest,
  UpdateSetStatusRequest,
  SetConflictInfo,
  ConflictBrickInfo,
  AssignBricksToBagRequest,
  BagOverview,
  MocSummary,
  MocDetail,
  BuildabilityResponse,
  DifficultyLevel,
  RebuildIdeaSummary,
  RebuildIdeaDetail,
  RebuildQueryParams,
  DisplayCategory,
  DisplayIdea,
  InviteUserRequest,
  SearchQueryParams,
  SearchResults,
} from './api.js';
