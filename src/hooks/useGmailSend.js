import { useState, useCallback, useRef } from "react";

// Gmail API scope needed to send mail as the connected account.
// "gmail.send" is deliberately narrow — it can only send messages, it
// cannot read the inbox, contacts, or anything else in the account.
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.send";

const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google script")));
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google script"));
    document.head.appendChild(script);
  });
}

// Builds a base64url-encoded raw RFC 2822 email with a single PDF
// attachment, in the format the Gmail API's messages.send expects.
async function buildRawEmail({ to, from, subject, bodyText, pdfBlob, pdfFilename }) {
  const pdfBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(pdfBlob);
  });

  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ].join("\r\n");

  const textPart = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    "",
    bodyText,
  ].join("\r\n");

  const attachmentPart = [
    `--${boundary}`,
    `Content-Type: application/pdf; name="${pdfFilename}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${pdfFilename}"`,
    "",
    pdfBase64,
  ].join("\r\n");

  const raw = `${headers}\r\n\r\n${textPart}\r\n${attachmentPart}\r\n--${boundary}--`;

  // btoa() only accepts Latin1 — if a client's name or address has an
  // accented character (e.g. "Café", "Côte"), btoa would throw
  // InvalidCharacterError. Encoding to UTF-8 bytes first avoids that.
  const utf8Bytes = new TextEncoder().encode(raw);
  let binaryString = "";
  utf8Bytes.forEach((byte) => {
    binaryString += String.fromCharCode(byte);
  });

  // Gmail API requires base64url (no padding, - and _ instead of + and /)
  return btoa(binaryString)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function useGmailSend() {
  const [connectedEmail, setConnectedEmail] = useState(
    () => sessionStorage.getItem("gmail_connected_email") || ""
  );
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");
  const tokenClientRef = useRef(null);
  const accessTokenRef = useRef(sessionStorage.getItem("gmail_access_token") || "");
  const tokenExpiryRef = useRef(Number(sessionStorage.getItem("gmail_token_expiry") || 0));

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const isConnected = Boolean(connectedEmail) && Date.now() < tokenExpiryRef.current;

  // The token is intentionally kept in sessionStorage, not localStorage or
  // a database — it's a short-lived (~1hr) Gmail send-only credential.
  // Persisting it longer/server-side would mean storing a credential that
  // can send email as the customer, which isn't something this app should
  // hold onto past the current browser session.
  const persistToken = (token, email, expiresInSeconds) => {
    const expiry = Date.now() + expiresInSeconds * 1000;
    accessTokenRef.current = token;
    tokenExpiryRef.current = expiry;
    sessionStorage.setItem("gmail_access_token", token);
    sessionStorage.setItem("gmail_token_expiry", String(expiry));
    sessionStorage.setItem("gmail_connected_email", email);
    setConnectedEmail(email);
  };

  const disconnect = () => {
    accessTokenRef.current = "";
    tokenExpiryRef.current = 0;
    sessionStorage.removeItem("gmail_access_token");
    sessionStorage.removeItem("gmail_token_expiry");
    sessionStorage.removeItem("gmail_connected_email");
    setConnectedEmail("");
  };

  const connect = useCallback(async () => {
    if (!clientId) {
      setError(
        "Gmail isn't configured yet — VITE_GOOGLE_CLIENT_ID is missing. See SETUP_GUIDE.md."
      );
      return;
    }
    setError("");
    setConnecting(true);
    try {
      await loadGoogleScript();

      await new Promise((resolve, reject) => {
        const tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: GMAIL_SCOPE,
          callback: async (response) => {
            if (response.error) {
              reject(new Error(response.error_description || response.error));
              return;
            }
            try {
              // Fetch the connected account's email address so we can show
              // "Connected as you@gmail.com" and use it as the From address.
              const profileRes = await fetch(
                "https://www.googleapis.com/oauth2/v2/userinfo",
                { headers: { Authorization: `Bearer ${response.access_token}` } }
              );
              const profile = await profileRes.json();
              persistToken(response.access_token, profile.email, response.expires_in || 3600);
              resolve();
            } catch (err) {
              reject(err);
            }
          },
        });
        tokenClientRef.current = tokenClient;
        tokenClient.requestAccessToken({ prompt: "consent" });
      });
    } catch (err) {
      setError(err.message || "Could not connect Gmail.");
    } finally {
      setConnecting(false);
    }
  }, [clientId]);

  const sendEmail = useCallback(
    async ({ to, subject, bodyText, pdfBlob, pdfFilename }) => {
      if (!isConnected) {
        throw new Error("Gmail isn't connected. Click Connect Gmail in Settings first.");
      }
      const raw = await buildRawEmail({
        to,
        from: connectedEmail,
        subject,
        bodyText,
        pdfBlob,
        pdfFilename,
      });

      const res = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessTokenRef.current}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw }),
        }
      );

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          errBody.error?.message || `Gmail send failed (${res.status})`
        );
      }
      return res.json();
    },
    [isConnected, connectedEmail]
  );

  return {
    isConnected,
    connectedEmail,
    connecting,
    error,
    connect,
    disconnect,
    sendEmail,
  };
}
