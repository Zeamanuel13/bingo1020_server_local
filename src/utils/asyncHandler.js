// Express doesn't catch rejected promises thrown inside async route handlers - left
// unwrapped, a single bad request (e.g. a malformed ObjectId causing a CastError) becomes
// an uncaught rejection that crashes the whole Node process, taking the shop's entire
// system down mid-game. Wrapping every handler funnels errors to the error middleware
// in app.js instead.
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
