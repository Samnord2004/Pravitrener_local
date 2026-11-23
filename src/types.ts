export type UserRole = 'owner' | 'admin' | 'trainer' | 'client';
export type EmploymentStatus = 'working' | 'fired';
export type ClientActivityStatus = 'active' | 'inactive';

export interface TrainerSocialLinks {
  telegram?: string;
  vk?: string;
  instagram?: string;
  youtube?: string;
  website?: string;
}

export interface TrainerPublicProfile {
  photoUrl?: string;
  experienceYears?: number;
  specialization?: string;
  bio?: string;
  workStyle?: string;
  skills?: string[];
  highlights?: string[];
  socials?: TrainerSocialLinks;
}

export interface UserAccount {
  id: string;
  login: string;
  name: string;
  role: UserRole;
  studioId: string | null;
  phone: string;
  email: string;
  emailVerified?: boolean;
  employmentStatus?: EmploymentStatus;
  tokenVersion?: number;
  lastLoginAt?: string;
  telegramHandle: string;
  avatarInitials: string;
  active: boolean;
  trainerProfile?: TrainerPublicProfile;
}

export interface StoredUserAccount extends UserAccount {
  passwordHash: string;
}

export interface StudioSocialLinks {
  website?: string;
  telegram?: string;
  vk?: string;
  instagram?: string;
  youtube?: string;
  whatsapp?: string;
}

export interface BrandApproachCard {
  id: string;
  title: string;
  description: string;
}

export interface MethodologySlideCard {
  id: string;
  heading: string;
  text: string;
}

export interface MethodologyProgramBlock {
  id: string;
  slug: string;
  badge: string;
  title: string;
  subtitle: string;
  quoteOrMotto?: string;
  promoBadge?: string;
  heroImageUrl?: string;
  accentTone?: 'cyan' | 'amber' | 'emerald' | 'violet' | 'rose';
  recommendedServiceCategory?: ServiceCategory;
  recommendedServiceHint?: string;
  summary: string;
  reasonsTitle?: string;
  reasons: string[];
  featureCards: MethodologySlideCard[];
  contraindicationsNote?: string;
  active?: boolean;
}

export interface BrandAboutInfo {
  brandName: string;
  tagline: string;
  aboutNetwork: string;
  methodologyTitle: string;
  methodologyDescription: string;
  whyUsTitle: string;
  whyUsPoints: string[];
  approaches: BrandApproachCard[];
  methodologyBlocks?: MethodologyProgramBlock[];
  equipmentAndSafety: string;
  networkPhone?: string;
  networkEmail?: string;
  socials?: StudioSocialLinks;
  updatedAt?: string;
}

export interface Studio {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  email?: string;
  routeHint?: string;
  socials?: StudioSocialLinks;
  openHours: string;
  weekdayOpenHours?: string;
  weekendOpenHours?: string;
  framesCount: number;
  active: boolean;
  monthlyTargetRevenue: number;
  description?: string;
  photos?: string[];
}

export type ReviewTargetType = 'studio' | 'trainer';

export interface RatingReview {
  id: string;
  targetType: ReviewTargetType;
  targetId: string;
  clientId?: string;
  authorName: string;
  rating: number;
  comment: string;
  createdAt: string;
  updatedAt?: string;
}

export interface TrainerSchedule {
  id: string;
  trainerId: string;
  studioId: string;
  dayOfWeek: number; // 0 (Mon) - 6 (Sun)
  startTime: string;
  endTime: string;
  active: boolean;
}

export type ServiceCategory = 'relax' | 'fitness' | 'sport' | 'wellness';

export interface ServiceItem {
  id: string;
  studioId: string; // 'all' or studioId
  name: string;
  category?: ServiceCategory;
  description: string;
  durationMin: number;
  priceRub: number;
  sortOrder?: number;
  active: boolean;
}

export interface PromoCode {
  id: string;
  code: string;
  title: string;
  discountPercent: number;
  validUntil: string;
  studioId: string;
  active: boolean;
  usageCount: number;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  type: 'subscription' | 'certificate';
  sessionsCount: number;
  priceRub: number;
  validityDays: number;
  description: string;
  active: boolean;
}

export interface ClientSubscription {
  id: string;
  clientId: string;
  clientName: string;
  planId: string;
  planName: string;
  type: 'subscription' | 'certificate';
  code: string;
  totalSessions: number;
  remainingSessions: number;
  purchasedAt: string;
  expiresAt: string;
  studioId: string;
  status: 'active' | 'used' | 'expired' | 'archived';
  archivedAt?: string;
}

