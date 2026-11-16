-- CreateEnum
CREATE TYPE "Province" AS ENUM ('ON', 'AB', 'BC');

-- CreateEnum
CREATE TYPE "RegionStatus" AS ENUM ('ACTIVE', 'COMING_SOON', 'PAUSED');

-- CreateEnum
CREATE TYPE "FeeType" AS ENUM ('FIXED', 'PERCENT');

-- CreateEnum
CREATE TYPE "CapacityMode" AS ENUM ('FIXED', 'DERIVED');

-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('FLAT', 'HOURLY');

-- CreateEnum
CREATE TYPE "ExtraUnit" AS ENUM ('FIXED', 'PER_UNIT');

-- CreateEnum
CREATE TYPE "PricingTableStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RateKind" AS ENUM ('BASE', 'BEDROOM', 'BATHROOM', 'SQFT_BAND', 'SERVICE_SURCHARGE', 'FIRST_CLEAN_UPGRADE', 'EXTRA', 'HOURLY_RATE', 'HOURLY_MIN', 'FREQUENCY_DISCOUNT', 'MIN_JOB');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'REGION_ADMIN', 'CLEANER', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CleanerStatus" AS ENUM ('ONBOARDING', 'ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BgCheckStatus" AS ENUM ('PENDING', 'CLEARED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PayType" AS ENUM ('HOURLY', 'PERCENT_OF_JOB', 'FLAT_PER_JOB');

-- CreateEnum
CREATE TYPE "Skill" AS ENUM ('DEEP_CLEAN', 'MOVE_OUT', 'POST_RENO', 'COMMERCIAL', 'AIRBNB', 'LEAD');

-- CreateEnum
CREATE TYPE "TimeOffStatus" AS ENUM ('REQUESTED', 'APPROVED', 'DENIED');

-- CreateEnum
CREATE TYPE "PaymentMethodStatus" AS ENUM ('ACTIVE', 'DETACHED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('WEB', 'ADMIN', 'PHONE', 'API');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('ONE_TIME', 'WEEKLY', 'BIWEEKLY', 'EVERY_4_WEEKS');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'CONFIRMED', 'ASSIGNED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'SKIPPED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "JobPaymentStatus" AS ENUM ('UNPAID', 'AUTHORIZED', 'PAID', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'WAIVED');

-- CreateEnum
CREATE TYPE "CancellationType" AS ENUM ('FREE', 'LATE', 'NO_SHOW', 'SKIPPED');

-- CreateEnum
CREATE TYPE "ActorType" AS ENUM ('CUSTOMER', 'CLEANER', 'ADMIN', 'SYSTEM', 'STRIPE');

-- CreateEnum
CREATE TYPE "AssignmentRole" AS ENUM ('LEAD', 'MEMBER');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'REMOVED');

-- CreateEnum
CREATE TYPE "JobEventType" AS ENUM ('STATUS_CHANGED', 'ASSIGNED', 'UNASSIGNED', 'RESCHEDULED', 'REPRICED', 'NOTE', 'CHECKLIST', 'PHOTO', 'OVER_CAPACITY', 'GEOFENCE_WARNING', 'PAYMENT');

-- CreateEnum
CREATE TYPE "QuoteReason" AS ENUM ('BOOKING', 'REGENERATION', 'CUSTOMER_EDIT', 'ADMIN_ADJUSTMENT', 'TAX_CHANGE');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "PromoScope" AS ENUM ('FIRST_JOB', 'ALL_JOBS');

-- CreateEnum
CREATE TYPE "GiftCardStatus" AS ENUM ('ACTIVE', 'DEPLETED', 'VOID');

-- CreateEnum
CREATE TYPE "ChargeType" AS ENUM ('SERVICE', 'TIP', 'CANCELLATION_FEE', 'GIFT_CARD_PURCHASE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'REQUIRES_ACTION', 'CAPTURED', 'FAILED', 'FAILED_FINAL', 'CANCELED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'DISPUTED', 'WAIVED');

-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('QUALITY', 'CANCELLED', 'DUPLICATE', 'GOODWILL', 'OTHER');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "EarningStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "PayoutMethod" AS ENUM ('MANUAL', 'STRIPE_CONNECT');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "PhotoKind" AS ENUM ('BEFORE', 'AFTER', 'ISSUE', 'CHECKLIST');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'SMS', 'PUSH');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('NEW', 'REVIEWING', 'INTERVIEW', 'HIRED', 'REJECTED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'CAD',
    "stripeAccountId" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "province" "Province" NOT NULL,
    "timezone" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "addressLine" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "status" "RegionStatus" NOT NULL DEFAULT 'ACTIVE',
    "launchedAt" TIMESTAMP(3),
    "minLeadHours" INTEGER NOT NULL DEFAULT 24,
    "maxAdvanceDays" INTEGER NOT NULL DEFAULT 60,
    "lateCancelWindowHours" INTEGER NOT NULL DEFAULT 24,
    "lateCancelFeeType" "FeeType" NOT NULL DEFAULT 'FIXED',
    "lateCancelFeeValue" INTEGER NOT NULL DEFAULT 5000,
    "requireCleanerAcceptance" BOOLEAN NOT NULL DEFAULT false,
    "capacityMode" "CapacityMode" NOT NULL DEFAULT 'FIXED',
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "landingContent" JSONB,
    "googleRating" DECIMAL(2,1),
    "googleReviewCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceArea" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "fsa" CHAR(3) NOT NULL,
    "cityLabel" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "province" "Province" NOT NULL,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "intro" TEXT,
    "neighborhoods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "faqs" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "province" "Province" NOT NULL,
    "name" TEXT NOT NULL,
    "rateBps" INTEGER NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArrivalWindow" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ArrivalWindow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WindowCapacity" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "windowId" TEXT NOT NULL,
    "weekday" INTEGER,
    "date" DATE,
    "capacity" INTEGER NOT NULL,

    CONSTRAINT "WindowCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlackoutDate" (
    "id" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "windowId" TEXT,
    "reason" TEXT,

    CONSTRAINT "BlackoutDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pricingModel" "PricingModel" NOT NULL DEFAULT 'FLAT',
    "isUpgrade" BOOLEAN NOT NULL DEFAULT false,
    "checklistTemplateId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Extra" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" "ExtraUnit" NOT NULL DEFAULT 'FIXED',
    "maxQty" INTEGER NOT NULL DEFAULT 1,
    "defaultMinutes" INTEGER NOT NULL DEFAULT 30,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Extra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingTable" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "regionId" TEXT,
    "version" INTEGER NOT NULL,
    "status" "PricingTableStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRate" (
    "id" TEXT NOT NULL,
    "pricingTableId" TEXT NOT NULL,
    "kind" "RateKind" NOT NULL,
    "key" TEXT NOT NULL,
    "amountCents" INTEGER,
    "bps" INTEGER,
    "minutes" INTEGER,

    CONSTRAINT "PricingRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceQuote" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "bookingId" TEXT,
    "regionId" TEXT NOT NULL,
    "pricingTableId" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "lines" JSONB NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "taxableCents" INTEGER NOT NULL,
    "taxCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "reason" "QuoteReason" NOT NULL DEFAULT 'BOOKING',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoCode" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "DiscountType" NOT NULL,
    "value" INTEGER NOT NULL,
    "appliesTo" "PromoScope" NOT NULL DEFAULT 'FIRST_JOB',
    "minSubtotalCents" INTEGER NOT NULL DEFAULT 0,
    "maxDiscountCents" INTEGER,
    "maxRedemptions" INTEGER,
    "perCustomerLimit" INTEGER NOT NULL DEFAULT 1,
    "newCustomersOnly" BOOLEAN NOT NULL DEFAULT false,
    "regionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "serviceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromoRedemption" (
    "id" TEXT NOT NULL,
    "promoCodeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "jobId" TEXT,
    "discountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCard" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "initialCents" INTEGER NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    "purchaserCustomerId" TEXT,
    "purchaserEmail" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "message" TEXT,
    "purchaseChargeId" TEXT,
    "status" "GiftCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardRedemption" (
    "id" TEXT NOT NULL,
    "giftCardId" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GiftCardRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "phone" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "passwordHash" TEXT,
    "totpSecret" TEXT,
    "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "sessionVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "regionId" TEXT,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "stripeCustomerId" TEXT,
    "defaultPaymentMethodId" TEXT,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "smsOptOut" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "anonymizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "province" "Province" NOT NULL,
    "postalCode" TEXT NOT NULL,
    "fsa" CHAR(3) NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "placeId" TEXT,
    "entryInstructions" TEXT,
    "parkingInstructions" TEXT,
    "secureNotes" TEXT,
    "pets" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "stripePaymentMethodId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "last4" TEXT NOT NULL,
    "expMonth" INTEGER NOT NULL,
    "expYear" INTEGER NOT NULL,
    "status" "PaymentMethodStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cleaner" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "photoUrl" TEXT,
    "status" "CleanerStatus" NOT NULL DEFAULT 'ONBOARDING',
    "backgroundCheckStatus" "BgCheckStatus" NOT NULL DEFAULT 'PENDING',
    "backgroundCheckAt" TIMESTAMP(3),
    "homeRegionId" TEXT NOT NULL,
    "payType" "PayType" NOT NULL DEFAULT 'PERCENT_OF_JOB',
    "payRateCents" INTEGER,
    "payPercentBps" INTEGER,
    "maxJobsPerDay" INTEGER NOT NULL DEFAULT 3,
    "ratingAvg" DECIMAL(3,2),
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "stripeConnectAccountId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cleaner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleanerRegion" (
    "cleanerId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,

    CONSTRAINT "CleanerRegion_pkey" PRIMARY KEY ("cleanerId","regionId")
);

-- CreateTable
CREATE TABLE "CleanerSkill" (
    "cleanerId" TEXT NOT NULL,
    "skill" "Skill" NOT NULL,

    CONSTRAINT "CleanerSkill_pkey" PRIMARY KEY ("cleanerId","skill")
);

-- CreateTable
CREATE TABLE "CleanerAvailability" (
    "id" TEXT NOT NULL,
    "cleanerId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,

    CONSTRAINT "CleanerAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TimeOff" (
    "id" TEXT NOT NULL,
    "cleanerId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "TimeOffStatus" NOT NULL DEFAULT 'REQUESTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TimeOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "paymentMethodId" TEXT,
    "bookingNumber" TEXT NOT NULL,
    "source" "BookingSource" NOT NULL DEFAULT 'WEB',
    "status" "BookingStatus" NOT NULL DEFAULT 'ACTIVE',
    "frequency" "Frequency" NOT NULL,
    "anchorDate" DATE NOT NULL,
    "weekday" INTEGER NOT NULL,
    "windowId" TEXT NOT NULL,
    "endsOn" DATE,
    "pausedFrom" DATE,
    "pausedUntil" DATE,
    "generatedThrough" DATE,
    "bedrooms" INTEGER NOT NULL,
    "bathrooms" DECIMAL(3,1) NOT NULL,
    "sqft" INTEGER,
    "hourlyHours" DECIMAL(4,1),
    "hourlyCleaners" INTEGER,
    "extras" JSONB NOT NULL DEFAULT '[]',
    "firstCleanUpgradeServiceId" TEXT,
    "defaultTipCents" INTEGER NOT NULL DEFAULT 0,
    "customerNotes" TEXT,
    "internalNotes" TEXT,
    "promoCodeId" TEXT,
    "giftCardId" TEXT,
    "preferredCleanerId" TEXT,
    "marketingConsentAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "detached" BOOLEAN NOT NULL DEFAULT false,
    "status" "JobStatus" NOT NULL DEFAULT 'CONFIRMED',
    "scheduledDate" DATE NOT NULL,
    "windowStartLocal" TEXT NOT NULL,
    "windowEndLocal" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "scheduledStartAt" TIMESTAMP(3) NOT NULL,
    "scheduledEndAt" TIMESTAMP(3) NOT NULL,
    "estimatedMinutes" INTEGER NOT NULL,
    "serviceId" TEXT NOT NULL,
    "addressId" TEXT NOT NULL,
    "addressSnapshot" JSONB NOT NULL,
    "bedrooms" INTEGER NOT NULL,
    "bathrooms" DECIMAL(3,1) NOT NULL,
    "sqft" INTEGER,
    "hourlyHours" DECIMAL(4,1),
    "hourlyCleaners" INTEGER,
    "extras" JSONB NOT NULL DEFAULT '[]',
    "isFirstCleanUpgrade" BOOLEAN NOT NULL DEFAULT false,
    "customerNotes" TEXT,
    "internalNotes" TEXT,
    "activeQuoteId" TEXT,
    "priceLockedAt" TIMESTAMP(3),
    "paymentStatus" "JobPaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "tipCents" INTEGER NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMP(3),
    "cancelledBy" "ActorType",
    "cancellationType" "CancellationType",
    "cancellationReason" TEXT,
    "actualStartAt" TIMESTAMP(3),
    "actualEndAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "cleanerId" TEXT NOT NULL,
    "role" "AssignmentRole" NOT NULL DEFAULT 'LEAD',
    "status" "AssignmentStatus" NOT NULL DEFAULT 'OFFERED',
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "assignedByUserId" TEXT,
    "removedReason" TEXT,
    "checkInAt" TIMESTAMP(3),
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "checkOutAt" TIMESTAMP(3),
    "checkOutLat" DOUBLE PRECISION,
    "checkOutLng" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobEvent" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "type" "JobEventType" NOT NULL,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "regionId" TEXT,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTemplateItem" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "requiresPhoto" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ChecklistTemplateItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobChecklistItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "requiresPhoto" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "completedByCleanerId" TEXT,
    "photoId" TEXT,

    CONSTRAINT "JobChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobPhoto" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "cleanerId" TEXT NOT NULL,
    "kind" "PhotoKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,

    CONSTRAINT "JobPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "cleanerId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "adminResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "jobId" TEXT,
    "type" "ChargeType" NOT NULL,
    "quoteId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "giftCardCents" INTEGER NOT NULL DEFAULT 0,
    "cardCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "status" "ChargeStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethodId" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeChargeId" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "capturedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "chargeId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "toGiftCardCents" INTEGER NOT NULL DEFAULT 0,
    "reason" "RefundReason" NOT NULL,
    "note" TEXT,
    "stripeRefundId" TEXT,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tip" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "chargeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TipSplit" (
    "tipId" TEXT NOT NULL,
    "cleanerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,

    CONSTRAINT "TipSplit_pkey" PRIMARY KEY ("tipId","cleanerId")
);

-- CreateTable
CREATE TABLE "CleanerEarning" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "cleanerId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "basis" "PayType" NOT NULL,
    "baseCents" INTEGER NOT NULL,
    "tipCents" INTEGER NOT NULL DEFAULT 0,
    "adjustmentCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL,
    "status" "EarningStatus" NOT NULL DEFAULT 'PENDING',
    "payoutId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CleanerEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "cleanerId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "method" "PayoutMethod" NOT NULL DEFAULT 'MANUAL',
    "stripeTransferId" TEXT,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StripeEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "templateKey" TEXT NOT NULL,
    "recipientType" "ActorType" NOT NULL,
    "recipientId" TEXT,
    "to" TEXT NOT NULL,
    "jobId" TEXT,
    "bookingId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "providerMessageId" TEXT,
    "dedupeKey" TEXT,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "regionId" TEXT,
    "actorType" "ActorType" NOT NULL,
    "actorId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CleanerApplication" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "regionId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT,
    "experience" TEXT,
    "hasVehicle" BOOLEAN,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CleanerApplication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE INDEX "Region_organizationId_status_idx" ON "Region"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Region_organizationId_slug_key" ON "Region"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "ServiceArea_regionId_idx" ON "ServiceArea"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceArea_fsa_key" ON "ServiceArea"("fsa");

-- CreateIndex
CREATE UNIQUE INDEX "City_slug_key" ON "City"("slug");

-- CreateIndex
CREATE INDEX "City_regionId_idx" ON "City"("regionId");

-- CreateIndex
CREATE INDEX "TaxRate_province_effectiveFrom_idx" ON "TaxRate"("province", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ArrivalWindow_regionId_startLocal_key" ON "ArrivalWindow"("regionId", "startLocal");

-- CreateIndex
CREATE UNIQUE INDEX "WindowCapacity_regionId_windowId_weekday_key" ON "WindowCapacity"("regionId", "windowId", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "WindowCapacity_regionId_windowId_date_key" ON "WindowCapacity"("regionId", "windowId", "date");

-- CreateIndex
CREATE INDEX "BlackoutDate_regionId_date_idx" ON "BlackoutDate"("regionId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Service_organizationId_slug_key" ON "Service"("organizationId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "Extra_organizationId_slug_key" ON "Extra"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "PricingTable_regionId_status_effectiveFrom_idx" ON "PricingTable"("regionId", "status", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "PricingTable_organizationId_regionId_version_key" ON "PricingTable"("organizationId", "regionId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRate_pricingTableId_kind_key_key" ON "PricingRate"("pricingTableId", "kind", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PriceQuote_jobId_key" ON "PriceQuote"("jobId");

-- CreateIndex
CREATE INDEX "PriceQuote_bookingId_createdAt_idx" ON "PriceQuote"("bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_organizationId_code_key" ON "PromoCode"("organizationId", "code");

-- CreateIndex
CREATE INDEX "PromoRedemption_customerId_idx" ON "PromoRedemption"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoRedemption_promoCodeId_jobId_key" ON "PromoRedemption"("promoCodeId", "jobId");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCard_code_key" ON "GiftCard"("code");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_organizationId_email_key" ON "User"("organizationId", "email");

-- CreateIndex
CREATE INDEX "UserRole_regionId_idx" ON "UserRole"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_role_regionId_key" ON "UserRole"("userId", "role", "regionId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_userId_key" ON "Customer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_stripeCustomerId_key" ON "Customer"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_organizationId_email_key" ON "Customer"("organizationId", "email");

-- CreateIndex
CREATE INDEX "Address_customerId_idx" ON "Address"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_stripePaymentMethodId_key" ON "PaymentMethod"("stripePaymentMethodId");

-- CreateIndex
CREATE INDEX "PaymentMethod_customerId_idx" ON "PaymentMethod"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Cleaner_userId_key" ON "Cleaner"("userId");

-- CreateIndex
CREATE INDEX "Cleaner_homeRegionId_status_idx" ON "Cleaner"("homeRegionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Cleaner_organizationId_email_key" ON "Cleaner"("organizationId", "email");

-- CreateIndex
CREATE INDEX "CleanerAvailability_cleanerId_weekday_idx" ON "CleanerAvailability"("cleanerId", "weekday");

-- CreateIndex
CREATE INDEX "TimeOff_cleanerId_startsAt_idx" ON "TimeOff"("cleanerId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_bookingNumber_key" ON "Booking"("bookingNumber");

-- CreateIndex
CREATE INDEX "Booking_customerId_idx" ON "Booking"("customerId");

-- CreateIndex
CREATE INDEX "Booking_regionId_status_idx" ON "Booking"("regionId", "status");

-- CreateIndex
CREATE INDEX "Booking_status_generatedThrough_idx" ON "Booking"("status", "generatedThrough");

-- CreateIndex
CREATE UNIQUE INDEX "Job_activeQuoteId_key" ON "Job"("activeQuoteId");

-- CreateIndex
CREATE INDEX "Job_regionId_scheduledDate_status_idx" ON "Job"("regionId", "scheduledDate", "status");

-- CreateIndex
CREATE INDEX "Job_regionId_scheduledDate_windowStartLocal_idx" ON "Job"("regionId", "scheduledDate", "windowStartLocal");

-- CreateIndex
CREATE INDEX "Job_customerId_scheduledStartAt_idx" ON "Job"("customerId", "scheduledStartAt");

-- CreateIndex
CREATE INDEX "Job_status_scheduledStartAt_idx" ON "Job"("status", "scheduledStartAt");

-- CreateIndex
CREATE UNIQUE INDEX "Job_bookingId_sequenceNumber_key" ON "Job"("bookingId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "Assignment_cleanerId_status_idx" ON "Assignment"("cleanerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_jobId_cleanerId_key" ON "Assignment"("jobId", "cleanerId");

-- CreateIndex
CREATE INDEX "JobEvent_jobId_createdAt_idx" ON "JobEvent"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "JobChecklistItem_jobId_idx" ON "JobChecklistItem"("jobId");

-- CreateIndex
CREATE INDEX "JobPhoto_jobId_idx" ON "JobPhoto"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_jobId_key" ON "Review"("jobId");

-- CreateIndex
CREATE INDEX "Review_cleanerId_isPublic_idx" ON "Review"("cleanerId", "isPublic");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_stripePaymentIntentId_key" ON "Charge"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_idempotencyKey_key" ON "Charge"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Charge_jobId_type_idx" ON "Charge"("jobId", "type");

-- CreateIndex
CREATE INDEX "Charge_status_nextRetryAt_idx" ON "Charge"("status", "nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_stripeRefundId_key" ON "Refund"("stripeRefundId");

-- CreateIndex
CREATE UNIQUE INDEX "CleanerEarning_assignmentId_key" ON "CleanerEarning"("assignmentId");

-- CreateIndex
CREATE INDEX "CleanerEarning_cleanerId_status_idx" ON "CleanerEarning"("cleanerId", "status");

-- CreateIndex
CREATE INDEX "Payout_cleanerId_periodStart_idx" ON "Payout"("cleanerId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_recipientType_recipientId_createdAt_idx" ON "Notification"("recipientType", "recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "CleanerApplication_regionId_status_idx" ON "CleanerApplication"("regionId", "status");

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceArea" ADD CONSTRAINT "ServiceArea_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArrivalWindow" ADD CONSTRAINT "ArrivalWindow_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowCapacity" ADD CONSTRAINT "WindowCapacity_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WindowCapacity" ADD CONSTRAINT "WindowCapacity_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "ArrivalWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlackoutDate" ADD CONSTRAINT "BlackoutDate_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlackoutDate" ADD CONSTRAINT "BlackoutDate_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "ArrivalWindow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Service" ADD CONSTRAINT "Service_checklistTemplateId_fkey" FOREIGN KEY ("checklistTemplateId") REFERENCES "ChecklistTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Extra" ADD CONSTRAINT "Extra_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingTable" ADD CONSTRAINT "PricingTable_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingTable" ADD CONSTRAINT "PricingTable_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRate" ADD CONSTRAINT "PricingRate_pricingTableId_fkey" FOREIGN KEY ("pricingTableId") REFERENCES "PricingTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceQuote" ADD CONSTRAINT "PriceQuote_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceQuote" ADD CONSTRAINT "PriceQuote_pricingTableId_fkey" FOREIGN KEY ("pricingTableId") REFERENCES "PricingTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceQuote" ADD CONSTRAINT "PriceQuote_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceQuote" ADD CONSTRAINT "PriceQuote_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoCode" ADD CONSTRAINT "PromoCode_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromoRedemption" ADD CONSTRAINT "PromoRedemption_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCard" ADD CONSTRAINT "GiftCard_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardRedemption" ADD CONSTRAINT "GiftCardRedemption_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardRedemption" ADD CONSTRAINT "GiftCardRedemption_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cleaner" ADD CONSTRAINT "Cleaner_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cleaner" ADD CONSTRAINT "Cleaner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cleaner" ADD CONSTRAINT "Cleaner_homeRegionId_fkey" FOREIGN KEY ("homeRegionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleanerRegion" ADD CONSTRAINT "CleanerRegion_cleanerId_fkey" FOREIGN KEY ("cleanerId") REFERENCES "Cleaner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleanerRegion" ADD CONSTRAINT "CleanerRegion_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleanerSkill" ADD CONSTRAINT "CleanerSkill_cleanerId_fkey" FOREIGN KEY ("cleanerId") REFERENCES "Cleaner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleanerAvailability" ADD CONSTRAINT "CleanerAvailability_cleanerId_fkey" FOREIGN KEY ("cleanerId") REFERENCES "Cleaner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeOff" ADD CONSTRAINT "TimeOff_cleanerId_fkey" FOREIGN KEY ("cleanerId") REFERENCES "Cleaner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_firstCleanUpgradeServiceId_fkey" FOREIGN KEY ("firstCleanUpgradeServiceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_windowId_fkey" FOREIGN KEY ("windowId") REFERENCES "ArrivalWindow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_giftCardId_fkey" FOREIGN KEY ("giftCardId") REFERENCES "GiftCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_preferredCleanerId_fkey" FOREIGN KEY ("preferredCleanerId") REFERENCES "Cleaner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_cleanerId_fkey" FOREIGN KEY ("cleanerId") REFERENCES "Cleaner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobEvent" ADD CONSTRAINT "JobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplate" ADD CONSTRAINT "ChecklistTemplate_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTemplateItem" ADD CONSTRAINT "ChecklistTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ChecklistTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobChecklistItem" ADD CONSTRAINT "JobChecklistItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPhoto" ADD CONSTRAINT "JobPhoto_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobPhoto" ADD CONSTRAINT "JobPhoto_cleanerId_fkey" FOREIGN KEY ("cleanerId") REFERENCES "Cleaner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_cleanerId_fkey" FOREIGN KEY ("cleanerId") REFERENCES "Cleaner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "PriceQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tip" ADD CONSTRAINT "Tip_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipSplit" ADD CONSTRAINT "TipSplit_tipId_fkey" FOREIGN KEY ("tipId") REFERENCES "Tip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TipSplit" ADD CONSTRAINT "TipSplit_cleanerId_fkey" FOREIGN KEY ("cleanerId") REFERENCES "Cleaner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleanerEarning" ADD CONSTRAINT "CleanerEarning_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleanerEarning" ADD CONSTRAINT "CleanerEarning_cleanerId_fkey" FOREIGN KEY ("cleanerId") REFERENCES "Cleaner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleanerEarning" ADD CONSTRAINT "CleanerEarning_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleanerEarning" ADD CONSTRAINT "CleanerEarning_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payout" ADD CONSTRAINT "Payout_cleanerId_fkey" FOREIGN KEY ("cleanerId") REFERENCES "Cleaner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleanerApplication" ADD CONSTRAINT "CleanerApplication_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CleanerApplication" ADD CONSTRAINT "CleanerApplication_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;
