export const notifySlack = async (title: string, lines: string[]) => {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;

  if (!webhookUrl) {
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: [title, ...lines].join("\n"),
      }),
    });
  } catch (error) {
    console.error("Failed to notify Slack", error);
  }
};
