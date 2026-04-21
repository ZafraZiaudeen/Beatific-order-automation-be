import "dotenv/config";
import connectDB from "../infrastructure/db";
import Store from "../infrastructure/schemas/Store";
import { decryptLuluCredential } from "../infrastructure/lulu-credentials";

const CLEAR_FLAG = "--clear";
const clearOnFail = process.argv.includes(CLEAR_FLAG);

const main = async () => {
  await connectDB();

  const stores = await Store.find().lean().exec();
  console.log(`Found ${stores.length} stores`);

  for (const store of stores) {
    const id = String(store._id);
    const name = store.name || "<unnamed>";
    const apiKeyRaw = store.luluApiKey as string | null | undefined;
    const apiSecretRaw = store.luluApiSecret as string | null | undefined;

    if (!apiKeyRaw && !apiSecretRaw) {
      console.log(`[${id}] ${name}: no Lulu credentials`);
      continue;
    }

    try {
      const apiKey = decryptLuluCredential(apiKeyRaw);
      const apiSecret = decryptLuluCredential(apiSecretRaw);
      if (apiKey && apiSecret) {
        console.log(
          `[${id}] ${name}: decrypted ✅ (key len=${apiKey.length}, secret len=${apiSecret.length})`
        );
      } else {
        console.log(`[${id}] ${name}: decrypted but empty values`);
      }
    } catch (err) {
      console.error(
        `[${id}] ${name}: decrypt failed ❌ ${err instanceof Error ? err.message : String(err)}`
      );
      if (clearOnFail) {
        await Store.updateOne({ _id: id }, { $set: { luluApiKey: null, luluApiSecret: null } });
        console.log(`[${id}] ${name}: cleared lulu credentials in DB (set to null)`);
      }
    }
  }

  process.exit(0);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
