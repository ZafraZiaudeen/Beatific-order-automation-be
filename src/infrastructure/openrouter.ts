type AIReviewResult = {
  flags: string[];
  isClean: boolean;
};

// Returns 0-based index of best-matching variant, or null if no confident match.
export const matchVariantWithAI = async (
  variantNames: string[],
  variationText: string,
  productTitle: string
): Promise<number | null> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey || !variationText || variantNames.length === 0) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.FRONTEND_URL || "http://localhost:5173",
        "X-Title": "Beatific Order Automation",
      },
      body: JSON.stringify({
        model: "anthropic/claude-3-5-haiku",
        messages: [
          {
            role: "user",
            content: `Match this Etsy order variation to the correct product variant.

Product: ${productTitle}
Order variation: ${variationText}

Available variants:
${variantNames.map((n, i) => `${i + 1}. ${n}`).join("\n")}

Reply with ONLY the variant number (1, 2, 3…) that best matches, or 0 if none match. No explanation.`,
          },
        ],
        max_tokens: 5,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    if (!response.ok) return null;

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const answer = (data.choices?.[0]?.message?.content ?? "").trim();
    const idx = parseInt(answer, 10) - 1;
    return idx >= 0 && idx < variantNames.length ? idx : null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
};

export const reviewOrderPersonalization = async (
  personalization: Record<string, string>,
  productTitle: string
): Promise<AIReviewResult> => {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return { flags: [], isClean: true };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8s timeout

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.FRONTEND_URL || "http://localhost:5173",
        "X-Title": "Beatific Order Automation",
      },
      body: JSON.stringify({
        model: "anthropic/claude-3-5-haiku",
        messages: [
          {
            role: "system",
            content:
              "You are an order review assistant for a print-on-demand planner company. Analyze personalization fields and flag issues. Respond ONLY with valid JSON.",
          },
          {
            role: "user",
            content: `Product: ${productTitle}

Personalization fields:
${JSON.stringify(personalization, null, 2)}

Check for these issues:
1. Missing expected fields (name, year, start month for planners)
2. Spiral binding requested with spine text
3. References to external files or URLs
4. Custom artwork or design requests
5. Unusual or conflicting options

Respond with this exact JSON format:
{"flags": ["description of issue 1", "description of issue 2"], "isClean": true}

If no issues found, respond: {"flags": [], "isClean": true}
If issues found, set isClean to false.`,
          },
        ],
        max_tokens: 200,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.error("OpenRouter API error:", response.status);
      return { flags: ["AI review skipped (API error)"], isClean: true };
    }

    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      return { flags: [], isClean: true };
    }

    // Extract JSON from response (may have extra text)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { flags: [], isClean: true };
    }

    const result = JSON.parse(jsonMatch[0]) as AIReviewResult;
    return {
      flags: Array.isArray(result.flags) ? result.flags : [],
      isClean: Boolean(result.isClean),
    };
  } catch (err) {
    clearTimeout(timeout);
    if ((err as Error).name === "AbortError") {
      console.warn("OpenRouter timeout — skipping AI review");
    } else {
      console.error("OpenRouter error:", err);
    }
    return { flags: ["AI review skipped"], isClean: true };
  }
};
