import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { csvUpload } from '../../middleware/upload.js';
import { ApiError } from '../../utils/ApiError.js';
import { idParam } from '../../validators/common.js';
import * as v from '../../validators/admin.validators.js';
import * as catalog from '../../services/admin/catalog.admin.service.js';
import * as labs from '../../services/admin/labs.admin.service.js';
import * as tests from '../../services/admin/tests.admin.service.js';
import * as prices from '../../services/admin/prices.admin.service.js';
import * as importer from '../../services/admin/import.admin.service.js';
import * as users from '../../services/admin/users.admin.service.js';
import * as moderation from '../../services/admin/moderation.admin.service.js';
import * as dashboard from '../../services/admin/dashboard.admin.service.js';

const router = Router();

// Every /api/admin route requires a logged-in admin. Admin data is never cached.
router.use(requireAuth, requireRole('admin'), (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Small handler factories, so each route stays one line.
const list = (fn) => async (req, res) => res.json(await fn(req.valid.query));
const one = (fn) => async (req, res) => res.json({ data: await fn(req.valid.params.id) });
const create = (fn) => async (req, res) => res.status(201).json({ data: await fn(req.user.id, req.valid.body) });
const update = (fn) => async (req, res) => res.json({ data: await fn(req.user.id, req.valid.params.id, req.valid.body) });
const remove = (fn) => async (req, res) => res.json({ data: await fn(req.user.id, req.valid.params.id) });
const act = (fn) => async (req, res) => res.json({ data: await fn(req.user.id, req.valid.params.id, req.valid.body || {}) });

const byId = { params: idParam };

/** Registers the standard list, get, create, update and delete routes for a resource. */
function crud(path, { listFn, listQuery, getFn, createFn, createBody, updateFn, updateBody, deleteFn }) {
  router.get(path, validate({ query: listQuery }), list(listFn));
  if (getFn) router.get(`${path}/:id`, validate(byId), one(getFn));
  router.post(path, validate({ body: createBody }), create(createFn));
  router.patch(`${path}/:id`, validate({ ...byId, body: updateBody }), update(updateFn));
  router.delete(`${path}/:id`, validate(byId), remove(deleteFn));
}

// Dashboard and lookups
router.get('/', (req, res) => res.json({ ok: true, admin: { id: req.user.id, name: req.user.name } }));
router.get('/dashboard', async (req, res) => res.json({ data: await dashboard.getDashboard() }));
router.get('/options', async (req, res) => res.json({ data: await dashboard.getOptions() }));

// Locations and categories
crud('/cities', {
  listFn: catalog.listCities, listQuery: v.simpleListQuery,
  createFn: catalog.createCity, createBody: v.cityCreate,
  updateFn: catalog.updateCity, updateBody: v.cityUpdate, deleteFn: catalog.deleteCity,
});
crud('/areas', {
  listFn: catalog.listAreas, listQuery: v.simpleListQuery,
  createFn: catalog.createArea, createBody: v.areaCreate,
  updateFn: catalog.updateArea, updateBody: v.areaUpdate, deleteFn: catalog.deleteArea,
});
crud('/categories', {
  listFn: catalog.listCategories, listQuery: v.simpleListQuery,
  createFn: catalog.createCategory, createBody: v.categoryCreate,
  updateFn: catalog.updateCategory, updateBody: v.categoryUpdate, deleteFn: catalog.deleteCategory,
});

// Labs and tests
crud('/labs', {
  listFn: labs.listLabs, listQuery: v.labListQuery, getFn: labs.getLab,
  createFn: labs.createLab, createBody: v.labCreate,
  updateFn: labs.updateLab, updateBody: v.labUpdate, deleteFn: labs.deleteLab,
});
crud('/tests', {
  listFn: tests.listTests, listQuery: v.testListQuery, getFn: tests.getTest,
  createFn: tests.createTest, createBody: v.testCreate,
  updateFn: tests.updateTest, updateBody: v.testUpdate, deleteFn: tests.deleteTest,
});

// Lab prices. The import routes are registered before /:id.
router.get('/lab-tests/import/template', (req, res) => {
  res.type('text/csv').attachment('damjachai-price-import-template.csv').send(importer.CSV_TEMPLATE);
});
router.post('/lab-tests/import', csvUpload, validate({ body: v.importBody }), async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Attach a CSV file in the "file" field');
  if (!req.valid.body.confirm) {
    return res.json({ data: { confirmed: false, ...(await importer.buildPreview(req.file.buffer)) } });
  }
  const { applied, preview } = await importer.applyImport(req.user.id, req.file.buffer, { fileName: req.file.originalname });
  res.status(201).json({ data: { confirmed: true, applied, ...preview } });
});
router.post('/lab-tests/:id/verify', validate(byId), remove(prices.verifyLabTest));
crud('/lab-tests', {
  listFn: prices.listLabTests, listQuery: v.labTestListQuery, getFn: prices.getLabTest,
  createFn: prices.createLabTest, createBody: v.labTestCreate,
  updateFn: prices.updateLabTest, updateBody: v.labTestUpdate, deleteFn: prices.deleteLabTest,
});

// Users
router.get('/users', validate({ query: v.userListQuery }), list(users.listUsers));
router.patch('/users/:id/role', validate({ ...byId, body: v.userRoleBody }), async (req, res) =>
  res.json({ data: await users.changeRole(req.user.id, req.valid.params.id, req.valid.body.role) }));
router.patch('/users/:id/status', validate({ ...byId, body: v.userStatusBody }), async (req, res) =>
  res.json({ data: await users.changeStatus(req.user.id, req.valid.params.id, req.valid.body.isActive) }));

// Moderation: reviews
router.get('/reviews', validate({ query: v.moderationListQuery }), list(moderation.listReviews));
router.post('/reviews/:id/approve', validate({ ...byId, body: v.moderationNoteBody }), act(moderation.approveReview));
router.post('/reviews/:id/reject', validate({ ...byId, body: v.moderationNoteBody }), act(moderation.rejectReview));
router.delete('/reviews/:id', validate(byId), remove(moderation.deleteReview));

// Moderation: price reports
router.get('/price-reports', validate({ query: v.moderationListQuery }), list(moderation.listPriceReports));
router.post('/price-reports/:id/approve', validate({ ...byId, body: v.approveReportBody }), act(moderation.approvePriceReport));
router.post('/price-reports/:id/reject', validate({ ...byId, body: v.moderationNoteBody }), act(moderation.rejectPriceReport));

// Audit log
router.get('/audit-logs', validate({ query: v.auditListQuery }), list(dashboard.listAuditLogs));
router.get('/audit-logs/facets', async (req, res) => res.json({ data: await dashboard.auditFacets() }));

export default router;
