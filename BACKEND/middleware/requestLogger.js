export function requestLogger(req, _res, next) {
  const started = Date.now();
  _res.on("finish", () => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${_res.statusCode} ${Date.now() - started}ms`);
  });
  next();
}
