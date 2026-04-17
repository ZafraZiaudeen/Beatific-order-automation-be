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

export const getPresignedUploadUrl = async (folder: string) => {
  const config = getCloudinaryConfig();

  if (!config) {
    console.warn("Cloudinary not configured");
    return null;
  }

  const timestamp = Math.round(Date.now() / 1000);
  const crypto = await import("crypto");

  const signature = crypto
    .createHash("sha256")
    .update(`folder=${folder}&timestamp=${timestamp}${config.apiSecret}`)
    .digest("hex");

  return {
    url: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
    fields: {
      api_key: config.apiKey,
      timestamp: timestamp.toString(),
      signature,
      folder,
    },
  };
};

export const buildThumbnailUrl = (originalUrl: string, width = 400): string => {
  if (!originalUrl.includes("cloudinary.com")) return originalUrl;
  return originalUrl.replace("/upload/", `/upload/q_auto,w_${width},f_webp/`);
};
