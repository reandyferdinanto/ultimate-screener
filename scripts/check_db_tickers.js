const mongoose = require('mongoose');
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/ultimate-screener";

async function checkDb() {
    await mongoose.connect(MONGODB_URI);
    const StockSignal = mongoose.model('StockSignal', new mongoose.Schema({
        ticker: String,
        signalSource: String,
        status: String
    }));

    const mina = await StockSignal.findOne({ ticker: 'MINA.JK' });
    const dsfi = await StockSignal.findOne({ ticker: 'DSFI.JK' });

    console.log("MINA.JK in DB:", mina ? JSON.stringify(mina) : "NOT FOUND");
    console.log("DSFI.JK in DB:", dsfi ? JSON.stringify(dsfi) : "NOT FOUND");

    await mongoose.disconnect();
}

checkDb();
