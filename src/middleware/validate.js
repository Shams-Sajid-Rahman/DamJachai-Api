/**
 * Validates req.params, req.query and req.body with zod schemas.
 * The parsed (typed and coerced) values are put on req.valid.params, req.valid.query and req.valid.body.
 * (req.query is read-only in Express 5, so it is not overwritten.)
 * A ZodError goes to the central error handler, which returns a 400.
 */
export function validate(schemas) {
  return (req, res, next) => {
    req.valid = req.valid || {};
    for (const key of ['params', 'query', 'body']) {
      if (schemas[key]) {
        req.valid[key] = schemas[key].parse(req[key] ?? {});
      }
    }
    next();
  };
}
