import axios, { AxiosInstance } from "axios";
import ValidationError from "../domain/errors/validation-error";


export type LuluCredentials = {
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
};

const sanitize = (value?: string | null): string => (value || "").trim();
const normalizeBaseUrl = (value: string): string => value.replace(/\/+$/, "");

const normalizeCredentials = (credentials: LuluCredentials): LuluCredentials => ({
  apiKey: sanitize(credentials.apiKey),
  apiSecret: sanitize(credentials.apiSecret),
  baseUrl: normalizeBaseUrl(sanitize(credentials.baseUrl) || "https://api.sandbox.lulu.com"),
});

const getEnvCredentials = (): LuluCredentials | null => {
  const key = sanitize(process.env.LULU_API_KEY);
  const secret = sanitize(process.env.LULU_API_SECRET);
  const base = sanitize(process.env.LULU_API_BASE_URL) || "https://api.sandbox.lulu.com";
  if (!key || !secret) return null;
  return { apiKey: key, apiSecret: secret, baseUrl: normalizeBaseUrl(base) };
};


type TokenCache = { accessToken: string; expiresAt: number };
const tokenCacheMap = new Map<string, TokenCache>();

const getAccessToken = async (creds: LuluCredentials): Promise<string> => {
  const cached = tokenCacheMap.get(creds.apiKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.accessToken;

  const tokenUrl = `${creds.baseUrl}/auth/realms/glasstree/protocol/openid-connect/token`;
  const params = new URLSearchParams();
  params.append("grant_type", "client_credentials");
  params.append("client_id", creds.apiKey);
  params.append("client_secret", creds.apiSecret);

  let data: { access_token: string; expires_in: number };
  try {
    const response = await axios.post<{ access_token: string; expires_in: number }>(
      tokenUrl,
      params,
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    data = response.data;
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const responseData = err.response?.data as { error_description?: string } | undefined;
      const details = responseData?.error_description;

      if (err.response?.status === 401) {
        console.error(`[Lulu] Auth failed. Token URL: ${tokenUrl} | Error: ${details || "no detail"}`);
        const message = details
          ? `Lulu authentication failed: ${details}. Token URL used: ${tokenUrl}. Check API key/secret and environment (sandbox vs production).`
          : `Lulu authentication failed. Token URL used: ${tokenUrl}. Check API key/secret and environment (sandbox vs production).`;
        throw new ValidationError(message);
      }

      if (typeof err.response?.status === "number") {
        throw new Error(`Lulu token request failed with status ${err.response.status}`);
      }
      throw new Error(`Lulu token request failed: ${err.message}`);
    }
    throw err;
  }

  tokenCacheMap.set(creds.apiKey, {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });

  return data.access_token;
};


const makeClient = (baseUrl: string): AxiosInstance =>
  axios.create({ baseURL: baseUrl, headers: { "Content-Type": "application/json" }, timeout: 30000 });

const isLuluAuthValidationError = (err: unknown): err is ValidationError =>
  err instanceof ValidationError && err.message.toLowerCase().startsWith("lulu authentication failed");

const withAuth = async <T>(
  fn: (token: string, client: AxiosInstance) => Promise<T>,
  credentialsOverride?: LuluCredentials
): Promise<T | null> => {
  const candidateCreds: LuluCredentials[] = [];
  const envCreds = getEnvCredentials();

  if (credentialsOverride) {
    const normalizedOverride = normalizeCredentials(credentialsOverride);
    if (normalizedOverride.apiKey && normalizedOverride.apiSecret) {
      candidateCreds.push(normalizedOverride);
    }
  }

  if (envCreds) {
    const normalizedEnv = normalizeCredentials(envCreds);
    const hasSameCredsAsOverride = candidateCreds.some(
      (creds) =>
        creds.apiKey === normalizedEnv.apiKey &&
        creds.apiSecret === normalizedEnv.apiSecret &&
        creds.baseUrl === normalizedEnv.baseUrl
    );
    if (!hasSameCredsAsOverride) candidateCreds.push(normalizedEnv);
  }

  if (!candidateCreds.length) return null;

  let lastAuthError: ValidationError | null = null;

  for (const creds of candidateCreds) {
    const client = makeClient(creds.baseUrl);

    try {
      let token = await getAccessToken(creds);

      try {
        return await fn(token, client);
      } catch (err: unknown) {
        if (axios.isAxiosError(err) && err.response?.status === 401) {
          tokenCacheMap.delete(creds.apiKey);
          token = await getAccessToken(creds);
          try {
            return await fn(token, client);
          } catch (retryErr: unknown) {
            if (axios.isAxiosError(retryErr) && retryErr.response?.status === 401) {
              const env = creds.baseUrl.includes("sandbox") ? "sandbox" : "production";
              console.error(
                `[Lulu] 401 on ${retryErr.config?.url} after token refresh. ` +
                `Base URL: ${creds.baseUrl} (${env}). ` +
                `Verify your ${env} API key/secret matches the ${env} environment.`
              );
              throw new ValidationError(
                `Lulu rejected the request (401 Unauthorized). ` +
                `This usually means your API credentials are for a different environment. ` +
                `Base URL in use: ${creds.baseUrl}. Check that your Lulu API key/secret match this environment (sandbox vs production).`
              );
            }
            throw retryErr;
          }
        }
        throw err;
      }
    } catch (err: unknown) {
      if (isLuluAuthValidationError(err)) {
        lastAuthError = err;
        continue;
      }
      throw err;
    }
  }

  if (lastAuthError) throw lastAuthError;
  return null;
};

export const normalizeAssetUrl = (url: string): string => {
  if (!url) return url;
  const gdMatch = url.match(/drive\.google\.com\/file\/d\/([^/?\s]+)/);
  if (gdMatch) return `https://drive.google.com/uc?export=download&id=${gdMatch[1]}`;
  return url;
};

// Maps full country names (as exported by Etsy) to ISO 3166-1 alpha-2 codes.
// Lulu rejects anything that isn't a 2-letter code.
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  "united states": "US",
  "united states of america": "US",
  "canada": "CA",
  "united kingdom": "GB",
  "great britain": "GB",
  "australia": "AU",
  "germany": "DE",
  "france": "FR",
  "netherlands": "NL",
  "italy": "IT",
  "spain": "ES",
  "sweden": "SE",
  "norway": "NO",
  "denmark": "DK",
  "finland": "FI",
  "switzerland": "CH",
  "austria": "AT",
  "belgium": "BE",
  "ireland": "IE",
  "new zealand": "NZ",
  "japan": "JP",
  "mexico": "MX",
  "brazil": "BR",
  "india": "IN",
  "singapore": "SG",
  "hong kong": "HK",
  "south korea": "KR",
  "korea": "KR",
  "israel": "IL",
  "south africa": "ZA",
  "portugal": "PT",
  "poland": "PL",
  "czech republic": "CZ",
  "czechia": "CZ",
  "hungary": "HU",
  "romania": "RO",
  "greece": "GR",
  "turkey": "TR",
  "ukraine": "UA",
  "russia": "RU",
  "china": "CN",
  "taiwan": "TW",
  "thailand": "TH",
  "indonesia": "ID",
  "malaysia": "MY",
  "philippines": "PH",
  "argentina": "AR",
  "colombia": "CO",
  "chile": "CL",
  "peru": "PE",
  "united arab emirates": "AE",
  "uae": "AE",
  "saudi arabia": "SA",
  "egypt": "EG",
  "nigeria": "NG",
  "kenya": "KE",
};

