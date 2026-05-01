import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { FlyerRadarModel } from "@/lib/models/FlyerRadar";
import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await connectToDatabase();
    
    const items = await FlyerRadarModel
      .find({ status: { $ne: 'archived' } })
      .sort({ createdAt: -1 })
      .lean();
    
    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error("FlyerRadar GET Error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await connectToDatabase();
    const body = await req.json();
    
    const { ticker, sector, signalSource, entryDate, entryPrice, targetPrice, stopLossPrice, relevanceScore, metadata } = body;
    
    if (!ticker || !entryPrice) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }
    
    const now = new Date();
    const existingItem = await FlyerRadarModel.findOne({ ticker });
    
    if (existingItem) {
      return NextResponse.json({ success: false, error: 'Ticker already in radar' }, { status: 409 });
    }
    
    const newItem = await FlyerRadarModel.create({
      ticker,
      sector: sector || null,
      signalSource: signalSource || 'SILENT FLYER',
      entryDate: entryDate ? new Date(entryDate) : now,
      entryPrice,
      targetPrice: targetPrice || entryPrice * 1.3,
      stopLossPrice: stopLossPrice || entryPrice * 0.95,
      currentPrice: entryPrice,
      relevanceScore: relevanceScore || 0,
      priceHistory: [{
        date: now,
        price: entryPrice
      }],
      metadata: metadata || {},
    });
    
    return NextResponse.json({ success: true, data: newItem }, { status: 201 });
  } catch (error) {
    console.error("FlyerRadar POST Error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    await connectToDatabase();
    const body = await req.json();
    const { ticker, action } = body;
    
    if (!ticker) {
      return NextResponse.json({ success: false, error: 'Missing ticker' }, { status: 400 });
    }
    
    if (action === 'updatePrice') {
      const item = await FlyerRadarModel.findOne({ ticker });
      if (!item) {
        return NextResponse.json({ success: false, error: 'Ticker not found' }, { status: 404 });
      }
      
      const quote = await yahooFinance.quote(item.ticker.replace('.JK', '') + '.JK') as any;
      const currentPrice = quote.regularMarketPrice || item.currentPrice;
      
      item.currentPrice = currentPrice;
      item.priceHistory.push({
        date: new Date(),
        price: currentPrice
      });
      
      const entryPrice = item.entryPrice;
      if (currentPrice >= item.targetPrice) {
        item.status = 'flying';
      } else if (currentPrice <= (item.stopLossPrice || entryPrice * 0.95)) {
        item.status = 'failed';
      } else {
        const changePct = ((currentPrice - entryPrice) / entryPrice) * 100;
        if (changePct > 5) {
          item.status = 'taking_off';
        } else {
          item.status = 'silent';
        }
      }
      
      await item.save();
      
      return NextResponse.json({ success: true, data: item });
    }
    
    // Sync all prices for all items
    if (action === 'syncAll') {
      const items = await FlyerRadarModel.find({ status: { $ne: 'archived' } });
      const updated = [];
      
      for (const item of items) {
        try {
          const quote = await yahooFinance.quote(item.ticker.replace('.JK', '') + '.JK') as any;
          const currentPrice = quote.regularMarketPrice || item.currentPrice;
          
          item.currentPrice = currentPrice;
          item.priceHistory.push({
            date: new Date(),
            price: currentPrice
          });
          
          const entryPrice = item.entryPrice;
          if (currentPrice >= item.targetPrice) {
            item.status = 'flying';
          } else if (currentPrice <= (item.stopLossPrice || entryPrice * 0.95)) {
            item.status = 'failed';
          } else {
            const changePct = ((currentPrice - entryPrice) / entryPrice) * 100;
            if (changePct > 5) {
              item.status = 'taking_off';
            } else {
              item.status = 'silent';
            }
          }
          
          await item.save();
          updated.push(item);
        } catch (e) {
          updated.push(item);
        }
      }
      
      return NextResponse.json({ success: true, data: updated, count: updated.length });
    }
    
    if (action === 'archive') {
      const item = await FlyerRadarModel.findOneAndUpdate(
        { ticker },
        { status: 'archived' },
        { new: true }
      );
      
      return NextResponse.json({ success: true, data: item });
    }
    
    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error("FlyerRadar PUT Error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get('ticker');
    
    if (!ticker) {
      return NextResponse.json({ success: false, error: 'Missing ticker' }, { status: 400 });
    }
    
    await FlyerRadarModel.deleteOne({ ticker });
    
    return NextResponse.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    console.error("FlyerRadar DELETE Error:", error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}