export interface SubscriptionUsage {
  id: string;
  clientSubscriptionId: string;
  clientId: string;
  clientName: string;
  planName: string;
  bookingId?: string;
  sessionId?: string;
  usedAt: string;
  delta: number;
  note: string;
  studioId: string;
}

export type ExerciseVisibility = 'public' | 'hidden';
export type ExerciseType =
  | 'Декомпрессия'
  | 'Нейро-мышечный фитнес'
  | 'Баланс бревно'
  | 'Силовое удержание'
  | 'Релакс и дыхание'
  | 'Оздоровительная практика';

export type ExerciseLimbKey = 'ln' | 'pn' | 'lr' | 'pr' | 'sh';

export interface ExerciseLimbSetting {
  stand: number; // Стойка от 1 до 7
  angle: number; // Угол от 0 до 6
}

export type ExerciseLimbAngleMatrix = Record<ExerciseLimbKey, ExerciseLimbSetting>;

export interface Exercise {
  id: string;
  title: string;
  category: 'Базовое вытяжение' | 'Ротация' | 'Грудной отдел' | 'Силовое удержание' | 'Восстановление';
  exerciseType?: ExerciseType;
  imageUrl: string;
  instructions: string;
  targetMuscles: string[];
  limbAngles: {
    wrists: string;
    ankles: string;
    torsoAngle: string;
  };
  limbAngleMatrix?: ExerciseLimbAngleMatrix;
  safetyNotes: string;
  defaultDurationSec: number;
  recommendedLoadPct: number;
  visibility?: ExerciseVisibility;
  createdByUserId?: string;
  createdBy?: string;
  studioId?: string;
}

export interface WorkoutProgram {
  id: string;
  title: string;
  level: 'Первая тренировка' | 'Вторая тренировка' | 'Продвинутая' | 'Индивидуальная';
  clientId?: string;
  description: string;
  exerciseIds: string[];
  createdBy: string;
  createdByUserId?: string;
  createdAt: string;
}

export interface MiScale2Metrics {
  weightKg: number;
  bmi: number;
  bodyFatPct: number;
  muscleMassKg: number;
  waterPct: number;
  proteinPct: number;
  visceralFatLevel: number;
  boneMassKg: number;
  bmrKcal: number;
  idealWeightKg: number;
  bodyAgeYears: number;
  bodyScore: number;
  bodyType: string;
  impedanceOhm: number;
  balanceTestSec?: number;
}

export interface AnthropometryRecord extends MiScale2Metrics {
  id: string;
  date: string;
  phase: 'before' | 'after' | 'paired';
  heightCm: number;
  heightBeforeCm: number;
  heightAfterCm?: number;
  heightDeltaCm?: number;
  bpSys: number;
  bpDia: number;
  pulseRest: number;
  flexibilityScore: number;
  painIndex: number;
  calibratedScale?: boolean;
  notes: string;
}

export interface PosturePoint {
  xPct: number;
  yPct: number;
}

export type PostureMeasurementType = 'tilt' | 'joint';

export interface PostureAngleMeasurement {
  id: string;
  label: string;
  type: PostureMeasurementType;
  points: PosturePoint[];
  angleDeg: number;
  deviationDeg?: number;
  color?: string;
}

export type PostureViewProjection = 'front' | 'back' | 'side_left' | 'side_right';

export interface PostureAssessmentRecord {
  id: string;
  date: string;
  projection: PostureViewProjection;
  beforePhotoUrl: string;
  afterPhotoUrl?: string;
  laserEnabled: boolean;
  laserPlumbXPct: number;
  laserHorizonsPct: number[];
  laserTiltDeg?: number;
  fineGrid?: boolean;
  beforeMeasurements: PostureAngleMeasurement[];
  afterMeasurements: PostureAngleMeasurement[];
  notes: string;
  recordedBy?: string;
}

export interface ClientProgressNote {
  id: string;
  date: string;
  authorName: string;
  text: string;
}

export interface ClientProfile {
  id: string;
  userId?: string;
  name: string;
  gender: 'male' | 'female';
  clientStatus?: ClientActivityStatus;
  phone: string;
  email: string;
  telegram: string;
  telegramChatId?: string;
  studioId: string;
  birthYear: number;
  birthDate: string; // YYYY-MM-DD
  lastBirthdayGreetingYear?: number;
  goal: string;
  contraindications: string;
  anthropometry: AnthropometryRecord[];
  postureAssessments?: PostureAssessmentRecord[];
  notes: ClientProgressNote[];
  npsScore: number;
  totalSessions: number;
  lastVisitDate: string;
}

export type BookingStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid_cash' | 'paid_card' | 'paid_subscription' | 'paid_certificate';