export const normalizeCountryCode = (country: string): string => {
  if (!country) return "US";
  const trimmed = country.trim();
  if (/^[A-Z]{2}$/.test(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  return COUNTRY_NAME_TO_CODE[lower] ?? trimmed.substring(0, 2).toUpperCase();
};


export type LuluPrintJobPayload = {
  externalId: string;
  podPackageId: string;
  coverUrl: string;
  interiorUrl: string;
  quantity: number;
  shippingLevel: string;
  shippingAddress: {
    name: string;
    street1: string;
    street2?: string;
    city: string;
    state: string;
    zip: string;
    country: string;
    phone?: string;
  };
  contactEmail: string;
  credentials?: LuluCredentials;
};

export type LuluPrintJobResponse = {
  id: string;
  status: { name: string };
  line_items: Array<{ tracking_numbers?: string[] }>;
};


export const createPrintJob = async (
  payload: LuluPrintJobPayload
): Promise<LuluPrintJobResponse | null> => {
  return withAuth(async (token, client) => {
    const body = {
      external_id: String(payload.externalId),
      line_items: [
        {
          pod_package_id: payload.podPackageId,
          quantity: payload.quantity,
          interior: { source_url: normalizeAssetUrl(payload.interiorUrl) },
          cover: { source_url: normalizeAssetUrl(payload.coverUrl) },
        },
      ],
      shipping_address: {
        name: payload.shippingAddress.name,
        street1: payload.shippingAddress.street1,
        street2: payload.shippingAddress.street2 || "",
        city: payload.shippingAddress.city,
        state_code: payload.shippingAddress.state,
        postcode: String(payload.shippingAddress.zip),
        country_code: normalizeCountryCode(payload.shippingAddress.country),
        phone_number: payload.shippingAddress.phone || "",
      },
      shipping_level: payload.shippingLevel || "MAIL",
      contact_email: payload.contactEmail,
    };

    const { data } = await client.post<LuluPrintJobResponse>("/print-jobs/", body, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  }, payload.credentials);
};

export const getPrintJobStatus = async (
  jobId: string,
  credentials?: LuluCredentials
): Promise<LuluPrintJobResponse | null> => {
  return withAuth(async (token, client) => {
    const { data } = await client.get<LuluPrintJobResponse>(`/print-jobs/${jobId}/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  }, credentials);
};

export const buildThumbnailUrl = (originalUrl: string, width = 400): string => {
  if (!originalUrl.includes("cloudinary.com")) return originalUrl;
  return originalUrl.replace("/upload/", `/upload/q_auto,w_${width},f_webp/`);
};
