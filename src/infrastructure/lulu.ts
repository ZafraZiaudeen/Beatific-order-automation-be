type SubmitLuluOrderInput = {
  externalId: string;
  recipient: {
    name: string;
    email: string;
  };
  product: {
    podPackageId: string;
    coverUrl: string;
    interiorUrl?: string;
    quantity: number;
  };
};

type LuluSubmissionResult = {
  externalId: string;
  status: string;
  submittedAt: Date;
};

const integrationConfigured = () =>
  Boolean(process.env.LULU_API_BASE_URL && process.env.LULU_API_KEY && process.env.LULU_API_SECRET);

export const submitOrderToLulu = async (
  input: SubmitLuluOrderInput
): Promise<LuluSubmissionResult | null> => {
  if (!integrationConfigured()) {
    return null;
  }

  console.log("Lulu integration requested for order", input.externalId);

  return {
    externalId: input.externalId,
    status: "submitted",
    submittedAt: new Date(),
  };
};

export const getLuluOrderStatus = async (externalId: string) => {
  if (!integrationConfigured()) {
    return null;
  }

  console.log("Polling Lulu status for order", externalId);
  return null;
};
