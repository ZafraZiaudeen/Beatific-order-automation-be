import { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { importSpreadsheet } from "../application/import";
import { isAuthenticated } from "./middleware/authentication-middleware";
import ValidationError from "../domain/errors/validation-error";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/octet-stream",
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(csv|xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new ValidationError("Only .csv, .xls, and .xlsx files are allowed") as unknown as Error);
    }
  },
});

const router = Router();

// POST /api/import/spreadsheet
router.post(
  "/spreadsheet",
  isAuthenticated,
  upload.single("file"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        throw new ValidationError("No file uploaded");
      }

      const storeId = req.body.storeId;
      if (!storeId) {
        throw new ValidationError("Store ID is required");
      }

      const result = await importSpreadsheet(
        req.file.buffer,
        req.file.originalname,
        req.auth!.companyId as string,
        storeId,
        req.auth!.userId as string
      );

      res.json(result);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
