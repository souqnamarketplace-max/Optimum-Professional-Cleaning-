import { useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "../api/supabaseClient";

// Authorization-code flow (not the implicit "token" flow) is required to
// get a refresh token back from Google at all — the implicit flow used
// previously only ever returns a short-lived access token with no way to
// renew it without showing the popup again.
const GMAIL_SCOPE =
  "https://www.googleapis.com/auth/gmail.send " +
  "https://www.googleapis.com/auth/userinfo.email " +
  "openid";

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

  const utf8Bytes = new TextEncoder().encode(raw);
  let binaryString = "";
  utf8Bytes.forEach((byte) => {
    binaryString += String.fromCharCode(byte);
  });

  return btoa(binaryString)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const FUNCTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

async function callEdgeFunction(name, body) {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error("You're not logged in.");

  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok && data.connected !== false) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export function useGmailSend() {
  const [connectedEmail, setConnectedEmail] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");
  const accessTokenRef = useRef("");
  const tokenExpiryRef = useRef(0);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  // For popup mode, Google's library defaults redirect_uri to the page's
  // *origin* (no path) — per Google's own docs: "the value of redirect_uri
  // defaults to the origin of the page that calls initCodeClient." We pass
  // it explicitly here only so the exact same value can be reused in the
  // token-exchange call on the backend; it must be the bare origin, not
  // origin+pathname, or the token exchange will reject it as mismatched.
  const redirectUri = window.location.origin;

  // Silently checks for (and refreshes) an existing server-side connection
  // on load — this is what makes the connection survive a closed tab or a
  // new day, with no popup, no clicking anything.
  const silentRefresh = useCallback(async () => {
    setChecking(true);
    try {
      const data = await callEdgeFunction("gmail-oauth-refresh");
      if (data.connected === false) {
        setIsConnected(false);
        setConnectedEmail("");
        if (data.error) setError(data.error);
        return false;
      }
      accessTokenRef.current = data.access_token;
      tokenExpiryRef.current = Date.now() + (data.expires_in || 3600) * 1000;
      setConnectedEmail(data.email);
      setIsConnected(true);
      setError("");
      return true;
    } catch (err) {
      // A failed check just means "not connected yet" in the common case
      // (e.g. brand new user, function not deployed yet) — don't show this
      // as an alarming error on every page load.
      setIsConnected(false);
      setConnectedEmail("");
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    silentRefresh();
  }, [silentRefresh]);

  const disconnect = useCallback(async () => {
    try {
      await callEdgeFunction("gmail-oauth-disconnect");
    } catch (err) {
      // Even if the remote revoke call fails, clear local state so the UI
      // doesn't get stuck showing "Connected" when the person asked to stop.
    }
    accessTokenRef.current = "";
    tokenExpiryRef.current = 0;
    setIsConnected(false);
    setConnectedEmail("");
  }, []);

  const connect = useCallback(async () => {
    if (!clientId) {
      setError(
        "Gmail isn't configured yet — VITE_GOOGLE_CLIENT_ID is missing. See GMAIL_SETUP_GUIDE.md."
      );
      return;
    }
    setError("");
    setConnecting(true);
    try {
      await loadGoogleScript();

      const code = await new Promise((resolve, reject) => {
        const codeClient = window.google.accounts.oauth2.initCodeClient({
          client_id: clientId,
          scope: GMAIL_SCOPE,
          ux_mode: "popup",
          // access_type=offline + prompt=consent together are what make
          // Google actually issue a refresh token on this consent, even
          // for an account that connected before under the old flow.
          access_type: "offline",
          prompt: "consent",
          redirect_uri: redirectUri,
          callback: (response) => {
            if (response.error) {
              reject(new Error(response.error_description || response.error));
              return;
            }
            resolve(response.code);
          },
        });
        codeClient.requestCode();
      });

      const data = await callEdgeFunction("gmail-oauth-exchange", { code, redirectUri });
      accessTokenRef.current = data.access_token;
      tokenExpiryRef.current = Date.now() + (data.expires_in || 3600) * 1000;
      setConnectedEmail(data.email);
      setIsConnected(true);
    } catch (err) {
      setError(err.message || "Could not connect Gmail.");
    } finally {
      setConnecting(false);
    }
  }, [clientId, redirectUri]);

  const ensureFreshToken = useCallback(async () => {
    if (accessTokenRef.current && Date.now() < tokenExpiryRef.current - 60_000) {
      return accessTokenRef.current; // still valid for at least another minute
    }
    const ok = await silentRefresh();
    if (!ok) throw new Error("Gmail isn't connected. Click Connect Gmail in Settings first.");
    return accessTokenRef.current;
  }, [silentRefresh]);

  const sendEmail = useCallback(
    async ({ to, subject, bodyText, pdfBlob, pdfFilename }) => {
      const token = await ensureFreshToken();
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
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw }),
        }
      );

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error?.message || `Gmail send failed (${res.status})`);
      }
      return res.json();
    },
    [connectedEmail, ensureFreshToken]
  );

  return {
    isConnected,
    connectedEmail,
    connecting,
    checking,
    error,
    connect,
    disconnect,
    sendEmail,
  };
}
