import axios, { AxiosInstance } from "axios";

type TokenCache = {
  accessToken: string;
  expiresAt: number;
};

let tokenCache: TokenCache | null = null;

const getLuluAxios = (): AxiosInstance => {
  return axios.create({
    baseURL: process.env.LULU_API_BASE_URL || "https://api.sandbox.lulu.com",
    headers: { "Content-Type": "application/json" },
    timeout: 30000,
  });
};

const isConfigured = () =>
  Boolean(process.env.LULU_API_BASE_URL && process.env.LULU_API_KEY && process.env.LULU_API_SECRET);

export const getAccessToken = async (): Promise<string | null> => {
  if (!isConfigured()) return null;

  // Return cached token if still valid (with 60s buffer)
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.accessToken;
  }

  const tokenUrl = `${process.env.LULU_API_BASE_URL}/auth/realms/glasstree/protocol/openid-connect/token`;

  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", process.env.LULU_API_KEY!);
  params.append("client_secret", process.env.LULU_API_SECRET!);

  const response = await axios.post<{ access_token: string; expires_in: number }>(tokenUrl, params, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const { access_token, expires_in } = response.data;
  tokenCache = {
    accessToken: access_token,
    expiresAt: Date.now() + expires_in * 1000,
  };

  return access_token;
};

export type LuluPrintJobPayload = {
  externalId: string;
  title: string;
  podPackageId: string;
  coverUrl: string;
  interiorUrl: string;
  quantity: number;
  shippingAddress: {
    name: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  contactEmail: string;
};

export type LuluPrintJobResponse = {
  id: string;
  status: { name: string };
  line_items: Array<{ tracking_numbers?: string[] }>;
};

const withAuth = async <T>(fn: (token: string, client: AxiosInstance) => Promise<T>): Promise<T | null> => {
  if (!isConfigured()) return null;

  const client = getLuluAxios();
  let token = await getAccessToken();
  if (!token) return null;

  try {
    return await fn(token, client);
  } catch (err: unknown) {
    // On 401, force token refresh and retry once
    if (axios.isAxiosError(err) && err.response?.status === 401) {
      tokenCache = null;
      token = await getAccessToken();
      if (!token) return null;
      return await fn(token, client);
    }
    throw err;
  }
};

export const createPrintJob = async (payload: LuluPrintJobPayload): Promise<LuluPrintJobResponse | null> => {
  return withAuth(async (token, client) => {
    const luluPayload = {
      external_id: payload.externalId,
      line_items: [
        {
          title: payload.title,
          cover: payload.coverUrl,
          interior: payload.interiorUrl,
          pod_package_id: payload.podPackageId,
          quantity: payload.quantity,
        },
      ],
      shipping_address: {
        name: payload.shippingAddress.name,
        street1: payload.shippingAddress.street1,
        street2: payload.shippingAddress.street2 || "",
        city: payload.shippingAddress.city,
        state_code: payload.shippingAddress.state,
        postcode: payload.shippingAddress.zip,
        country_code: payload.shippingAddress.country || "US",
        phone_number: "",
      },
      contact_email: payload.contactEmail,
      production_delay: 120,
    };

    const response = await client.post<LuluPrintJobResponse>("/print-jobs/", luluPayload, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  });
};

export const getPrintJobStatus = async (jobId: string): Promise<LuluPrintJobResponse | null> => {
  return withAuth(async (token, client) => {
    const response = await client.get<LuluPrintJobResponse>(`/print-jobs/${jobId}/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  });
};

export const buildThumbnailUrl = (originalUrl: string, width = 400): string => {
  if (!originalUrl.includes("cloudinary.com")) return originalUrl;
  return originalUrl.replace("/upload/", `/upload/q_auto,w_${width},f_webp/`);
};
