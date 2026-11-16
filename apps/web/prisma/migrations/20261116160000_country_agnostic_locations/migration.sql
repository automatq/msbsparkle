-- Country-agnostic locations: provinces/states become plain codes ("ON", "CA", "NY") and service
-- areas become postal prefixes of up to 10 characters (Canadian FSA "M5V", US ZIP "90210" / "902").
-- Converted in place (ALTER ... TYPE ... USING) so existing rows and indexes are kept.

ALTER TABLE "Region"   ALTER COLUMN "province" SET DATA TYPE TEXT USING "province"::text;
ALTER TABLE "City"     ALTER COLUMN "province" SET DATA TYPE TEXT USING "province"::text;
ALTER TABLE "TaxRate"  ALTER COLUMN "province" SET DATA TYPE TEXT USING "province"::text;
ALTER TABLE "Address"  ALTER COLUMN "province" SET DATA TYPE TEXT USING "province"::text;

DROP TYPE "Province";

-- CHAR(3) pads with spaces; trim while widening so lookups by prefix match exactly.
ALTER TABLE "ServiceArea"        ALTER COLUMN "fsa" SET DATA TYPE VARCHAR(10) USING btrim("fsa");
ALTER TABLE "Address"            ALTER COLUMN "fsa" SET DATA TYPE VARCHAR(10) USING btrim("fsa");
ALTER TABLE "ServiceAreaRequest" ALTER COLUMN "fsa" SET DATA TYPE VARCHAR(10) USING btrim("fsa");
