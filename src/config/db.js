const mongoose = require("mongoose");
const { MONGO_URI, DEPLOY_MODE } = require("./env");

let connected = false;

async function connectDb() {
	mongoose.set("strictQuery", true);
	await mongoose.connect(MONGO_URI);
	connected = true;
	// Cloud mode: never print the connection string - it contains the Atlas username
	// and password, and cloud logs (e.g. Render's) aren't as private as a local terminal.
	console.log(DEPLOY_MODE === "cloud" ? "[db] connected successfully" : `[db] connected to ${MONGO_URI}`);
}

function isDbConnected() {
	return connected && mongoose.connection.readyState === 1;
}

module.exports = { connectDb, isDbConnected };
