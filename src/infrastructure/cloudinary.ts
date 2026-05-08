const getCloudinaryConfig = () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return null;
  }

  return { cloudName, apiKey, apiSecret };
};

export const isCloudinaryConfigured = () => Boolean(getCloudinaryConfig());

type CloudinaryResourceType = "image" | "raw" | "auto";

const buildSignature = async (params: Record<string, string>, apiSecret: string) => {
  const crypto = await import("crypto");
  const signatureBase = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto
    .createHash("sha256")
    .update(`${signatureBase}${apiSecret}`)
    .digest("hex");
};

export const getPresignedUploadUrl = async (
  folder: string,
  resourceType: CloudinaryResourceType = "image"
) => {
  const config = getCloudinaryConfig();

  if (!config) {
    console.warn("Cloudinary not configured");
    return null;
  }

  const timestamp = Math.round(Date.now() / 1000);
  const signature = await buildSignature(
    { folder, timestamp: timestamp.toString() },
    config.apiSecret
  );

  return {
    url: `https://api.cloudinary.com/v1_1/${config.cloudName}/${resourceType}/upload`,
    fields: {
      api_key: config.apiKey,
      timestamp: timestamp.toString(),
      signature,
      folder,
    },
  };
};

export const uploadBufferToCloudinary = async (
  buffer: Buffer,
  options: {
    folder: string;
    filename: string;
    resourceType?: CloudinaryResourceType;
    publicId?: string;
  }
) => {
  const config = getCloudinaryConfig();
  if (!config) {
    throw new Error("Cloudinary is not configured");
  }

  const timestamp = Math.round(Date.now() / 1000).toString();
  const publicId = options.publicId || options.filename.replace(/\.[^.]+$/, "");
  const resourceType = options.resourceType || "raw";
  const signature = await buildSignature(
    { folder: options.folder, public_id: publicId, timestamp },
    config.apiSecret
  );

  const form = new FormData();
  form.append("file", new Blob([buffer]), options.filename);
  form.append("api_key", config.apiKey);
  form.append("timestamp", timestamp);
  form.append("signature", signature);
  form.append("folder", options.folder);
  form.append("public_id", publicId);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${config.cloudName}/${resourceType}/upload`,
    { method: "POST", body: form }
  );

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Cloudinary upload failed (${response.status}): ${details}`);
  }

  const data = (await response.json()) as {
    secure_url?: string;
    url?: string;
    public_id?: string;
    resource_type?: string;
  };
  const secureUrl = data.secure_url || data.url;
  if (!secureUrl) throw new Error("Cloudinary upload returned no URL");

  return {
    secureUrl,
    url: secureUrl,
    publicId: data.public_id || publicId,
    resourceType: data.resource_type || resourceType,
  };
};

export const buildThumbnailUrl = (originalUrl: string, width = 400): string => {
  if (!originalUrl.includes("cloudinary.com")) return originalUrl;
  return originalUrl.replace("/upload/", `/upload/q_auto,w_${width},f_webp/`);
};
