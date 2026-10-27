"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const BODY = `{
    "content": "Site visits open this Sunday!",
    "channelIds": ["ch_123"],
    "scheduledAt": "2026-11-01T04:30:00Z"
  }`;

const EXAMPLES: Record<string, string> = {
  cURL: `curl https://api.prasaar.in/v1/posts \\
  -H "Authorization: Bearer pk_live_YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${BODY}'`,
  "Node.js": `const res = await fetch("https://api.prasaar.in/v1/posts", {
  method: "POST",
  headers: {
    Authorization: "Bearer pk_live_YOUR_KEY",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    content: "Site visits open this Sunday!",
    channelIds: ["ch_123"],
    scheduledAt: "2026-11-01T04:30:00Z",
  }),
});
console.log(await res.json());`,
  Python: `import requests

res = requests.post(
    "https://api.prasaar.in/v1/posts",
    headers={"Authorization": "Bearer pk_live_YOUR_KEY"},
    json={
        "content": "Site visits open this Sunday!",
        "channelIds": ["ch_123"],
        "scheduledAt": "2026-11-01T04:30:00Z",
    },
)
print(res.json())`,
  PHP: `<?php
$ch = curl_init("https://api.prasaar.in/v1/posts");
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        "Authorization: Bearer pk_live_YOUR_KEY",
        "Content-Type: application/json",
    ],
    CURLOPT_POSTFIELDS => json_encode([
        "content" => "Site visits open this Sunday!",
        "channelIds" => ["ch_123"],
        "scheduledAt" => "2026-11-01T04:30:00Z",
    ]),
]);
echo curl_exec($ch);`,
};

export function CodeExamples() {
  const [lang, setLang] = useState("cURL");
  const code = EXAMPLES[lang];
  return (
    <div className="overflow-hidden rounded-xl border">
      <div className="flex items-center justify-between gap-2 border-b bg-background px-2">
        <div className="flex overflow-x-auto" role="tablist" aria-label="Language">
          {Object.keys(EXAMPLES).map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={l === lang}
              onClick={() => setLang(l)}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-3 py-3 text-sm transition-colors",
                l === lang ? "border-brand font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(code);
              toast.success("Copied");
            } catch {
              toast.error("Couldn't copy. Select the code and copy it instead.");
            }
          }}
          className="flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Copy className="size-4" /> Copy
        </button>
      </div>
      <pre className="overflow-x-auto bg-zinc-950 p-5 text-[13px] leading-relaxed text-zinc-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}
