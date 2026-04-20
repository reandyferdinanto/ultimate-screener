import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

async function test() {
  try {
    const quotes = await yahooFinance.quote(['GOTO.JK', 'BBCA.JK', 'TLKM.JK']);
    quotes.forEach(q => {
      // @ts-ignore
      console.log(`${q.symbol}: change: ${q.regularMarketChangePercent}%`);
    });
  } catch (e) {
    console.error(e);
  }
}
test();