export interface Booking {
  id: string;
  studioId: string;
  clientId: string;
  clientName: string;
  trainerId: string;
  trainerName: string;
  serviceId: string;
  serviceName: string;
  priceRub: number;
  date: string;
  time: string;
  durationMin: number;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  promoCode?: string;
  finalAmountRub: number;
  createdAt: string;
  createdByUserId?: string;
}

export type EquipmentType = 'xiaomi_scale' | 'wahoo_tickr' | 'myoblue_emg' | 'esp32_limbs' | 'bp_b05';

export interface ScaleCalibrationConfig {
  tareOffsetKg: number;
  gainFactor: number;
  impedanceOffsetOhm: number;
  referenceWeightKg: number;
  calibrated: boolean;
  lastCalibratedAt: string;
}

export type HardwareTransportMode = 'web_bluetooth' | 'web_serial' | 'websocket_bridge' | 'disconnected';

export interface HardwareDeviceConfig {
  transport: 'web_bluetooth' | 'web_serial' | 'websocket_bridge';
  deviceNameFilter?: string;
  bridgeUrl?: string;
  serialBaudRate?: number;
  autoSyncToCard?: boolean;
  emgGain?: number;
  emgBaselineMv?: number;
  esp32ZeroOffsets?: { lh: number; rh: number; lf: number; rf: number };
  esp32ScaleFactors?: { lh: number; rh: number; lf: number; rf: number };
  lastDeviceName?: string;
}

export interface LiveHardwarePacket {
  type: EquipmentType;
  source: 'web_bluetooth' | 'web_serial' | 'websocket_bridge' | 'http_bridge';
  timestamp: string;
  batteryPct?: number;
  deviceName?: string;
  // ESP32 4xHX711 limbs (kg)
  lh?: number;
  rh?: number;
  lf?: number;
  rf?: number;
  // MYOblue 2-ch EMG (mV)
  emgCh1Mv?: number;
  emgCh2Mv?: number;
  // Wahoo TICKR FIT HR (bpm)
  heartRateBpm?: number;
  sensorContact?: boolean;
  // Mi Body Composition Scale 2
  weightKg?: number;
  impedanceOhm?: number;
  stabilized?: boolean;
  // Blood Pressure B05
  sys?: number;
  dia?: number;
  map?: number;
  pulse?: number;
}

export interface EquipmentDevice {
  id: string;
  type: EquipmentType;
  name: string;
  model: string;
  protocol: string;
  connected: boolean;
  connectionMode?: HardwareTransportMode;
  batteryPct: number;
  signalQualityPct: number;
  lastReadingText: string;
  lastSyncAt: string;
  streaming: boolean;
  lastError?: string;
  calibration?: ScaleCalibrationConfig;
  hardwareConfig?: HardwareDeviceConfig;
}

export interface TelemetryPoint {
  t: number;
  leftHandKg: number;
  rightHandKg: number;
  leftFootKg: number;
  rightFootKg: number;
  totalWinchKg: number;
  heartRateBpm: number;
  emgCh1Mv: number;
  emgCh2Mv: number;
}

export interface CompletedExerciseLog {
  exerciseId: string;
  title: string;
  durationSec: number;
  maxWinchKg: number;
  avgEmgMv: number;
}

export interface TrainingSessionRecord {
  id: string;
  bookingId?: string;
  studioId: string;
  clientId: string;
  clientName: string;
  trainerId: string;
  trainerName: string;
  programId?: string;
  programTitle: string;
  startedAt: string;
  endedAt: string;
  durationSec: number;
  completedExercises: CompletedExerciseLog[];
  peakWinchKg: number;
  avgSymmetryPct: number;
  maxLimbLoads: {
    lh: number;
    rh: number;
    lf: number;
    rf: number;
  };
  avgHrBpm: number;
  bpBefore: string;
  bpAfter: string;
  heightBeforeCm?: number;
  heightAfterCm?: number;
  notes: string;
  paymentMethod: PaymentStatus;
  amountPaidRub: number;
}

export type NotificationChannel = 'email' | 'telegram' | 'whatsapp' | 'push';

export interface NotificationTemplate {
  id: string;
  name: string;
  channel: NotificationChannel;
  trigger: 'manual' | 'booking_created' | 'reminder_24h' | 'reminder_2h' | 'payment_due' | 'session_completed' | 'birthday';
  subject: string;
  body: string;
}

export interface NotificationLog {
  id: string;
  templateId?: string;
  channel: NotificationChannel;
  recipientName: string;
  recipientContact: string;
  clientId?: string;
  subject: string;
  messagePreview: string;
  cabinetLink: string;
  status: 'sent' | 'delivered' | 'read';
  sentAt: string;
}

