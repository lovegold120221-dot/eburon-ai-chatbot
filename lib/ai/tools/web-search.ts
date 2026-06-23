import { tool } from "ai";
import { z } from "zod";

async function searchWeb(query: string): Promise<{
  results: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  answer?: string;
}> {
  try {
    // Use DuckDuckGo's HTML endpoint for free search
    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      }
    );

    if (!response.ok) {
      return { results: [] };
    }

    const html = await response.text();

    // Parse results from HTML
    const results: Array<{ title: string; url: string; snippet: string }> = [];

    // Simple regex to extract results from DuckDuckGo HTML
    const resultRegex =
      /<a class="result__url" href="([^"]+)">([^<]+)<\/a>.*?<a class="result__snippet" href="[^"]*">([^<]+)<\/a>/gs;
    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < 5) {
      results.push({
        title: match[2].trim(),
        url: match[1].startsWith("http") ? match[1] : `https://${match[1]}`,
        snippet: match[3].trim(),
      });
    }

    // Also try to get instant answer
    const instantAnswerRegex = /<div class="module__body">([^<]+)<\/div>/;
    const instantMatch = html.match(instantAnswerRegex);
    const answer = instantMatch ? instantMatch[1].trim() : undefined;

    return { results, answer };
  } catch {
    return { results: [] };
  }
}

export const webSearch = tool({
  description:
    "Search the web for current information, news, prices, or any real-time data. Use this when you need up-to-date information that you don't know.",
  inputSchema: z.object({
    query: z
      .string()
      .describe("Search query (e.g., 'bitcoin price today', 'latest AI news', 'weather in Tokyo')"),
  }),
  execute: async (input) => {
    const { results, answer } = await searchWeb(input.query);

    if (results.length === 0) {
      return {
        error: "No search results found. Try a different query.",
      };
    }

    return {
      query: input.query,
      answer,
      results: results.map((r, i) => ({
        index: i + 1,
        title: r.title,
        url: r.url,
        snippet: r.snippet,
      })),
    };
  },
});