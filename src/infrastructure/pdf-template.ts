import { PrintTemplateField } from "./schemas/Product";

const getPdfTemplateServiceUrl = () =>
  (
    process.env.PDF_TEMPLATE_SERVICE_URL ||
    process.env.PDF_DECOMPOSER_URL ||
    "http://localhost:5055"
  ).replace(/\/+$/, "");

const PDF_TEMPLATE_TIMEOUT_MS = Number(process.env.PDF_TEMPLATE_TIMEOUT_MS || "300000");

export type TemplateImportKind = "cover" | "interior";

export type DecomposedTemplatePage = {
  pageWidth: number;
  pageHeight: number;
  pageCount: number;
  previewImageUrl: string | null;
  extractedText: Array<{
    id: string;
    text: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontFamily: string;
    fontStyle: string;
    fill: string;
  }>;
};

export type TemplateRenderResult = {
  coverPdfUrl: string | null;
  interiorPdfUrl: string | null;
  coverPreviewUrl: string | null;
  interiorPreviewUrl: string | null;
  warnings: string[];
};

const withTimeout = () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PDF_TEMPLATE_TIMEOUT_MS);
  return { controller, timer };
};

export const decomposeTemplatePdf = async (
  buffer: Buffer,
  filename: string,
  kind: TemplateImportKind
): Promise<DecomposedTemplatePage> => {
  const form = new FormData();
  form.append("file", new Blob([buffer]), filename);

  const { controller, timer } = withTimeout();
  try {
    const response = await fetch(
      `${getPdfTemplateServiceUrl()}/api/decompose-template?kind=${kind}`,
      {
        method: "POST",
        body: form,
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`PDF template service returned ${response.status}: ${details}`);
    }

    const json = (await response.json()) as {
      success: boolean;
      message?: string;
      data?: DecomposedTemplatePage;
    };

    if (!json.success || !json.data) {
      throw new Error(json.message || "PDF template import failed");
    }

    return json.data;
  } finally {
    clearTimeout(timer);
  }
};

export const renderTemplatePdfs = async (payload: {
  coverPdfUrl?: string | null;
  interiorPdfUrl?: string | null;
  fields: PrintTemplateField[];
  values: Record<string, string>;
  mode: "sample" | "preview" | "final";
}): Promise<TemplateRenderResult> => {
  const { controller, timer } = withTimeout();
  try {
    const response = await fetch(`${getPdfTemplateServiceUrl()}/api/render-template`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`PDF template service returned ${response.status}: ${details}`);
    }

    const json = (await response.json()) as {
      success: boolean;
      message?: string;
      data?: TemplateRenderResult;
    };

    if (!json.success || !json.data) {
      throw new Error(json.message || "PDF template render failed");
    }

    return {
      coverPdfUrl: json.data.coverPdfUrl || null,
      interiorPdfUrl: json.data.interiorPdfUrl || null,
      coverPreviewUrl: json.data.coverPreviewUrl || null,
      interiorPreviewUrl: json.data.interiorPreviewUrl || null,
      warnings: json.data.warnings || [],
    };
  } finally {
    clearTimeout(timer);
  }
};
