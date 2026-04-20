import { Router, Request, Response, NextFunction } from "express";
import { isAuthenticated } from "./middleware/authentication-middleware";
import { getPresignedUploadUrl, isCloudinaryConfigured } from "../infrastructure/cloudinary";
import ValidationError from "../domain/errors/validation-error";

const router = Router();

// POST /api/upload/presign
router.post("/presign", isAuthenticated, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { folder } = req.body;
    if (!folder || !["covers", "interiors", "products"].includes(folder)) {
      throw new ValidationError("Invalid folder. Must be one of: covers, interiors, products");
    }

    if (!isCloudinaryConfigured()) {
      // Return a placeholder for dev environments without Cloudinary
      res.json({
        configured: false,
        message: "Cloudinary not configured. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET to .env",
      });
      return;
    }

    const presign = await getPresignedUploadUrl(`beatific/${folder}`);
    res.json({ configured: true, ...presign });
  } catch (error) {
    next(error);
  }
});

export default router;
