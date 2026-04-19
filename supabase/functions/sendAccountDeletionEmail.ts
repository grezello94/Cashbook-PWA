import { serve } from "@supabase/functions";
import { readFileSync } from "fs";
import fetch from "node-fetch";

// Replace with your SendGrid API key
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = "no-reply@your-app-url.com";
const APP_NAME = "Cashbook PWA";

serve(async (req) => {
  const { email, token } = await req.json();
  if (!email || !token) {
    return new Response("Missing email or token", { status: 400 });
  }

  // Read and customize the HTML template
  let html = readFileSync("../email/accountDeletion.html", "utf8")
    .replace("YOUR_TOKEN_HERE", token)
    .replace(/your-app-url.com/g, req.headers.get("host") || "your-app-url.com");

  // Send email via SendGrid
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email }], subject: `Account Deletion Request – ${APP_NAME}` }],
      from: { email: FROM_EMAIL, name: APP_NAME },
      content: [{ type: "text/html", value: html }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    return new Response(`Failed to send email: ${error}`, { status: 500 });
  }

  return new Response("Email sent", { status: 200 });
});
