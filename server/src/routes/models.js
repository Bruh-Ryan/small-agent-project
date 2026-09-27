import { Router } from "express";
import { modelList } from "../agent/models.js";

const router = Router();

// Curated model allowlist for the UI dropdown, grouped by provider.
// Only providers with a key configured in .env are included (Phase 7).
router.get("/", (_req, res) => {
  res.json(modelList());
});

export default router;
