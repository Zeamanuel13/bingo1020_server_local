const { Schema, model } = require('mongoose');

// Reference collection mirroring the player app's bundled assets/data.json - lets the
// Admin app look up a card's number layout during disputes without needing that file.
const cartelaSchema = new Schema(
  {
    cartelaNo: { type: Number, required: true, unique: true }, // 0-25999
    bingoNumbers: { type: [Number], required: true }, // 24 numbers, free space is implicit
  },
  { timestamps: false }
);

module.exports = model('Cartela', cartelaSchema);
