-- Events and sale offers for the public site.
CREATE TYPE "AnnouncementKind" AS ENUM ('EVENT', 'OFFER');

CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "kind" "AnnouncementKind" NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT,
    "location" TEXT,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "coupon_code" TEXT,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "show_banner" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "announcements_slug_key" ON "announcements"("slug");
CREATE INDEX "announcements_kind_is_published_idx" ON "announcements"("kind", "is_published");