export type StudioStyleTheme = 'slavic' | 'japanese' | 'viking' | 'modern';

export interface EmailSmtpConfig {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password?: string;
  hasPassword?: boolean;
  fromName: string;
  fromEmail: string;
  lastVerifiedAt?: string;
  lastError?: string;
}

export interface TelegramIntegrationConfig {
  enabled: boolean;
  botUsername: string;
  botToken?: string;
  hasBotToken?: boolean;
  webhookSecret?: string;
  autoConfirmBooking: boolean;
  lastVerifiedAt?: string;
  lastError?: string;
}

export interface WhatsAppIntegrationConfig {
  enabled: boolean;
  provider: 'cloud_api' | 'green_api' | 'custom_webhook';
  phoneNumberId: string;
  accessToken?: string;
  hasAccessToken?: boolean;
  webhookUrl: string;
  businessPhone: string;
  lastVerifiedAt?: string;
  lastError?: string;
}

export interface MessagingSettings {
  email: EmailSmtpConfig;
  telegram: TelegramIntegrationConfig;
  whatsapp: WhatsAppIntegrationConfig;
}

export type MessengerChannel = 'telegram' | 'whatsapp' | 'web_chat';

export interface MessengerMessage {
  id: string;
  clientId: string;
  clientName: string;
  channel: MessengerChannel;
  direction: 'inbound' | 'outbound';
  senderName: string;
  contactHandle: string;
  text: string;
  sentAt: string;
  readByAdmin: boolean;
  deliveryStatus: 'delivered' | 'sent' | 'queued' | 'failed';
  deliveryNote?: string;
}

export interface PublicBookingInfo {
  studios: Pick<
    Studio,
    | 'id'
    | 'name'
    | 'city'
    | 'address'
    | 'phone'
    | 'email'
    | 'routeHint'
    | 'socials'
    | 'openHours'
    | 'weekdayOpenHours'
    | 'weekendOpenHours'
    | 'framesCount'
    | 'description'
    | 'photos'
  >[];
  services: ServiceItem[];
  trainers: Pick<UserAccount, 'id' | 'name' | 'studioId' | 'avatarInitials' | 'trainerProfile'>[];
  promos: Pick<PromoCode, 'code' | 'title' | 'discountPercent' | 'studioId'>[];
  reviews: RatingReview[];
  brandAbout?: BrandAboutInfo;
  prefillClient?: {
    id: string;
    name: string;
    phone: string;
    email: string;
    telegram: string;
    studioId: string;
  };
}

export type TrainerBlogPlatform = 'telegram' | 'vk' | 'instagram' | 'dzen' | 'all';

export interface TrainerBlogPost {
  id: string;
  trainerId: string;
  trainerName: string;
  studioId: string;
  platform: TrainerBlogPlatform;
  category: 'Методика ПравИло' | 'Кейс без ПДн' | 'Биомеханика' | 'Анонс и запись';
  title: string;
  content: string;
  hashtags: string[];
  includeBookingLink: boolean;
  status: 'draft' | 'published';
  publishedAt: string;
  updatedAt?: string;
}

export interface SystemSecuritySettings {
  requireEmailVerificationOnLogin?: boolean;
  domainUrl?: string;
  publicDomainUrl?: string;
  tunnelMode?: 'cloudflare' | 'nginx' | 'caddy' | 'direct' | 'local';
  autoCheckUpdates?: boolean;
  releaseChannel?: 'stable' | 'beta';
  appVersion?: string;
  lastUpdateCheckAt?: string;
  lastUpdatedAt?: string;
}

export interface StudioDatabase {
  users: StoredUserAccount[];
  studios: Studio[];
  schedules: TrainerSchedule[];
  services: ServiceItem[];
  promos: PromoCode[];
  subscriptionPlans: SubscriptionPlan[];
  clientSubscriptions: ClientSubscription[];
  subscriptionUsages: SubscriptionUsage[];
  exercises: Exercise[];
  programs: WorkoutProgram[];
  clients: ClientProfile[];
  bookings: Booking[];
  equipment: EquipmentDevice[];
  sessions: TrainingSessionRecord[];
  templates: NotificationTemplate[];
  notificationLogs: NotificationLog[];
  birthdayAutomationEnabled?: boolean;
  messagingSettings?: MessagingSettings;
  messengerMessages?: MessengerMessage[];
  trainerPosts?: TrainerBlogPost[];
  reviews?: RatingReview[];
  brandAbout?: BrandAboutInfo;
  systemSettings?: SystemSecuritySettings;
  hardwareRealModeInitialized?: boolean;
}
