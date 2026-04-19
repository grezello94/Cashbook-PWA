import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")
const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY")
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || ""
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record

    if (payload.type !== "INSERT" || !record || !record.target_user_id) {
      return new Response("Ignored: Not an access request insert", { status: 200 })
    }

    const { data: userData, error: userError } = await supabaseAdmin.auth.admin.getUserById(record.target_user_id)
    if (userError || !userData?.user) {
      console.error("User not found:", userError)
      return new Response("User not found", { status: 200 })
    }

    const email = userData.user.email
    const phone = userData.user.phone

    let emailSent = false
    let smsSent = false

    if (email) {
      if (RESEND_API_KEY) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "Cashbook <invites@yourdomain.com>",
            to: [email],
            subject: "You've been invited to a Cashbook Workspace",
            html: `
              <div style="font-family: sans-serif; padding: 20px;">
                <h2>Workspace Invitation</h2>
                <p>Hi there,</p>
                <p>You have been invited to join a workspace on Cashbook.</p>
                <p><strong>Role:</strong> ${record.role === 'admin' ? 'Admin' : 'Editor'}</p>
                <br/>
                <a href="https://your-cashbook-url.com" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Log in to Accept Request
                </a>
              </div>
            `,
          }),
        })
        emailSent = true
      } else if (SENDGRID_API_KEY) {
        await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${SENDGRID_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email }], subject: "You've been invited to a Cashbook Workspace" }],
            from: { email: "no-reply@yourdomain.com", name: "Cashbook" },
            content: [{ type: "text/html", value: `
              <div style="font-family: sans-serif; padding: 20px;">
                <h2>Workspace Invitation</h2>
                <p>Hi there,</p>
                <p>You have been invited to join a workspace on Cashbook.</p>
                <p><strong>Role:</strong> ${record.role === 'admin' ? 'Admin' : 'Editor'}</p>
                <br/>
                <a href="https://your-cashbook-url.com" style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                  Log in to Accept Request
                </a>
              </div>
            ` }]
          })
        })
        emailSent = true
      } else {
        console.log(\`Simulating email invite to \${email}\`)
        emailSent = true
      }
    }

    if (phone) {
      console.log(\`Simulating SMS invite to \${phone}\`)
      smsSent = true
    }

    return new Response(JSON.stringify({ success: true, emailSent, smsSent }), { 
      status: 200,
      headers: { "Content-Type": "application/json" }
    })
  } catch (err) {
    console.error("Function error:", err)
    return new Response(String(err), { status: 500 })
  }
})
