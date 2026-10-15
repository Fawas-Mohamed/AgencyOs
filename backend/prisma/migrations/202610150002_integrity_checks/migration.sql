ALTER TABLE "ClientRequirement"
  ADD CONSTRAINT "Requirement_budget_nonnegative" CHECK (("budgetMin" IS NULL OR "budgetMin" >= 0) AND ("budgetMax" IS NULL OR "budgetMax" >= 0)),
  ADD CONSTRAINT "Requirement_budget_order" CHECK ("budgetMin" IS NULL OR "budgetMax" IS NULL OR "budgetMin" <= "budgetMax"),
  ADD CONSTRAINT "Requirement_budget_currency" CHECK (("budgetMin" IS NULL AND "budgetMax" IS NULL) OR ("currency" IS NOT NULL AND "currency" ~ '^[A-Z]{3}$')),
  ADD CONSTRAINT "Requirement_confirmation" CHECK ("status" <> 'CONFIRMED' OR ("confirmedAt" IS NOT NULL AND "confirmedById" IS NOT NULL)),
  ADD CONSTRAINT "Requirement_versions_positive" CHECK ("version" > 0 AND "lockVersion" > 0);
ALTER TABLE "ClientFile"
  ADD CONSTRAINT "File_storage_or_reference" CHECK (("storageKey" IS NOT NULL) <> ("referenceUrl" IS NOT NULL)),
  ADD CONSTRAINT "File_size_nonnegative" CHECK ("size" IS NULL OR "size" >= 0);
ALTER TABLE "RequirementItem" ADD CONSTRAINT "Item_position_nonnegative" CHECK ("position" >= 0);
