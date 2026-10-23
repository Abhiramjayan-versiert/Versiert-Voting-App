import type { MetadataRoute } from "next";
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", allow: ["/", "/help", "/privacy", "/vote"], disallow: ["/admin", "/platform", "/college", "/account", "/e/", "/r/", "/api", "/invite", "/dev"] }] };
}
