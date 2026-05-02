import { NextResponse } from "next/server";
import Parser from "rss-parser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const parser = new Parser({
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/rss+xml, application/xml, text/xml, */*"
  },
  timeout: 10000,
});

const SOURCES = [
  { name: "Antara Ekonomi", url: "https://www.antaranews.com/rss/ekonomi.xml" },
  { name: "CNN Ekonomi", url: "https://www.cnnindonesia.com/ekonomi/rss" },
  { name: "CNBC Market", url: "https://www.cnbcindonesia.com/market/rss" }
];

export async function GET() {
  const allNews: any[] = [];
  const errors: string[] = [];

  // Fetch all sources in parallel
  const fetchPromises = SOURCES.map(async (source) => {
    try {
      const feed = await parser.parseURL(source.url);
      if (feed && feed.items) {
        return feed.items.map(item => ({
          title: `[${source.name.split(' ')[0]}] ${item.title}`,
          link: item.link,
          date: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        }));
      }
      return [];
    } catch (error: any) {
      console.error(`Error fetching from ${source.name}:`, error.message);
      errors.push(`${source.name}: ${error.message}`);
      return [];
    }
  });

  const results = await Promise.all(fetchPromises);
  results.forEach(items => allNews.push(...items));

  // Sort by date (newest first)
  allNews.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // If no news from RSS, use Yahoo Fallback
  if (allNews.length === 0) {
    try {
      const YahooFinance = (await import('yahoo-finance2')).default;
      const yahooFinance = new YahooFinance();
      const result = await yahooFinance.search("saham IHSG", { newsCount: 15 });
      
      const yahooNews = result.news.map((item: any) => ({
        title: `[Yahoo] ${item.title}`,
        link: item.link,
        date: item.providerPublishTime ? new Date(item.providerPublishTime * 1000).toISOString() : new Date().toISOString(),
      }));

      return NextResponse.json({ 
          success: true, 
          source: "Yahoo Fallback", 
          data: yahooNews 
      });
    } catch (e: any) {
      return NextResponse.json({ 
          success: false, 
          error: "All news sources failed", 
          details: errors.concat(e.message),
          data: [] 
      }, { status: 500 });
    }
  }

  return NextResponse.json({ 
    success: true, 
    source: "Multi-Source RSS",
    data: allNews.slice(0, 25) 
  });
}
